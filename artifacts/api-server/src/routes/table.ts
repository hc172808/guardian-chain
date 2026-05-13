import { Router } from "express";
import { db } from "@workspace/db";
import * as schema from "@workspace/db/schema";
import { sql, eq, ne, gt, lt, gte, lte, like, ilike, inArray, isNull, isNotNull, and, desc, asc } from "drizzle-orm";

const router = Router();

// Allowed tables whitelist for security
const ALLOWED_TABLES = new Set([
  "admin_config","ai_security_events","audit_logs","authorities",
  "contract_templates","ddos_protection","documentation","fail2ban_jails",
  "faucet_claims","feature_toggles","firewall_rules","ip_access_list",
  "liquidity_pools","network_validators","node_installations","profiles",
  "rate_limit_rules","smart_contracts","token_launches","token_operations",
  "token_price","token_price_alerts","token_watchlist","tokens","transactions",
  "user_roles","validator_delegations","wallets",
]);

// Map table name -> drizzle table object
const tableMap: Record<string, any> = {
  admin_config: schema.adminConfigTable,
  ai_security_events: schema.aiSecurityEventsTable,
  audit_logs: schema.auditLogsTable,
  authorities: schema.authoritiesTable,
  contract_templates: schema.contractTemplatesTable,
  ddos_protection: schema.ddosProtectionTable,
  documentation: schema.documentationTable,
  fail2ban_jails: schema.fail2banJailsTable,
  faucet_claims: schema.faucetClaimsTable,
  feature_toggles: schema.featureTogglesTable,
  firewall_rules: schema.firewallRulesTable,
  ip_access_list: schema.ipAccessListTable,
  liquidity_pools: schema.liquidityPoolsTable,
  network_validators: schema.networkValidatorsTable,
  node_installations: schema.nodeInstallationsTable,
  profiles: schema.profilesTable,
  rate_limit_rules: schema.rateLimitRulesTable,
  smart_contracts: schema.smartContractsTable,
  token_launches: schema.tokenLaunchesTable,
  token_operations: schema.tokenOperationsTable,
  token_price: schema.tokenPriceTable,
  token_price_alerts: schema.tokenPriceAlertsTable,
  token_watchlist: schema.tokenWatchlistTable,
  tokens: schema.tokensTable,
  transactions: schema.transactionsTable,
  user_roles: schema.userRolesTable,
  validator_delegations: schema.validatorDelegationsTable,
  wallets: schema.walletsTable,
};

const applyFilters = (table: any, filters: Array<{ col: string; op: string; val: any }>) => {
  return filters.map(({ col, op, val }) => {
    const column = table[col];
    if (!column) return sql`true`;
    switch (op) {
      case "eq": return val === null ? isNull(column) : eq(column, val);
      case "neq": return val === null ? isNotNull(column) : ne(column, val);
      case "gt": return gt(column, val);
      case "lt": return lt(column, val);
      case "gte": return gte(column, val);
      case "lte": return lte(column, val);
      case "like": return like(column, val);
      case "ilike": return ilike(column, val);
      case "in": return inArray(column, Array.isArray(val) ? val : [val]);
      case "is": return val === null ? isNull(column) : eq(column, val);
      default: return sql`true`;
    }
  });
};

const parseFilters = (query: Record<string, any>) => {
  const filters: Array<{ col: string; op: string; val: any }> = [];
  for (const [key, rawVal] of Object.entries(query)) {
    const match = key.match(/^_filter_(\w+)$/);
    if (!match) continue;
    const op = match[1];
    // rawVal format: "col:jsonValue"
    const colonIdx = String(rawVal).indexOf(":");
    if (colonIdx === -1) continue;
    const col = String(rawVal).slice(0, colonIdx);
    let val: any;
    try { val = JSON.parse(String(rawVal).slice(colonIdx + 1)); } catch { val = String(rawVal).slice(colonIdx + 1); }
    filters.push({ col, op, val });
  }
  return filters;
};

router.get("/table/:table", async (req, res) => {
  const tableName = req.params.table;
  if (!ALLOWED_TABLES.has(tableName)) {
    return res.status(403).json({ error: "Table not allowed" });
  }
  const table = tableMap[tableName];
  if (!table) return res.status(404).json({ error: "Table not found" });

  const { _order, _asc, _limit, _offset } = req.query as any;
  const filters = parseFilters(req.query as any);
  const filterConditions = applyFilters(table, filters);

  try {
    let q = db.select().from(table);
    if (filterConditions.length > 0) {
      // @ts-ignore
      q = q.where(and(...filterConditions));
    }
    if (_order) {
      const col = table[_order as string];
      if (col) {
        // @ts-ignore
        q = q.orderBy(_asc === "true" ? asc(col) : desc(col));
      }
    }
    if (_limit) {
      // @ts-ignore
      q = q.limit(Number(_limit));
    }
    if (_offset) {
      // @ts-ignore
      q = q.offset(Number(_offset));
    }
    const data = await q;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/table/:table", async (req, res) => {
  const tableName = req.params.table;
  if (!ALLOWED_TABLES.has(tableName)) return res.status(403).json({ error: "Table not allowed" });
  const table = tableMap[tableName];
  if (!table) return res.status(404).json({ error: "Table not found" });

  const { _op } = req.query as any;
  const body = req.body;

  try {
    if (_op === "upsert") {
      const rows = Array.isArray(body) ? body : [body];
      const data = await db.insert(table).values(rows).onConflictDoNothing().returning();
      return res.json(data);
    }
    const rows = Array.isArray(body) ? body : [body];
    const data = await db.insert(table).values(rows).returning();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/table/:table", async (req, res) => {
  const tableName = req.params.table;
  if (!ALLOWED_TABLES.has(tableName)) return res.status(403).json({ error: "Table not allowed" });
  const table = tableMap[tableName];
  if (!table) return res.status(404).json({ error: "Table not found" });

  const filters = parseFilters(req.query as any);
  const filterConditions = applyFilters(table, filters);

  try {
    let q = db.update(table).set(req.body);
    if (filterConditions.length > 0) {
      // @ts-ignore
      q = q.where(and(...filterConditions));
    }
    // @ts-ignore
    const data = await q.returning();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/table/:table", async (req, res) => {
  const tableName = req.params.table;
  if (!ALLOWED_TABLES.has(tableName)) return res.status(403).json({ error: "Table not allowed" });
  const table = tableMap[tableName];
  if (!table) return res.status(404).json({ error: "Table not found" });

  const filters = parseFilters(req.query as any);
  const filterConditions = applyFilters(table, filters);

  try {
    let q = db.delete(table);
    if (filterConditions.length > 0) {
      // @ts-ignore
      q = q.where(and(...filterConditions));
    }
    // @ts-ignore
    const data = await q.returning();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
