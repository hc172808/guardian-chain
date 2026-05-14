# ChainCore / GYDS Blockchain Explorer

A full-featured blockchain explorer and DeFi platform for the GYDS chain, migrated from Lovable.dev to the Replit pnpm workspace stack.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/blockchain-explorer run dev` — run the frontend (auto-assigned port)
- `pnpm --filter @workspace/chaincore-mobile run dev` — run the Expo mobile app
- `cd artifacts/gyds-litenode && ./bin/gyds-litenode start` — run the GYDS litenode (port $PORT or 8545)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Required env: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` — set by Clerk integration

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9, Go 1.21
- Frontend: React + Vite, Tailwind v3, react-router-dom, framer-motion, recharts
- Mobile: Expo SDK 54, expo-router, React Native 0.81
- Auth: Clerk (via Replit-managed Clerk tenant)
- API: Express 5 with Clerk middleware
- DB: PostgreSQL + Drizzle ORM (27+ tables)
- Litenode: Go 1.21, gorilla/mux, gorilla/websocket, zerolog (in `artifacts/gyds-litenode/`)
- Validation: Zod, drizzle-zod
- Build: esbuild (API), Vite (frontend), go build (litenode)

## Where things live

- `artifacts/blockchain-explorer/src/` — React frontend (pages/, components/, contexts/, hooks/, lib/)
- `artifacts/chaincore-mobile/` — Expo mobile app (app/, components/, hooks/, constants/)
- `artifacts/gyds-litenode/` — Go blockchain litenode (core/, p2p/, consensus/, rpc/, config/)
- `artifacts/blockchain-explorer/src/integrations/supabase/client.ts` — Supabase compat shim
- `artifacts/api-server/src/routes/table.ts` — generic CRUD table endpoint
- `artifacts/api-server/src/routes/blockchain.ts` — blockchain stub routes (stats, blocks, txs, SSE stream)
- `lib/db/src/schema/` — all 27 Drizzle schema files (exports `*Table` pattern)
- `lib/db/src/index.ts` — db export + pool
- `artifacts/blockchain-explorer/src/contexts/AuthContext.tsx` — Clerk-based auth context
- `scripts/nodes/` — Ubuntu 22.04 server setup scripts (fullnode, litenode, rpcnode, boostnode, genesis)
- `docker/` — Dockerfiles + docker-compose.yml + Portainer stack

## Architecture decisions

- **Supabase shim**: Instead of rewriting 70+ component files, a compatibility shim at `src/integrations/supabase/client.ts` mirrors the `supabase.from(table)` chainable API and proxies all calls to `GET/POST/PATCH/DELETE /api/table/:table`. Realtime and storage calls are no-ops.
- **Generic table router**: `artifacts/api-server/src/routes/table.ts` handles SELECT/INSERT/UPDATE/UPSERT/DELETE for all 27 tables via Drizzle, with filter params in query string.
- **Clerk auth**: All Supabase auth replaced with Clerk. `AuthProvider` wraps Clerk hooks and exposes the same `{ user, session, roles, signIn, signOut, isAdmin, isFounder }` shape. Registration uses OTP email verification flow.
- **react-router-dom preserved**: Original app used react-router-dom, not wouter — kept as-is.
- **Tailwind v3 via PostCSS**: `@tailwindcss/vite` replaced with PostCSS plugin in vite.config.ts.
- **Go litenode**: Self-contained blockchain litenode with PoS engine, P2P TCP networking, JSON-RPC (Ethereum-compatible), WebSocket subscriptions, and Ethereum-compatible JSON-RPC interface.

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
- Mobile App: Dashboard, Explorer, Wallet, Faucet with live SSE block feed
- GYDS Litenode: PoS engine (5s blocks), P2P TCP, Ethereum JSON-RPC, WebSocket, genesis init

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
- Registration flow requires OTP email verification via `clerkSignUp.attemptEmailAddressVerification`
- SSE stream for live blocks is at `GET /api/blockchain/stream` (EventSource)
- Go litenode reads PORT env for RPC port; reads GYDS_* env for chain config
- Build litenode: `cd artifacts/gyds-litenode && go build -o bin/gyds-litenode .`

## Server Deployment (Ubuntu 22.04)

```bash
# Genesis block initialisation (run once on first machine)
bash scripts/nodes/genesis-init.sh --chain-id 1337 --validators 3

# Full node
sudo bash scripts/nodes/setup-fullnode.sh

# Light node
sudo bash scripts/nodes/setup-litenode.sh

# RPC node (with nginx reverse proxy)
sudo GYDS_DOMAIN=rpc.yourdomain.com bash scripts/nodes/setup-rpcnode.sh

# Boost/relay node
sudo bash scripts/nodes/setup-boostnode.sh
```

## Docker / Portainer

```bash
# Full stack (web + API + DB + litenode)
cp docker/.env.example docker/.env  # fill in secrets
docker compose -f docker/docker-compose.yml up -d

# Litenode only (Portainer stack)
# Upload docker/docker-compose.portainer.yml to Portainer > Stacks > Add Stack
```

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `artifacts/blockchain-explorer/src/integrations/supabase/client.ts` for shim implementation
- See `artifacts/gyds-litenode/` for Go blockchain implementation
