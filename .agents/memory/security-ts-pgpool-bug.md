---
name: security.ts pgPool bug
description: (storage as any).pgPool pattern in server/security.ts is always undefined — use the real db pool import instead.
---

`server/storage.ts` never attaches `pgPool` to the exported `storage` object (it's a module-local `const pgPool = new Pool(...)`). Any code that does `(storage as any).pgPool` gets `undefined` silently — no error, all queries are skipped via `if (!pool) return`.

This previously broke `ip_bans`, `login_failures`, and (initially) `login_lockouts` table creation and all their read/write helpers in `server/security.ts` — the tables never existed, so bans/lockouts silently never persisted.

**Fix:** import the real pool directly: `import { pool as pgConnPool } from "./db";` and use `pgConnPool` instead of `(storage as any).pgPool`.

**How to apply:** Whenever adding new DB-backed logic to `server/security.ts` (or any file that isn't `storage.ts` itself), never reach for `(storage as any).pgPool` — always import `{ pool }` from `./db` directly. Verify new tables actually appear via `psql "$DATABASE_URL" -c "\dt"` after restart, don't just trust that `initXTable()` ran without throwing.
