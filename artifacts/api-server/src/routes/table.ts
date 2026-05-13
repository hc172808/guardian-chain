import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import * as schema from "@workspace/db/schema";
import {
  sql,
  eq,
  ne,
  gt,
  lt,
  gte,
  lte,
  like,
  ilike,
  inArray,
  isNull,
  isNotNull,
  and,
  desc,
  asc,
  type SQL,
} from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

const router = Router();

// Tables readable without authentication (public blockchain data)
const PUBLIC_READ_TABLES = new Set([
  "authorities",
  "documentation",
  "feature_toggles",
  "network_validators",
  "token_launches",
  "token_price",
  "tokens",
]);

// Tables that require authentication to read
const AUTH_READ_TABLES = new Set([
  "contract_templates",
  "faucet_claims",
  "liquidity_pools",
  "node_installations",
  "profiles",
  "smart_contracts",
  "token_operations",
  "token_price_alerts",
  "token_watchlist",
  "transactions",
  "validator_delegations",
  "wallets",
]);

// Tables that require admin/founder role to read
const ADMIN_READ_TABLES = new Set([
  "admin_config",
  "ai_security_events",
  "audit_logs",
  "ddos_protection",
  "fail2ban_jails",
  "firewall_rules",
  "ip_access_list",
  "rate_limit_rules",
  "user_roles",
]);

// All writable tables require authentication; admin tables require admin role
const ADMIN_WRITE_TABLES = new Set([
  "admin_config",
  "ai_security_events",
  "audit_logs",
  "authorities",
  "contract_templates",
  "ddos_protection",
  "fail2ban_jails",
  "feature_toggles",
  "firewall_rules",
  "ip_access_list",
  "network_validators",
  "rate_limit_rules",
  "token_price",
  "user_roles",
]);

const ALL_TABLES = new Set([
  ...PUBLIC_READ_TABLES,
  ...AUTH_READ_TABLES,
  ...ADMIN_READ_TABLES,
]);

type DrizzleTable = PgTable & Record<string, unknown>;

const tableMap: Record<string, DrizzleTable> = {
  admin_config: schema.adminConfigTable as DrizzleTable,
  ai_security_events: schema.aiSecurityEventsTable as DrizzleTable,
  audit_logs: schema.auditLogsTable as DrizzleTable,
  authorities: schema.authoritiesTable as DrizzleTable,
  contract_templates: schema.contractTemplatesTable as DrizzleTable,
  ddos_protection: schema.ddosProtectionTable as DrizzleTable,
  documentation: schema.documentationTable as DrizzleTable,
  fail2ban_jails: schema.fail2banJailsTable as DrizzleTable,
  faucet_claims: schema.faucetClaimsTable as DrizzleTable,
  feature_toggles: schema.featureTogglesTable as DrizzleTable,
  firewall_rules: schema.firewallRulesTable as DrizzleTable,
  ip_access_list: schema.ipAccessListTable as DrizzleTable,
  liquidity_pools: schema.liquidityPoolsTable as DrizzleTable,
  network_validators: schema.networkValidatorsTable as DrizzleTable,
  node_installations: schema.nodeInstallationsTable as DrizzleTable,
  profiles: schema.profilesTable as DrizzleTable,
  rate_limit_rules: schema.rateLimitRulesTable as DrizzleTable,
  smart_contracts: schema.smartContractsTable as DrizzleTable,
  token_launches: schema.tokenLaunchesTable as DrizzleTable,
  token_operations: schema.tokenOperationsTable as DrizzleTable,
  token_price: schema.tokenPriceTable as DrizzleTable,
  token_price_alerts: schema.tokenPriceAlertsTable as DrizzleTable,
  token_watchlist: schema.tokenWatchlistTable as DrizzleTable,
  tokens: schema.tokensTable as DrizzleTable,
  transactions: schema.transactionsTable as DrizzleTable,
  user_roles: schema.userRolesTable as DrizzleTable,
  validator_delegations: schema.validatorDelegationsTable as DrizzleTable,
  wallets: schema.walletsTable as DrizzleTable,
};

// ----- Auth helpers -----

function isAuthenticated(req: Request): boolean {
  const { userId } = getAuth(req);
  return !!userId;
}

function isAdmin(req: Request): boolean {
  const { sessionClaims } = getAuth(req);
  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
  return role === "admin" || role === "founder";
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// Check read access for a table
function checkReadAccess(tableName: string, req: Request, res: Response): boolean {
  if (PUBLIC_READ_TABLES.has(tableName)) return true;
  if (AUTH_READ_TABLES.has(tableName)) {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: "Authentication required" });
      return false;
    }
    return true;
  }
  if (ADMIN_READ_TABLES.has(tableName)) {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: "Authentication required" });
      return false;
    }
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Admin access required" });
      return false;
    }
    return true;
  }
  res.status(403).json({ error: "Table not allowed" });
  return false;
}

// Check write access for a table (all writes require auth; admin tables require admin)
function checkWriteAccess(tableName: string, req: Request, res: Response): boolean {
  if (!ALL_TABLES.has(tableName)) {
    res.status(403).json({ error: "Table not allowed" });
    return false;
  }
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  if (ADMIN_WRITE_TABLES.has(tableName) && !isAdmin(req)) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

// ----- Filter parsing -----

type FilterOp = "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "like" | "ilike" | "in" | "is";

interface ParsedFilter {
  col: string;
  op: FilterOp;
  val: unknown;
}

const VALID_OPS: ReadonlySet<string> = new Set(["eq", "neq", "gt", "lt", "gte", "lte", "like", "ilike", "in", "is"]);

function parseFilters(query: Record<string, unknown>): ParsedFilter[] {
  const filters: ParsedFilter[] = [];
  for (const [key, rawVal] of Object.entries(query)) {
    const match = key.match(/^_filter_(\w+)$/);
    if (!match) continue;
    const op = match[1];
    if (!VALID_OPS.has(op)) continue;
    const rawStr = String(rawVal);
    const colonIdx = rawStr.indexOf(":");
    if (colonIdx === -1) continue;
    const col = rawStr.slice(0, colonIdx);
    // col must be alphanumeric + underscore only to prevent injection
    if (!/^\w+$/.test(col)) continue;
    let val: unknown;
    try {
      val = JSON.parse(rawStr.slice(colonIdx + 1));
    } catch {
      val = rawStr.slice(colonIdx + 1);
    }
    filters.push({ col, op: op as FilterOp, val });
  }
  return filters;
}

function applyFilters(table: DrizzleTable, filters: ParsedFilter[]): SQL[] {
  return filters.map(({ col, op, val }) => {
    const column = table[col];
    if (!column) return sql`true`;
    switch (op) {
      case "eq":  return val === null ? isNull(column as SQL) : eq(column as SQL, val);
      case "neq": return val === null ? isNotNull(column as SQL) : ne(column as SQL, val);
      case "gt":  return gt(column as SQL, val);
      case "lt":  return lt(column as SQL, val);
      case "gte": return gte(column as SQL, val);
      case "lte": return lte(column as SQL, val);
      case "like":  return like(column as SQL, val as string);
      case "ilike": return ilike(column as SQL, val as string);
      case "in":  return inArray(column as SQL, Array.isArray(val) ? val : [val]);
      case "is":  return val === null ? isNull(column as SQL) : eq(column as SQL, val);
      default:    return sql`true`;
    }
  });
}

// ----- Routes -----

router.get("/table/:table", async (req: Request, res: Response) => {
  const tableName = req.params.table;
  if (!checkReadAccess(tableName, req, res)) return;

  const table = tableMap[tableName];
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }

  const query = req.query as Record<string, string>;
  const { _order, _asc, _limit, _offset } = query;
  const filters = parseFilters(query);
  const filterConditions = applyFilters(table, filters);

  try {
    let q = db.select().from(table);
    if (filterConditions.length > 0) {
      q = q.where(and(...filterConditions)) as typeof q;
    }
    if (_order && /^\w+$/.test(_order)) {
      const col = table[_order];
      if (col) {
        q = q.orderBy(_asc === "true" ? asc(col as SQL) : desc(col as SQL)) as typeof q;
      }
    }
    if (_limit) {
      const limit = parseInt(_limit, 10);
      if (!isNaN(limit) && limit > 0 && limit <= 1000) {
        q = q.limit(limit) as typeof q;
      }
    }
    if (_offset) {
      const offset = parseInt(_offset, 10);
      if (!isNaN(offset) && offset >= 0) {
        q = q.offset(offset) as typeof q;
      }
    }
    const data = await q;
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Query error";
    res.status(500).json({ error: msg });
  }
});

router.post("/table/:table", requireAuth, async (req: Request, res: Response) => {
  const tableName = req.params.table;
  if (!checkWriteAccess(tableName, req, res)) return;

  const table = tableMap[tableName];
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }

  const query = req.query as Record<string, string>;
  const { _op } = query;
  const body: unknown = req.body;

  try {
    const rows = Array.isArray(body) ? body : [body];
    if (_op === "upsert") {
      const data = await db.insert(table).values(rows).onConflictDoNothing().returning();
      res.json(data);
      return;
    }
    const data = await db.insert(table).values(rows).returning();
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Insert error";
    res.status(500).json({ error: msg });
  }
});

router.patch("/table/:table", requireAuth, async (req: Request, res: Response) => {
  const tableName = req.params.table;
  if (!checkWriteAccess(tableName, req, res)) return;

  const table = tableMap[tableName];
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }

  const filters = parseFilters(req.query as Record<string, string>);
  if (filters.length === 0) {
    res.status(400).json({ error: "At least one filter is required for updates" });
    return;
  }
  const filterConditions = applyFilters(table, filters);

  try {
    const data = await db.update(table)
      .set(req.body as Record<string, unknown>)
      .where(and(...filterConditions))
      .returning();
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Update error";
    res.status(500).json({ error: msg });
  }
});

router.delete("/table/:table", requireAuth, async (req: Request, res: Response) => {
  const tableName = req.params.table;
  if (!checkWriteAccess(tableName, req, res)) return;

  const table = tableMap[tableName];
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }

  const filters = parseFilters(req.query as Record<string, string>);
  if (filters.length === 0) {
    res.status(400).json({ error: "At least one filter is required for deletes" });
    return;
  }
  const filterConditions = applyFilters(table, filters);

  try {
    const data = await db.delete(table)
      .where(and(...filterConditions))
      .returning();
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Delete error";
    res.status(500).json({ error: msg });
  }
});

export default router;
