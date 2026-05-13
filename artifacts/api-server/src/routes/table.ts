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

// ── Audit log helper ─────────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  "encrypted_seed", "pin_hash", "password", "secret", "private_key", "key",
  "token", "api_key", "api_secret",
]);

function redactSensitive(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? "[REDACTED]" : redactSensitive(v);
  }
  return out;
}

async function writeAuditLog({
  userId,
  action,
  targetType,
  targetId,
  details,
  ipAddress,
}: {
  userId: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: unknown;
  ipAddress?: string;
}): Promise<void> {
  try {
    await db.insert(schema.auditLogsTable).values({
      user_id: userId,
      action,
      category: "admin",
      target_type: targetType,
      target_id: targetId ?? null,
      details: redactSensitive(details) as Record<string, unknown>,
      ip_address: ipAddress ?? null,
    });
  } catch {
    // Audit log failures must never break the primary operation
  }
}

const PUBLIC_READ_TABLES = new Set([
  "authorities",
  "documentation",
  "feature_toggles",
  "network_validators",
  "token_launches",
  "token_price",
  "tokens",
]);

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
  "liquidity_pools",
  "network_validators",
  "rate_limit_rules",
  "token_launches",
  "token_operations",
  "token_price",
  "tokens",
  "user_roles",
]);

// Tables where every row is owned by a user via the user_id column.
// Reads are scoped to the caller's userId; writes inject/enforce user_id.
const USER_OWNED_TABLES = new Set([
  "faucet_claims",
  "node_installations",
  "profiles",
  "smart_contracts",
  "token_price_alerts",
  "token_watchlist",
  "transactions",
  "validator_delegations",
  "wallets",
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

function isAuthenticated(req: Request): boolean {
  const { userId } = getAuth(req);
  return !!userId;
}

function getCallerUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
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

type FilterOp = "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "like" | "ilike" | "in" | "is";

interface ParsedFilter {
  col: string;
  op: FilterOp;
  val: unknown;
}

const VALID_OPS: ReadonlySet<string> = new Set([
  "eq", "neq", "gt", "lt", "gte", "lte", "like", "ilike", "in", "is",
]);

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
      case "eq":    return val === null ? isNull(column as SQL) : eq(column as SQL, val);
      case "neq":   return val === null ? isNotNull(column as SQL) : ne(column as SQL, val);
      case "gt":    return gt(column as SQL, val);
      case "lt":    return lt(column as SQL, val);
      case "gte":   return gte(column as SQL, val);
      case "lte":   return lte(column as SQL, val);
      case "like":  return like(column as SQL, val as string);
      case "ilike": return ilike(column as SQL, val as string);
      case "in":    return inArray(column as SQL, Array.isArray(val) ? val : [val]);
      case "is":    return val === null ? isNull(column as SQL) : eq(column as SQL, val);
      default:      return sql`true`;
    }
  });
}

// GET /table/:table
router.get("/table/:table", async (req: Request, res: Response) => {
  const tableName = req.params.table;
  if (!checkReadAccess(tableName, req, res)) return;

  const table = tableMap[tableName];
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }

  const query = req.query as Record<string, string>;
  const { _order, _asc, _limit, _offset } = query;
  const filters = parseFilters(query);

  // For user-owned tables, non-admins see only their own rows
  if (USER_OWNED_TABLES.has(tableName) && !isAdmin(req)) {
    const userId = getCallerUserId(req);
    if (userId && table["user_id"]) {
      filters.push({ col: "user_id", op: "eq", val: userId });
    }
  }

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

// POST /table/:table  (insert or upsert)
router.post("/table/:table", requireAuth, async (req: Request, res: Response) => {
  const tableName = req.params.table;
  if (!checkWriteAccess(tableName, req, res)) return;

  const table = tableMap[tableName];
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }

  const query = req.query as Record<string, string>;
  const { _op, _on_conflict } = query;
  const body: unknown = req.body;
  const userId = getCallerUserId(req);

  // Inject user_id for user-owned tables so callers cannot spoof ownership
  const injectUserId = (row: Record<string, unknown>): Record<string, unknown> => {
    if (USER_OWNED_TABLES.has(tableName) && userId && table["user_id"]) {
      return { ...row, user_id: userId };
    }
    return row;
  };

  // ── Faucet 24-hour duplicate-claim guard ──────────────────────────────────
  if (tableName === "faucet_claims" && userId) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rawBody = Array.isArray(body) ? body[0] : body;
    const walletAddress = (rawBody as Record<string, unknown>)?.wallet_address as string | undefined;

    const userFilter = gt(schema.faucetClaimsTable.claimed_at, cutoff);
    const existing = await db
      .select({ id: schema.faucetClaimsTable.id, claimed_at: schema.faucetClaimsTable.claimed_at })
      .from(schema.faucetClaimsTable)
      .where(
        and(
          eq(schema.faucetClaimsTable.user_id, userId),
          userFilter,
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const nextAt = new Date(existing[0].claimed_at.getTime() + 24 * 60 * 60 * 1000);
      res.status(429).json({
        error: "You have already claimed in the last 24 hours.",
        next_available_at: nextAt.toISOString(),
      });
      return;
    }

    // Also guard by wallet address to prevent multi-account abuse
    if (walletAddress) {
      const walletExisting = await db
        .select({ id: schema.faucetClaimsTable.id, claimed_at: schema.faucetClaimsTable.claimed_at })
        .from(schema.faucetClaimsTable)
        .where(
          and(
            eq(schema.faucetClaimsTable.wallet_address, walletAddress),
            gt(schema.faucetClaimsTable.claimed_at, cutoff),
          )
        )
        .limit(1);

      if (walletExisting.length > 0) {
        const nextAt = new Date(walletExisting[0].claimed_at.getTime() + 24 * 60 * 60 * 1000);
        res.status(429).json({
          error: "This wallet has already claimed in the last 24 hours.",
          next_available_at: nextAt.toISOString(),
        });
        return;
      }
    }
  }

  try {
    const rawRows = Array.isArray(body) ? body : [body];
    const rows = rawRows.map((r) => injectUserId(r as Record<string, unknown>));

    if (_op === "upsert") {
      // _on_conflict is a comma-separated list of conflict target columns.
      // Fall back to onConflictDoNothing only when no conflict target is provided.
      if (_on_conflict) {
        const conflictCols = _on_conflict.split(",").map((c) => c.trim()).filter((c) => /^\w+$/.test(c));
        const conflictTargets = conflictCols.map((c) => table[c]).filter(Boolean);
        if (conflictTargets.length > 0) {
          const allKeys = Object.keys(rows[0] ?? {});
          const setValues: Record<string, SQL> = {};
          for (const key of allKeys) {
            if (table[key]) {
              setValues[key] = sql`excluded.${sql.identifier(key)}`;
            }
          }
          const data = await db
            .insert(table)
            .values(rows)
            .onConflictDoUpdate({ target: conflictTargets as SQL[], set: setValues })
            .returning();
          res.json(data);
          return;
        }
      }
      // No usable conflict target: insert and ignore duplicates
      const data = await db.insert(table).values(rows).onConflictDoNothing().returning();
      res.json(data);
      return;
    }

    const data = await db.insert(table).values(rows).returning();
    // Fire-and-forget audit log for admin mutations
    if (ADMIN_WRITE_TABLES.has(tableName) && userId) {
      const firstId = (data[0] as Record<string, unknown>)?.id as string | undefined;
      void writeAuditLog({
        userId,
        action: _op === "upsert" ? "upsert" : "insert",
        targetType: tableName,
        targetId: firstId,
        details: redactSensitive(rows),
        ipAddress: req.ip,
      });
    }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Insert error";
    res.status(500).json({ error: msg });
  }
});

// PATCH /table/:table  (update)
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

  // For user-owned tables, non-admins can only update their own rows
  if (USER_OWNED_TABLES.has(tableName) && !isAdmin(req)) {
    const userId = getCallerUserId(req);
    if (userId && table["user_id"]) {
      filters.push({ col: "user_id", op: "eq", val: userId });
    }
  }

  const filterConditions = applyFilters(table, filters);

  // Prevent callers from changing user_id on owned tables
  const updates = req.body as Record<string, unknown>;
  if (USER_OWNED_TABLES.has(tableName) && !isAdmin(req)) {
    delete updates["user_id"];
  }

  const userId = getCallerUserId(req);

  try {
    const data = await db
      .update(table)
      .set(updates)
      .where(and(...filterConditions))
      .returning();
    // Fire-and-forget audit log for admin mutations
    if (ADMIN_WRITE_TABLES.has(tableName) && userId) {
      const firstId = (data[0] as Record<string, unknown>)?.id as string | undefined;
      void writeAuditLog({
        userId,
        action: "update",
        targetType: tableName,
        targetId: firstId,
        details: redactSensitive(updates),
        ipAddress: req.ip,
      });
    }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Update error";
    res.status(500).json({ error: msg });
  }
});

// DELETE /table/:table
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

  // For user-owned tables, non-admins can only delete their own rows
  if (USER_OWNED_TABLES.has(tableName) && !isAdmin(req)) {
    const userId = getCallerUserId(req);
    if (userId && table["user_id"]) {
      filters.push({ col: "user_id", op: "eq", val: userId });
    }
  }

  const filterConditions = applyFilters(table, filters);

  const userId = getCallerUserId(req);

  try {
    const data = await db
      .delete(table)
      .where(and(...filterConditions))
      .returning();
    // Fire-and-forget audit log for admin mutations
    if (ADMIN_WRITE_TABLES.has(tableName) && userId) {
      const firstId = (data[0] as Record<string, unknown>)?.id as string | undefined;
      void writeAuditLog({
        userId,
        action: "delete",
        targetType: tableName,
        targetId: firstId,
        details: { filters: req.query },
        ipAddress: req.ip,
      });
    }
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Delete error";
    res.status(500).json({ error: msg });
  }
});

export default router;
