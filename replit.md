# ChainCore — GYDS Blockchain Network Dashboard

## Overview
A full-stack blockchain ecosystem dashboard for the GYDS network. Features an explorer, validator dashboard, DeFi tools, wallet management, token launchpad, node installation management, and an admin panel.

## Architecture
- **Frontend** — Vite + React + TypeScript SPA (port 5000 in dev, served statically in production)
- **Backend** — Express.js server with Passport.js session auth (port 5001)
- **Database** — Replit PostgreSQL via Drizzle ORM (`pg` driver, `DATABASE_URL` env var)
- **Auth** — Custom username/password + Web3 wallet signature auth via Passport.js sessions
- **Styling** — Tailwind CSS + shadcn/ui component library
- **State** — TanStack React Query + React context (AuthContext)
- **Blockchain** — Chain ID 198282, domain `netlifegy.com`

## Key Directories
- `src/pages/` — top-level route pages (Admin, Auth, Explorer, Wallet, DeFi, Tokens, etc.)
- `src/components/` — feature-scoped components (admin, dashboard, defi, mining, node, token, validators, wallet, wireguard)
- `src/integrations/supabase/client.ts` — Supabase compatibility shim (routes all calls to Express API — no real Supabase connection needed)
- `src/config/` — blockchain network config (RPC endpoints, tokenomics, wallet addresses)
- `src/hooks/` — custom hooks (WebSocket, wallet connect, transaction notifications)
- `server/` — Express server (index.ts, auth.ts, routes.ts, storage.ts, db.ts, seed.ts)
- `shared/schema.ts` — Drizzle ORM schema (source of truth for all DB tables)
- `public/docker/` — Docker files and Compose configs for node deployment
- `public/scripts/` — Bash scripts for node setup, SSL, and deployment

## Environment Variables
Set automatically by Replit:
- `DATABASE_URL` — PostgreSQL connection string (Replit managed)
- `SESSION_SECRET` — Express session secret

## Development
- **Run:** `npm run dev` (starts Express server on 5001 + Vite dev server on 5000)
- **Build:** `npm run build`
- **DB Schema:** `npm run db:push` (apply schema changes)

## Infrastructure diagnostics
- **Dashboard/API + database + RPC + peers:** `bash scripts/diagnose-infrastructure.sh`
- **Check a specific peer:** `bash scripts/diagnose-infrastructure.sh --peer HOST:PORT`
- **Open a node's P2P port:** `sudo bash scripts/configure-gyds-firewall.sh --p2p-port PORT`

The diagnostic is read-only and reports when the security challenge endpoint is
returning HTML, an HTTP error, or valid JSON. It also runs repeated PostgreSQL
probes to distinguish a database disconnect from a frontend routing problem.
The firewall helper only opens the explicitly supplied TCP/UDP P2P port; it
never opens RPC ports automatically.

## Default Accounts
Created automatically on first boot (override with env vars `FOUNDER_PASSWORD` / `ADMIN_PASSWORD`):

| Role | Username | Password |
|------|----------|----------|
| Founder | `founder` | `password` |
| Admin | `admin` | `password` |

## User Roles
Three roles in `user_roles` table: `user`, `admin`, `founder`

## User Preferences
- Preserve existing code structure and patterns
- Use Drizzle ORM for all database operations
- Keep the Supabase shim in place (routes to Express API, no real Supabase needed)
- IP blocking/banning is disabled by default (see "Security / IP handling" below) — do not silently re-enable it.
- The user has an existing WireGuard server. When setting up a server that needs VPN access, ask for the WireGuard client/server details; if they are not available, skip VPN configuration so the user can add it later.

## Security / IP handling
- IP-block **enforcement** is OFF by default (`server/security.ts` `ipBlockEnabled = false`, persisted in `admin_config.ip_block_enforcement`). Detection/logging (firewall stats, honeypot/UA/payload flags, login-failure counters) still runs for monitoring, but no request is ever rejected with a 403/429 IP ban while this is off.
- Every successful login (password or wallet, any role) auto-adds the user's current IP to the `ip_whitelist` table (`server/security.ts` `addIpToWhitelist`, called from `server/auth.ts`). Whitelisted IPs bypass firewall/ban checks entirely but stay monitored (`last_seen_at`/`login_count` keep updating).
- To re-enable IP-block enforcement later, call `setIpBlockEnforcement(true)` (exported from `server/security.ts`) or set `admin_config.ip_block_enforcement.enabled = true`.
