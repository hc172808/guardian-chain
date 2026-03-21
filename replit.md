# ChainCore — GYDS Blockchain Network Dashboard

## Overview
A Vite + React + TypeScript frontend for the GYDS blockchain network. Features an explorer, validator dashboard, DeFi tools, wallet management, token launchpad, node installation management, and an admin panel.

## Architecture
- **Frontend only** — pure Vite/React SPA, no backend server
- **Auth & Database** — Supabase (project: `rmwldjwkyhhaoqehdrbr`) handles authentication, PostgreSQL data, and realtime subscriptions
- **Styling** — Tailwind CSS + shadcn/ui component library
- **State** — TanStack React Query + React context (AuthContext)

## Key Directories
- `src/pages/` — top-level route pages (Admin, Auth, Explorer, Wallet, DeFi, Tokens, etc.)
- `src/components/` — feature-scoped components (admin, dashboard, defi, mining, node, token, validators, wallet, wireguard)
- `src/contexts/AuthContext.tsx` — authentication context using Supabase Auth
- `src/integrations/supabase/` — Supabase client + TypeScript types
- `src/config/` — blockchain network config (RPC endpoints, tokenomics, wallet addresses)
- `src/hooks/` — custom hooks (WebSocket, wallet connect, transaction notifications)

## Environment Variables
Stored in Replit's environment variable manager (shared):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID

## Development
- **Run:** `npm run dev` (starts Vite dev server on port 5000)
- **Build:** `npm run build` (outputs to `dist/`)

## Deployment
Static site deployment — build output goes to `dist/`.

## User Roles
Three roles managed via Supabase `user_roles` table: `user`, `admin`, `founder`
