---
name: DB snapshot vs actual DB drift
description: shared/schema.ts (Drizzle) can define columns that don't exist in the live Postgres table, causing silent insert/update failures.
---

drizzle-kit push requires an interactive TTY (rename/conflict prompts) and fails non-interactively in this environment — no `--force`/`--yes` flag works, and no pty tool (script/expect/python3) is available. Workaround: apply the SQL files already checked into `migrations/*.sql` directly with `psql "$DATABASE_URL" -f migrations/000N_*.sql` in order.

**Why:** Even after applying those migration files, the live table can still lag behind `shared/schema.ts` (e.g. `node_installations` was missing `ip_address`, `hostname`, `rpc_port` even though the schema and insert code referenced them) — inserts fail with "Failed query: insert into ..." and are swallowed by try/catch logging, so features look silently broken (e.g. "nodes not starting") with no error surfaced to the user.

**How to apply:** When a feature silently fails with no user-visible error, check the workflow logs for "insert failed" / "Failed query" lines, compare the failing column list against `\d tablename` in psql, and patch with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for any column present in `shared/schema.ts` but missing from the live DB.
