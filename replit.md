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
- **Blockchain** — Chain ID 13370, domain `netlifegy.com`

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

## Default Founder Account
Created automatically on first boot:
- **Username:** `netlifegy`
- **Password:** `GYDSchain2026!` ← Change after first login

## User Roles
Three roles in `user_roles` table: `user`, `admin`, `founder`

## User Preferences
- Preserve existing code structure and patterns
- Use Drizzle ORM for all database operations
- Keep the Supabase shim in place (routes to Express API, no real Supabase needed)
