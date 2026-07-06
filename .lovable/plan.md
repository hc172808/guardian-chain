## Part 1 — Public IP capture on login

**File: `server/security.ts`** — replace `getClientIp` with a proxy-aware resolver:
1. `cf-connecting-ip` (Cloudflare, single value)
2. `x-real-ip` (Nginx)
3. First entry of `x-forwarded-for`
4. `req.ip` / `req.socket.remoteAddress`
Strip IPv6 `::ffff:` prefix, normalize `::1` → `127.0.0.1`, export as the single source of truth.

**File: `server/index.ts`** — add `app.set('trust proxy', true)` so `req.ip` reflects the forwarded chain (Cloudflare + Nginx).

**File: `server/auth.ts`** — on both login handlers (email+password and OAuth callback):
- Resolve public IP via `getClientIp`.
- Store on session: `(req.session as any).ip = ip`.
- Persist last-login IP on the user row (`users.last_login_ip`, `users.last_login_at`) — new columns via a raw-SQL migration in `server/db.ts` bootstrap or a new migration file.
- Write an audit log entry `action: "login"` with `ipAddress: ip`.
- Before checking the password, call the new ban gate (see Part 2). Failed attempts increment a per-IP counter.

## Part 2 — Ban / block by public IP

**New table `ip_bans`** (created idempotently at server startup, mirroring the existing `initX` pattern in `server/storage.ts`):
```sql
CREATE TABLE IF NOT EXISTS ip_bans (
  ip           TEXT PRIMARY KEY,
  reason       TEXT,
  banned_by    UUID,
  banned_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ,        -- NULL = permanent
  auto         BOOLEAN DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS login_failures (
  ip           TEXT NOT NULL,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  email        TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_failures_ip_time ON login_failures(ip, attempted_at);
```

**`server/security.ts` — new middleware `ipBanGate`:**
- Reads client IP.
- `SELECT 1 FROM ip_bans WHERE ip=$1 AND (expires_at IS NULL OR expires_at>NOW())`.
- If hit → `403 { error: "IP address is banned", ip, expires_at }`.
- Cached in-memory for 30 s to avoid a DB hit per request.

**Wire the middleware** in `server/index.ts` immediately after the security headers, so every API request is gated. Login handlers additionally check first (before password verification) to produce the correct 403 message.

**Auto-ban logic in `server/auth.ts`:**
- On failed password: insert into `login_failures`.
- If ≥ 10 failures from same IP in last 15 min → insert into `ip_bans` with `auto=true`, `expires_at = NOW() + 24 h`, `reason='auto: brute force'`.

**Admin endpoints** in `server/routes.ts` (guarded by existing admin middleware):
- `GET  /api/admin/ip-bans` — list current bans.
- `POST /api/admin/ip-bans` — body `{ ip, reason, expiresAt? }`.
- `DELETE /api/admin/ip-bans/:ip` — unban.
- Each writes an audit log entry.

**Admin UI** — extend `src/pages/Admin.tsx` with a "Banned IPs" panel: table + add/remove form. When banning a user, also offer "ban their last-login IP" checkbox that calls the same endpoint using `users.last_login_ip`.

## Part 3 — Full Go source for every localhost node type

Target directory: `public/blockchain-go/` (module `chaincore`). Existing `cmd/{bootnode,fullnode,litenode}` stay. Add new commands and share the packages already in `internal/`.

**New `cmd/` entrypoints** (each ~80–150 LOC, `main.go` only, parsing flags and wiring `internal/*` packages):
- `cmd/validatornode/main.go` — full node + `consensus.PoSEngine` producer role, staking flags.
- `cmd/rpcnode/main.go` — full node + wide-open `internal/rpc` server, no mining.
- `cmd/boostnode/main.go` — full node + `internal/mining.Distributor` pool coordinator.
- `cmd/genesis/main.go` — one-shot genesis writer that emits `genesis.json` + starts a bootstrap validator.
- `cmd/devnode/main.go` — single-process all-in-one (chain + PoS + mining + RPC) for local dev with pre-funded accounts.
- `cmd/localnode/main.go` — same as devnode but binds strictly to `127.0.0.1` and disables peer discovery, matching `install-localnode.sh`.

**Shared config** — add `internal/nodeconfig/config.go` with a tagged struct (`NodeType`, `DataDir`, `ListenAddr`, `RPCPort`, `Bootnodes`, `ChainID=13370`, `Validator{Wallet,Stake,Commission}`, `Mining{Enabled,Threads}`) plus JSON loader + flag binder used by every `cmd/*/main.go`.

**Localhost topology helper** — `internal/network/localhost.go` exposing `LocalPorts()` returning distinct ports per node type (validator 30301/8551, rpc 30302/8552, boost 30303/8553, dev 30304/8554, lite 30305/8555, genesis 30300/8550) so multiple nodes can run side-by-side on one machine.

**`docker-compose.localhost.yml`** in `public/docker/` bringing up all six node binaries against a single Postgres, each on its mapped port, for one-command local testing.

**Install scripts** — update `public/scripts/install-localnode.sh` and `install-devnode.sh` to `go build ./cmd/localnode` / `./cmd/devnode` and install the resulting binaries + systemd units, matching the existing install-* script style.

## Out of scope
No changes to consensus rules, RPC wire format, or DB schema beyond the two new tables and the two new `users` columns. Rate-limiting other than the auto-ban brute-force gate is not added (per workspace policy).
