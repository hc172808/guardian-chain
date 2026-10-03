import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";

// Managed PostgreSQL hosts often use self-signed / private-CA certificates.
// Strip sslmode from the URL (it would override our ssl option) and apply SSL
// explicitly. Set DB_SSL_STRICT=true to require a publicly trusted certificate,
// or DB_SSL=false for a local server without SSL.
function buildConnection() {
  const raw = process.env.DATABASE_URL ?? "";
  let connectionString = raw;
  let wantsSsl = process.env.DB_SSL !== "false";
  try {
    const u = new URL(raw);
    const mode = u.searchParams.get("sslmode");
    if (mode === "disable") wantsSsl = false;
    u.searchParams.delete("sslmode");
    // DB_NAME lets gydschain use its own database on a shared server.
    if (process.env.DB_NAME) u.pathname = "/" + process.env.DB_NAME;
    if (["localhost", "127.0.0.1"].includes(u.hostname) && !mode) wantsSsl = false;
    connectionString = u.toString();
  } catch { /* leave as-is */ }
  const ssl = wantsSsl
    ? { rejectUnauthorized: process.env.DB_SSL_STRICT === "true" }
    : undefined;
  return { connectionString, ssl };
}

const pool = new Pool({
  ...buildConnection(),

  // Pool sizing
  max: 10,
  min: 2,

  // Keep an idle client available between keep-alive checks. The value remains
  // configurable for hosted PostgreSQL providers with shorter idle limits.
  idleTimeoutMillis: Math.max(
    30_000,
    Number(process.env.DB_IDLE_TIMEOUT_MS) || 5 * 60_000,
  ),

  // How long to wait for a connection before throwing (10 s)
  connectionTimeoutMillis: 10_000,

  // TCP keepalive — keeps the underlying socket alive so the DB server
  // doesn't silently drop idle connections mid-session
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

// Log and discard pool-level errors so one bad connection doesn't crash the process.
// The pool automatically creates a new client to replace any that error out.
pool.on("error", (err, _client) => {
  console.error("[db] Idle pool client error — connection will be replaced:", err.message);
});

// Verify connectivity on startup — logs a warning if the DB isn't reachable yet
// but does NOT crash the server (the pool retries on the next query).
pool
  .query("SELECT 1")
  .then(() => console.log("[db] Database connection verified"))
  .catch((err) => console.warn("[db] Startup DB check failed (will retry on first query):", err.message));

export const db = drizzle(pool, { schema });
export { pool };
