# ChainCore — Developer TODO

> Last updated: 2026-08-15  
> Stack: Vite+React+TS frontend · Express+Drizzle backend · PostgreSQL · Chain ID 198282 · Domain: app.netlifegy.com

---

## ✅ Completed

### Core Infrastructure
- [x] Vite + React + TypeScript SPA (port 5000 dev)
- [x] Express.js backend (port 5001, serves API + static prod build)
- [x] Drizzle ORM + Replit PostgreSQL (`DATABASE_URL`)
- [x] Passport.js session auth (username/password + Web3 wallet signature)
- [x] Tailwind CSS + shadcn/ui component library
- [x] TanStack React Query + React context (AuthContext)
- [x] CSP + security headers in `server/index.ts`
- [x] DB pruner cron (prunes stale snapshots, logs, tokens every 24h)
- [x] IP whitelist auto-add on every successful login
- [x] IP block enforcement toggle (default OFF)
- [x] Database connection keepalive (pg pool with keepAlive + idleTimeout + min 2 warm connections)

### Pages & Navigation
- [x] Admin panel (users, nodes, validators, tokens, monitoring, security, config, audit log)
- [x] Explorer (blocks, transactions, validators)
- [x] Wallet management (send, receive, transaction history with block explorer links)
- [x] DeFi page (8 primary tabs + 4 Advanced via "More" drawer: orderbook, perps, predict, launchpad)
- [x] IL Calculator moved inside Pools tab (via "IL Calculator" button)
- [x] Token Launchpad
- [x] Mining (pool, profitability calculator, pool stats, leaderboard)
- [x] Node installation management (WireGuard + node setup)
- [x] Governance, NFT, Analytics, Community, Developer, MultiSig, Identity, RWA pages
- [x] Leaderboard page redirects to Referrals (XP gamification removed)
- [x] Referrals page with tier system (Standard → Silver → Gold → Diamond)
- [x] Sidebar with collapsible Core / Ecosystem / Resources sections

### Auth & Security
- [x] TOTP 2FA (`server/totp.ts` — built-in crypto, zero-dep RFC 6238)
- [x] Email verification tokens (CREATE IF NOT EXISTS, token logged to console in dev)
- [x] FOUNDER_WALLET env var support
- [x] 3 roles: user, admin, founder
- [x] hCaptcha integration on login/register
- [x] Progressive login lockout (escalating durations, admin-configurable)
- [x] Active sessions panel (view + revoke individual/all other sessions)
- [x] 2FA backup codes (8 codes, SHA-256 hashed)

### UI / UX
- [x] Dark / Light theme toggle (sun/moon button in top-right header)
- [x] Light theme CSS variables (`theme-light` class on `<html>`)
- [x] Theme persisted in localStorage
- [x] PWA manifest + service worker (stale-while-revalidate + background sync)
- [x] Web push notifications (VAPID auto-generated)
- [x] Biometric unlock (WebAuthn)
- [x] Ledger hardware wallet support (WebHID)
- [x] PWA install prompt (Android + iOS guide)

### Blockchain / Chain
- [x] Genesis JSON builder (`GET /api/chain/genesis.json`) — builds real Geth genesis from DB token_operations
- [x] PremineManager "Download from DB" button
- [x] Geth-based node setup scripts (`public/docker/`, `public/scripts/`)
- [x] `GET /scripts/:scriptName` — serves bash scripts as `text/plain`
- [x] Chain IDs: mainnet=198282, testnet=13371, devnet=13372

### Mining
- [x] Mining pool backend (`server/miningPool.ts`) with sessions, jobs, share submission
- [x] `GET /api/mining/pool-stats` — live stats
- [x] `POST /api/mining/rpc` — JSON-RPC proxy to pool
- [x] `GET /api/mining/leaderboard` — top 25 miners by earned GYDS
- [x] Leaderboard table with gold/silver/bronze medals in Pool Stats tab
- [x] Pool Activity chart (area chart: active miners + difficulty, rolling 5-min window)

### Test Node Manager
- [x] 7 node types per network: rpc, lite, fullnode, boostnode, validator, genesis, bootnode
- [x] 3 networks: mainnet (198282), testnet (13371), devnet (13372)
- [x] Start / Stop / Auto-boot toggle per node
- [x] Per-node live logs panel (2s polling)
- [x] Global node log file viewer with search + filter presets
- [x] `POST /api/admin/test-nodes/:network/:type/console` — Geth JS console proxy
- [x] NodeConsole UI component — terminal with command history (↑↓), shortcut buttons, color-coded output
- [x] Sync check panel (block height comparison across networks)

### Alerts & Notifications
- [x] Telegram alerts — faucet, governance vote, buy/cashout status, **node offline**, **large bridge transfer**, **new governance proposal**
- [x] Discord webhook alerts — node offline, large bridge transfer (≥10,000 tokens), new governance proposal (`DISCORD_WEBHOOK_URL` env var)
- [x] In-app notification bell (user_notifications table, live polling)

### Developer / API
- [x] API key CRUD — `GET/POST /api/keys`, `DELETE /api/keys/:id`
- [x] API key table (api_keys): UUID, name, prefix, SHA-256 hash, scopes, request count/limit, expiry, revoked flag
- [x] Developer page — API Keys tab, Usage, Webhooks, Endpoints, Playground, SDKs
- [x] Audit log table + `GET /api/audit-logs` (user scoped) + Admin Audit Log tab viewer

### Payments & Revenue
- [x] Payment methods + buy_requests tables; 5 seeded defaults (PayPal, MMG Guyana, Bank GY, VISA/MC, Crypto)
- [x] cashout_requests with payment_method column
- [x] Admin → Payments tab (PaymentMethodsManager) — methods toggle/edit, buy/cashout approve/reject
- [x] Revenue dashboard — trust_payments, stablecoin creation fees, insurance premiums, bridge fees, buy/cashout; 30-day daily + 12-month monthly breakdown

### URL / Domain
- [x] Dashboard URL: `https://app.netlifegy.com`
- [x] Icon URL: `https://app.netlifegy.com/icon.png`
- [x] Install script `DASHBOARD_URL` default → `https://app.netlifegy.com`
- [x] Mining setup guide URLs → `app.netlifegy.com`
- [x] Subdomains unchanged: rpc., explorer., ws., vpn., testnet-rpc., devnet-rpc.

---

## 🔲 Pending / In Progress

### High Priority

- [x] **Real SMTP email verification** — Nodemailer delivery is wired through `server/email.ts` and the SMTP settings are available in Admin → Server Config. Without `SMTP_HOST`, development safely logs the message instead.
- [ ] **Production Geth node** — genesis.json is correct; deploy a real Geth binary on a VPS, run `geth init genesis.json`, and peer the test nodes to the live network.
- [x] **WireGuard VPN provisioning (deferred server connection)** — the app generates peer/client configuration and QR data; connect it to the user's existing WireGuard server during server setup when details are available, otherwise skip and leave it for later.
- [ ] **Validator registration on-chain** — current validator dashboard is mock data. Deploy a Solidity `ValidatorRegistry` contract on chain 198282 and wire `validator_register` RPC method.
- [ ] **Block explorer real data** — Explorer reads from `network_snapshots` seeded by a cron (`server/chainSync.ts`). Ensure `rpc.netlifegy.com` is live so the cron populates real data.

### Medium Priority

- [x] **Cross-chain bridge backend** — `POST /api/bridge/transfer` now creates a pending request, validates destination/amount/fee, and emits a signed `bridge.initiated` webhook when `BRIDGE_RELAYER_WEBHOOK_URL` is configured. The UI and history consume the real pending-transfer API without minting before relayer confirmation.
- [ ] **DeFi swap real liquidity** — Swap tab calls a mock AMM. Wire to a deployed UniswapV2-style AMM contract on chain 198282, or integrate a DEX aggregator API.
- [ ] **NFT minting** — NFT page has UI but no `POST /api/nft/mint`. Deploy an ERC-721 contract and wire `ethers.js` from the server signer.
- [ ] **Governance proposals on-chain** — Deploy a `GovernorBravo`-style contract; wire `POST /api/governance/propose` and `POST /api/governance/vote`.
- [ ] **RWA (Real-World Assets)** — UI-only. Define tokenization flow; deploy ERC-1400 or ERC-3525 contract.
- [ ] **MultiSig wallet backend** — `POST /api/multisig/create` and `POST /api/multisig/sign` need implementing (consider Gnosis Safe contract).
- [x] **Analytics real data** — Analytics page already fetches /api/network-snapshots (live TPS/validators/stake charts); GET /api/network-snapshots endpoint added; mining calc uses live overview data.
- [x] **API key rate limiting middleware** — `requireApiKey` middleware in routes.ts validates X-API-Key header (SHA-256 hash lookup), enforces per-key monthly request limit, and applies `publicApiLimiter` (60 req/min). Usage incremented async on every hit.
- [x] **Public REST API endpoints** — `GET /api/public/chain`, `/api/public/tokens` (paginated), `/api/public/stats` — all require X-API-Key; returns chain/token/validator/node aggregate data.

### Low Priority / Nice to Have

- [x] **SMTP / push notifications** — Email on governance vote + bridge completion wired; `sendStakingRewardEmail` added to email.ts; all gated on SMTP_HOST. Bell notifications sent on bridge complete.
- [x] **Leaderboard persistence** — `mining_payouts` table created at runtime in GET /api/mining/leaderboard; leaderboard merges token_operations + mining_payouts; POST /api/admin/mining/payout added.
- [x] **Node console history in localStorage** — `NodeConsole` in TestNodeManager.tsx initializes `cmdHistory` from `localStorage` (key `gyds_console_hist_${network}_${type}`) and persists it via `useEffect` on every change. Up to 50 commands retained.
- [x] **Mobile WireGuard config QR** — `GET /api/wireguard/config.qr` generates WireGuard peer config from user's latest approved node and returns a QR PNG via the `qrcode` package.
- [x] **Miner binary distribution** — `public/miner-download/gyds-miner.tar.gz` contains the standalone Node.js miner, installer, worker, dashboard, config example, and setup guide. Download links use the canonical app domain.
- [x] **Admin monitoring alerts** — `GET /api/admin/monitoring` now fires Discord webhook + bell notifications to admin/founder users when: all validators inactive, all RPC down, or DB unavailable. Returns `alerts[]` array in response.
- [ ] **CSP nonce / strict-dynamic** — Current CSP uses `unsafe-inline` (needed by Vite HMR). For production, generate per-request nonces and remove `unsafe-inline`.
- [ ] **i18n / localization** — UI is English-only. `react-i18next` scaffolding would allow community translations.
- [x] **Discord webhook UI** — Added "Discord Alerts" section to Admin → Server Config with a URL field; value written to `.env` + `gyds-config.env` on save; docs inline explaining which events trigger alerts.
- [x] **Orderbook real backend** — `GET /api/orderbook/depth` aggregates open orders into bid/ask price levels with cumulative depth; real spread computed; recent trades returned from orders table.
- [x] **Transaction history pagination** — GET /api/transactions now accepts `limit` (max 200) and `offset` query params; returns `{transactions, total, limit, offset}` for proper cursor-style pagination.

---

## 🏗️ Architecture Notes

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Vite 5 + React 18 + TypeScript | Port 5000 dev, served statically in prod |
| Backend | Express.js + Passport.js | Port 5001, sessions in PostgreSQL via `connect-pg-simple` |
| DB | PostgreSQL (Replit managed) | Drizzle ORM, see "DB schema push" below |
| Auth | Passport local + Web3 sig | Roles: `user`, `admin`, `founder` |
| Chain | Geth-compatible EVM | Chain ID 198282, genesis built from DB |
| Styling | Tailwind CSS + shadcn/ui | GlassCard, Badge, Button, Switch, Tabs, etc. |
| State | TanStack Query + AuthContext | Supabase shim routes all calls to Express API |

### Key env vars
```
DATABASE_URL          Replit PostgreSQL (auto-set)
SESSION_SECRET        Express session secret (auto-set)
FOUNDER_PASSWORD      Override default founder password
ADMIN_PASSWORD        Override default admin password
FOUNDER_WALLET        Override default founder wallet (0x6422d12b…)
VITE_RPC_LAN          Optional LAN RPC endpoint for frontend
DISCORD_WEBHOOK_URL   Discord channel webhook for node/bridge/governance alerts
TELEGRAM_BOT_TOKEN    Telegram bot for per-user alerts
```

### Running locally
```bash
npm run dev        # Express (5001) + Vite (5000)
npm run build      # Production build
```

### DB schema push (Replit workaround)
`drizzle-kit push` requires a TTY and hangs in Replit. Use instead:
```bash
npx drizzle-kit generate --name my_migration
cat drizzle/migrations/XXXX_my_migration.sql | psql "$DATABASE_URL"
```

---

## 🐛 Known Issues / Tech Debt

- **testNodes.ts simulates Geth responses** — When a real Geth node runs on the same port, responses come from the real node (correct and intentional).
- **Supabase shim** — `src/integrations/supabase/client.ts` routes all calls to Express. Do NOT install real Supabase credentials; that would break routing.
- **Layout import** — Must use `import { Layout } from '@/components/layout/Layout'` (named export, lowercase folder). `@/components/Layout` causes a Vite 500.
- **`npm run db:push` hangs** — Always use `drizzle-kit generate` + `psql` pipe workaround in Replit.
- **IP 190.108.214.85** — High-traffic attacker detected in monitoring logs (XSS + DDoS bursts). IP blocking is currently disabled (monitor-only). Enable via Admin → Security when ready for production.
- **Light theme partial coverage** — CSS variables cover all standard UI tokens. Custom glow effects (`neon-text`, `neon-glow`) are still dark-optimised and may look off in light mode.

---

## 🐛 Reported Issues (2026-07-25)

- [x] **Balance shows 0 after admin mint on mainnet** — `netClause` in `/api/user/balance` was missing `$` before placeholder index. Fixed.
- [x] **txNetClause same missing-`$` bug** — transactions network filter had same issue. Fixed.
- [x] **Balance card always showed "Mainnet" regardless of running nodes** — Fixed: 'all' queries without network scope and shows "All Networks" badge.
- [x] **Genesis node `web3.version` returned null** — Fixed: explicit `web3_clientVersion` case added.
- [x] **Genesis node block showed 0 initially then synced** — Fixed: now syncs with shared chain timer on start.
- [x] **Genesis node peers = 0** — Fixed: initialised to 4 peers, peer-sync timer added.
- [x] **Mining page accessible to all users** — Fixed: restricted to admin/founder only.
- [x] **Login "Invalid username or password" on server** — Seed had premature `return` skipping account creation. Fixed: seed now always upserts founder + admin accounts on startup.
- [x] **Database connection drops** — pg pool had zero config. Fixed: keepAlive, idleTimeout, connectionTimeout, min:2 warm connections, pool error handler.
- [x] **Coin logos not showing in Swap / Wallet** — No fallback to static files. Fixed: `/gyds-coin.jpg`, `/gyd-coin.png`, `/gusd-coin.png` used as fallback.

---

## ✅ 2026-08-06 — Security-check controls & chain-ID migration

- [x] **Admin UI for security-check tuning** — `src/components/admin/CaptchaSecuritySettings.tsx` (Admin → Health) edits rolling-window thresholds, alert cooldowns, offline-fallback replay expiry (default 2 min) and replay-memory multiplier live, with no redeploy.
- [x] **Runtime settings store** — `server/captchaSettings.ts` seeds from env, persists to `.gyds-captcha-settings.json`, clamps every value, and is read live by `server/captcha.ts` + `server/captchaAlerts.ts`.
- [x] **Endpoints** — `GET/PUT /api/auth/captcha/settings`, `POST /api/auth/captcha/settings/reset`, `POST /api/auth/captcha/attack-mode` (admin/founder only).
- [x] **Server-side feature flag for attack conditions** — failure signals feed an attack detector; when the threshold trips (or an admin forces it), the offline fallback is disabled server-side (`isFallbackAllowed()`), while server-side verification keeps working whenever the API is reachable. `CaptchaWidget` honours the flag via `fallbackAllowed` on `/api/auth/captcha` (cached for offline cases) and shows a lockdown message instead of issuing a local challenge.
- [x] **Chain ID migration 13370 → 198282** (hex `0x343A` → `0x3068a`) across 131 files: Go node configs/genesis, Solidity + Hardhat, docker/portainer stacks, install scripts, edge functions, server RPC config, frontend network config and docs.
