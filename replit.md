# ChainCore — GYDS Blockchain Network Dashboard

## Overview
A Vite + React + TypeScript frontend for the GYDS blockchain network. Features an explorer, validator dashboard, DeFi tools, wallet management, token launchpad, node installation management, and an admin panel.

## Architecture
- **Frontend only** — pure Vite/React SPA, no backend server
- **Auth & Database** — Supabase (project: `rmwldjwkyhhaoqehdrbr`) handles authentication, PostgreSQL data, and realtime subscriptions
- **Styling** — Tailwind CSS + shadcn/ui component library
- **State** — TanStack React Query + React context (AuthContext)
- **Blockchain** — Chain ID 13370, domain `netlifegy.com`

## Key Directories
- `src/pages/` — top-level route pages (Admin, Auth, Explorer, Wallet, DeFi, Tokens, etc.)
- `src/components/` — feature-scoped components (admin, dashboard, defi, mining, node, token, validators, wallet, wireguard)
- `src/contexts/AuthContext.tsx` — authentication context using Supabase Auth
- `src/integrations/supabase/` — Supabase client + TypeScript types
- `src/config/` — blockchain network config (RPC endpoints, tokenomics, wallet addresses)
- `src/hooks/` — custom hooks (WebSocket, wallet connect, transaction notifications)
- `public/docker/` — Docker files and Compose configs for node deployment
- `public/scripts/` — Bash scripts for node setup, SSL, and deployment

## Environment Variables
Stored in Replit's environment variable manager (shared):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID

## Development
- **Run:** `npm run dev` (starts Vite dev server on port 5000)
- **Build:** `npm run build` (outputs to `dist/`)

## Deployment
See `DEPLOYMENT.md` for the full deployment guide.

**Dashboard only:**
```bash
DOMAIN=netlifegy.com GYDS_SSL_EMAIL=admin@netlifegy.com \
VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... \
sudo -E bash public/scripts/deploy-dashboard.sh
```

**Full blockchain stack:**
```bash
cp public/scripts/.env.production.template .env.production
# Edit .env.production
docker compose -f public/docker/docker-compose.prod.yml --env-file .env.production up -d
```

## Infrastructure Files
- `public/docker/Dockerfile.node` — Go blockchain node image (requires `blockchain-go/` source at project root)
- `public/docker/Dockerfile.explorer` — Nginx + React app image
- `public/docker/nginx.conf` — Nginx config with CSP, rate limiting, health endpoint
- `public/docker/docker-compose.yml` — Dev/staging stack
- `public/docker/docker-compose.prod.yml` — Production stack
- `public/scripts/install-fullnode.sh` — Ubuntu full node installer (founder-only)
- `public/scripts/install-litenode.sh` — Ubuntu/macOS lite node installer
- `public/scripts/install-node.sh` — Generic node installer (validator/fullnode/rpc/litenode)
- `public/scripts/deploy-dashboard.sh` — Dashboard-only deployment script
- `public/scripts/deploy-remote-fullnode.sh` — Remote node deployment via SSH
- `public/scripts/ssl-setup.sh` — Let's Encrypt SSL setup for all subdomains
- `public/scripts/setup-gydschain.sh` — Database schema setup
- `public/scripts/.env.production.template` — Production environment template
- `public/scripts/gydschain-schema.sql` — Indexer database schema

## User Roles
Three roles managed via Supabase `user_roles` table: `user`, `admin`, `founder`

## Production Readiness
All 28 issues from `FIXES.md` have been resolved:
- Docker files hardened (proper npm ci, build ARGs, healthchecks, USER directive)
- Nginx: CSP tightened, HSTS documented, health endpoint body fixed, .sh files blocked
- Docker Compose: changeme password removed, context paths fixed, DB port bound to 127.0.0.1
- All hardcoded LAN IPs (`192.168.18.106`) replaced with `GYDS_RPC_LAN` env var
- `with backend-guardian.sh` (broken, space in filename) deleted → replaced by `deploy-dashboard.sh`
- All shell scripts: shebang updated to `#!/usr/bin/env bash`
- SSL email no longer hardcoded — requires `GYDS_SSL_EMAIL` env var
- Frontend: `index.html` meta tags updated, WebSocket `gaveUp` state exposed
- Missing files created: `.env.production.template`, `gydschain-schema.sql`, `DEPLOYMENT.md`
