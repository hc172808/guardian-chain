import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Pool sizing
  max: 10,
  min: 2,

  // How long a client can sit idle before being closed and removed from pool
  idleTimeoutMillis: 30_000,

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
