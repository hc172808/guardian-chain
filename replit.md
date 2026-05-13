# ChainCore / GYDS Blockchain Explorer

A full-featured blockchain explorer and DeFi platform for the GYDS chain, migrated from Lovable.dev to the Replit pnpm workspace stack.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/blockchain-explorer run dev` — run the frontend (auto-assigned port)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Required env: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` — set by Clerk integration

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind v3, react-router-dom, framer-motion, recharts
- Auth: Clerk (via Replit-managed Clerk tenant)
- API: Express 5 with Clerk middleware
- DB: PostgreSQL + Drizzle ORM (27+ tables)
- Validation: Zod, drizzle-zod
- Build: esbuild (API), Vite (frontend)

## Where things live

- `artifacts/blockchain-explorer/src/` — React frontend (pages/, components/, contexts/, hooks/, lib/)
- `artifacts/blockchain-explorer/src/integrations/supabase/client.ts` — Supabase compat shim (redirects to Express API)
- `artifacts/api-server/src/routes/table.ts` — generic CRUD table endpoint backing the shim
- `artifacts/api-server/src/routes/health.ts` — health check
- `lib/db/src/schema/` — all 27 Drizzle schema files (exports `*Table` pattern)
- `lib/db/src/index.ts` — db export + pool
- `artifacts/blockchain-explorer/src/contexts/AuthContext.tsx` — Clerk-based auth context preserving original API shape

## Architecture decisions

- **Supabase shim**: Instead of rewriting 70+ component files, a compatibility shim at `src/integrations/supabase/client.ts` mirrors the `supabase.from(table)` chainable API and proxies all calls to `GET/POST/PATCH/DELETE /api/table/:table`. Realtime and storage calls are no-ops.
- **Generic table router**: `artifacts/api-server/src/routes/table.ts` handles SELECT/INSERT/UPDATE/UPSERT/DELETE for all 27 tables via Drizzle, with filter params in query string.
- **Clerk auth**: All Supabase auth replaced with Clerk. `AuthProvider` wraps Clerk hooks and exposes the same `{ user, session, roles, signIn, signOut, isAdmin, isFounder }` shape.
- **react-router-dom preserved**: Original app used react-router-dom, not wouter — kept as-is.
- **Tailwind v3 via PostCSS**: `@tailwindcss/vite` replaced with PostCSS plugin in vite.config.ts.

## Product

- Block Explorer: search/browse blocks, transactions, tokens on GYDS chain
- Dashboard: real-time network stats, validator activity, mining info (auth required)
- Validators: PoS validator leaderboard + staking rewards calculator
- DeFi: swap interface, liquidity pools, cross-chain bridge, launchpad, staking
- Token Marketplace: browse, create, and trade tokens
- Testnet Faucet: claim GYD and GYDS test tokens
- Wallet: manage wallets, view balances, send transactions (auth required)
- Admin Panel: validator management, token pricing, audit logs, security (admin role required)
- Smart Contracts: deploy and manage contracts (auth required)

## User preferences

- Do not migrate from react-router-dom to wouter
- Auth: use Clerk, not Supabase auth, not Replit Auth
- Supabase data calls should proxy to Express API (not Supabase directly)

## Gotchas

- All schema exports use the `Table` suffix: `adminConfigTable`, `walletsTable`, etc.
- The `@gydschain/sdk` package does not exist on npm — ignore any references to it
- Supabase realtime (channels) and storage are stubbed — no actual realtime push
- The table API is at `/api/table/:table` with filter params like `_filter_eq=col:value`
- Clerk proxy path: `/api/__clerk` — mounted before express.json() in app.ts
- Frontend base path is `/` (preview path), API server is on port 8080

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `artifacts/blockchain-explorer/src/integrations/supabase/client.ts` for shim implementation
