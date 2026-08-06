# GYDSchain — GYDS Blockchain Network Dashboard
## Complete Feature Reference

> Last updated: 2026-06-17
> Single source of truth for every feature in this project — what exists, where the code lives, and how pieces connect.

---

## Table of Contents
1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Authentication & Roles](#authentication--roles)
4. [Routing](#routing)
5. [Layout & Navigation](#layout--navigation)
6. [Core Pages](#core-pages)
7. [DeFi System (13 tabs)](#defi-system)
8. [Ecosystem Pages](#ecosystem-pages)
9. [Admin Dashboard (30+ tabs)](#admin-dashboard)
10. [Server Services](#server-services)
11. [Hooks & Utilities](#hooks--utilities)
12. [Database Tables](#database-tables)
13. [Config & Constants](#config--constants)
14. [Infrastructure Files](#infrastructure-files)
15. [Known Patterns & Conventions](#known-patterns--conventions)

---

## Tech Stack

| Layer | Library | Notes |
|-------|---------|-------|
| Build | Vite 7 | Port 5000 in dev (proxies /api → 5001) |
| Backend | Express + tsx | Port 5001 — `server/index.ts` |
| ORM | Drizzle ORM | Schema in `shared/schema.ts` |
| Database | Replit PostgreSQL | `DATABASE_URL` env var, pg pool |
| Auth | passport-local + bcrypt | Sessions via connect-pg-simple |
| UI | React 18 + TypeScript | Strict mode |
| Styling | Tailwind CSS + shadcn/ui | Custom CSS vars in `index.css` |
| Routing | React Router v6 | `BrowserRouter` in `App.tsx` |
| State | TanStack React Query | Data fetching + caching |
| Animation | Framer Motion | Page transitions, sidebar, modals |
| Icons | Lucide React | Consistent icon set throughout |
| Web Push | web-push (npm) | VAPID auto-generated in server/webpush.ts |
| Email | nodemailer | SMTP_HOST env; console fallback in dev |
| Coin logos | `public/gyds-coin.jpg`, `public/gyd-coin.png` | Shown in sidebar + swap |

---

## Project Structure

```
src/
├── App.tsx                    # Root routes + MobileRedirect logic
├── main.tsx                   # React entry point
├── index.css                  # Tailwind + custom CSS (glass, neon, gradients)
│
├── pages/                     # One file per route
│   ├── Index.tsx              # Dashboard homepage (/)
│   ├── Explorer.tsx           # Block explorer (/explorer)
│   ├── TokenDetail.tsx        # Token detail (/explorer/token/:address)
│   ├── Validators.tsx         # Validator list (/validators)
│   ├── Mining.tsx             # Mining pools (/mining)
│   ├── Tokens.tsx             # Token factory (/tokens)
│   ├── DeFi.tsx               # DeFi hub (/defi) — 13-tab layout
│   ├── Wallet.tsx             # Wallet manager (/wallet)
│   ├── Transactions.tsx       # Tx history (/transactions)
│   ├── Network.tsx            # Network config (/network)
│   ├── Watchlist.tsx          # Price watchlist (/watchlist)
│   ├── PriceAlerts.tsx        # Price alerts (/price-alerts)
│   ├── Webhooks.tsx           # Webhook management (/webhooks)
│   ├── NodeTerminal.tsx       # Node terminal (/node-terminal)
│   ├── Faucet.tsx             # Testnet faucet (/faucet)
│   ├── Insurance.tsx          # Insurance protocol (/insurance)
│   ├── Governance.tsx         # DAO governance (/governance)
│   ├── NFT.tsx                # NFT marketplace (/nft)
│   ├── Analytics.tsx          # Chain analytics (/analytics)
│   ├── Community.tsx          # Community forum (/community)
│   ├── Developer.tsx          # Dev portal (/developer)
│   ├── Leaderboard.tsx        # XP rankings (/leaderboard)
│   ├── Multisig.tsx           # Multi-sig wallets (/multisig)
│   ├── Identity.tsx           # On-chain identity (/identity)
│   ├── RWA.tsx                # Real-world assets (/rwa)
│   ├── Mobile.tsx             # Mobile app hub (/mobile) — auto-redirect
│   ├── Admin.tsx              # Admin dashboard (/admin)
│   ├── Auth.tsx               # Login/signup (/auth)
│   ├── Profile.tsx            # User profile (/profile)
│   ├── Docs.tsx               # Edit docs (/docs)
│   ├── Protocol.tsx           # Protocol docs (/protocol)
│   ├── Security.tsx           # Security audit (/security)
│   ├── Download.tsx           # Download page (/download)
│   ├── CliReference.tsx       # CLI docs (/cli)
│   ├── ResetPassword.tsx      # Password reset (/reset-password)
│   ├── Maintenance.tsx        # Maintenance mode overlay
│   └── NotFound.tsx           # 404 page
│
├── components/
│   ├── layout/
│   │   ├── Layout.tsx              # Desktop shell: sidebar + header bell + scanning line
│   │   ├── Sidebar.tsx             # Collapsible nav — Core / Ecosystem / Resources / Admin
│   │   ├── MobileBottomNav.tsx     # Mobile bottom bar (non-DeFi pages)
│   │   ├── NotificationBell.tsx    # Desktop header notification dropdown
│   │   └── UpgradeBanner.tsx       # Maintenance/upgrade banner
│   │
│   ├── defi/
│   │   ├── SwapInterface.tsx       # Token swap UI
│   │   ├── PoolsList.tsx           # Liquidity pool list
│   │   ├── StakeInterface.tsx      # Staking UI
│   │   ├── OrderBook.tsx           # Limit/market/stop-limit/TWAP/iceberg + depth chart
│   │   ├── YieldVaults.tsx         # 5 auto-compound yield vaults
│   │   ├── CrossChainBridge.tsx    # 25-chain bridge
│   │   ├── Launchpad.tsx           # Token launchpad + IDO
│   │   ├── Portfolio.tsx           # DeFi portfolio view + P&L
│   │   ├── LPFarmingDashboard.tsx  # LP farm (stake/unstake/harvest) — Live on Testnet
│   │   ├── StablecoinFactory.tsx   # 5-step user stablecoin creation wizard
│   │   ├── PerpetualTrading.tsx    # Perps (long/short GYDS/USD, funding rate)
│   │   ├── PredictionMarkets.tsx   # Binary prediction markets
│   │   ├── ILCalculator.tsx        # Impermanent loss calculator
│   │   ├── PositionDetails.tsx     # Position detail drill-down
│   │   ├── WalletConnectBar.tsx    # Connect wallet prompt
│   │   ├── BridgeHistory.tsx       # Bridge transaction history
│   │   ├── BridgeFeeComparison.tsx # Cross-chain fee comparison
│   │   ├── PriceSparkline.tsx      # Mini price chart per token
│   │   └── DeFiBottomNav.tsx       # 13-tab bottom nav for DeFi page
│   │
│   ├── admin/
│   │   ├── NodeRepoSync.tsx        # Checks 4 node repos via GitHub API (module/binary/blocktime)
│   │   ├── AIFirewallTab.tsx       # AI firewall — blocked IPs, lockdown, rate limits
│   │   ├── WireGuardPeerManager.tsx# WireGuard — tunnel IPs, wg0.conf, per-peer client configs
│   │   ├── CronJobManager.tsx      # 7-job in-memory cron registry; run/pause/configure
│   │   ├── ValidatorExplorerMonitor.tsx # System monitoring — validators, nodes, RPC, DB, memory
│   │   ├── BridgeNetworkManager.tsx# Enable/disable bridge chains (admin only)
│   │   ├── ExplorerConfig.tsx      # Explorer deployment config (co-located vs standalone)
│   │   ├── ComponentVisibility.tsx # Show/hide UI features for users
│   │   ├── MaintenanceManager.tsx  # Toggle maintenance mode + custom message
│   │   ├── ValidatorManager.tsx    # Validator admin
│   │   ├── BurnMintManager.tsx     # Token burn/mint operations
│   │   ├── StablecoinManager.tsx   # GYD/GYDS stablecoin settings
│   │   ├── SponsorManager.tsx      # Project sponsors
│   │   ├── PremineManager.tsx      # Pre-mine allocations
│   │   ├── CoinLogoUpload.tsx      # Upload coin icons
│   │   ├── DatabaseSettings.tsx    # DB connection config
│   │   ├── FirewallManager.tsx     # IP firewall rules
│   │   ├── AuditLogViewer.tsx      # Audit log viewer
│   │   ├── HealthCheck.tsx         # System health monitor
│   │   ├── TokenPricingManager.tsx # Exchange rate management
│   │   ├── TokenManager.tsx        # Token admin tools
│   │   ├── NodeInstaller.tsx       # Node deployment tools + one-liner SSH copy
│   │   ├── AdminConsole.tsx        # Interactive admin terminal
│   │   ├── MainnetPromotion.tsx    # Mainnet promotion manager
│   │   ├── MiningPoolAdmin.tsx     # Mining pool admin
│   │   ├── GitSyncPanel.tsx        # Real git pull with live output
│   │   └── SponsorFunding.tsx      # Sponsor funding tracker
│   │
│   ├── auth/
│   │   └── RequireAuth.tsx         # Auth gate wrapper component
│   │
│   ├── dashboard/             # Dashboard widgets (stats, charts)
│   ├── validators/            # Validator-specific components
│   ├── mining/                # Mining-specific components
│   ├── token/                 # Token factory components
│   ├── wallet/                # Wallet components (LedgerConnect.tsx — WebHID)
│   ├── node/                  # Node management components
│   ├── wireguard/             # WireGuard VPN components
│   └── ui/                    # shadcn/ui + custom primitives
│       ├── GlassCard.tsx      # Glass-morphism card (used everywhere)
│       └── ...                # All other shadcn components
│
├── hooks/
│   ├── useBridgeNetworks.ts        # Fetch enabled bridge chains from admin_config
│   ├── useWalletConnect.ts         # EVM wallet connection (MetaMask)
│   ├── useWebSocket.ts             # WebSocket connection to GYDS node
│   ├── useCoinGeckoPrices.ts       # Live prices for 25 chains from CoinGecko (60s refresh)
│   ├── useNetworkDetection.ts      # Detect current MetaMask chain
│   ├── useComponentVisibility.ts   # Read which UI components are hidden
│   ├── useMaintenance.ts           # Read maintenance mode from admin_config
│   ├── useRpcBalance.ts            # On-chain GYDS balance via JSON-RPC eth_getBalance
│   ├── useTransactionNotifications.ts # Real-time tx notification listener
│   ├── use-mobile.ts               # isMobile boolean (768px breakpoint)
│   └── use-toast.ts                # Toast notification hook
│
├── contexts/
│   └── AuthContext.tsx             # user, roles, isAdmin, isFounder, signOut
│
├── config/
│   ├── bridgeChains.ts             # EXTERNAL_CHAINS array (25 networks) + GYDS_CHAIN
│   └── network.ts                  # RPC endpoints, chain ID 198282, tokenomics
│
└── integrations/supabase/
    ├── client.ts                   # Supabase shim — routes all calls to Express /api/*
    └── types.ts                    # TypeScript types for all tables

server/
├── index.ts        # Express app entry — middleware, sessions, cron jobs, DB pruner, push, monitoring
├── auth.ts         # Passport config, register/login/logout/TOTP/email-verify/password-reset routes
├── routes.ts       # All /api/* routes (protected by requireAuth / requireAdmin)
├── storage.ts      # All DB read/write helpers (Drizzle ORM)
├── db.ts           # pgPool + drizzle instance
├── seed.ts         # Seed founder account + achievements on startup
├── totp.ts         # Zero-dep RFC 6238 TOTP (built-in crypto only — no otplib)
├── email.ts        # nodemailer wrapper (SMTP_HOST env; console fallback in dev)
├── walletCrypto.ts # AES-256-GCM wallet encryption (WALLET_ENCRYPTION_KEY env)
├── webpush.ts      # VAPID key auto-gen, web-push subscriptions (push_subscriptions table at runtime)
└── security.ts     # AI Firewall — IP blocklist, lockdown, rate limiting, payload inspection

node-fixes/         # Corrected Go source files to push to GitHub repos
├── README.md       # Push instructions for each repo
├── rpcnode/        # go.mod (correct module), main.go (correct imports + NewServer 5 args)
├── boostnode/      # go.mod, main.go, config/config.go (NodeMode=boost, BlockTime=1s)
├── fullnode/       # main.go (binary = gyds-fullnode, version fix)
└── genesis/        # Full implementation: go.mod, main.go, config/, Dockerfile, setup.sh, README.md
```

---

## Authentication & Roles

**Provider:** Custom Express + passport-local
**Context file:** `src/contexts/AuthContext.tsx`

### Available hooks from `useAuth()`
```typescript
const { user, roles, isAdmin, isFounder, loading, signOut } = useAuth();
```

### Roles (stored in `user_roles` table)
| Role | Access |
|------|--------|
| `user` | Default — all public pages |
| `admin` | Admin dashboard + all user features |
| `founder` | Full access — same as admin + extra visibility |

### Auth flows
- Username/password: `POST /api/auth/login`
- Web3 wallet: `GET /api/auth/challenge` → sign → `POST /api/auth/wallet-login`
- Wallet password reset: sign nonce → `POST /api/auth/reset-password/wallet`
- TOTP: setup via `POST /api/auth/totp/setup`, verify via `POST /api/auth/totp/verify`
- Email verify: token generated on register → `POST /api/auth/verify-email`

---

## Routing

All routes are in `src/App.tsx`. The `AppContent` component:
1. Runs `<MobileRedirect />` on every page — auto-sends phones/tablets to `/mobile`
2. Checks maintenance mode (redirects to `<MaintenancePage />` if enabled and user not logged in)
3. Renders the `<Routes>` tree

**Layout import:** Always `import { Layout } from '@/components/layout/Layout'` (named export, lowercase "layout" folder). Using `@/components/Layout` causes a Vite 500.

---

## Layout & Navigation

### Desktop Layout (`src/components/layout/Layout.tsx`)
- Left: `Sidebar` (fixed 256px, `w-64`)
- Top-right: `NotificationBell` (desktop only)
- Content: `ml-64` offset, `p-8` padding
- Bottom scanning line effect (CSS animation)

### Sidebar (`src/components/layout/Sidebar.tsx`)
Four collapsible `NavSection` groups (Framer Motion AnimatePresence):
- **Core** — Dashboard, Block Explorer, Validators, Mining, Token Factory, DeFi, Wallet, Transactions, Watchlist, Network Config, Node Terminal, Testnet Faucet, Insurance
- **Ecosystem** — Governance, NFT Marketplace, Analytics, Community, Leaderboard, Multi-Sig, Identity, Real-World Assets, Developer Portal
- **Resources** — Protocol Docs, Security Audit, Download, CLI Reference
- **Admin** (conditional on `isAdmin || isFounder`) — Admin Dashboard, Edit Documentation

### Mobile Layout
- `/mobile` page has its own self-contained layout (no `Layout` wrapper)
- Other pages on mobile use `MobileBottomNav` from `Layout.tsx`
- DeFi page has its own `DeFiBottomNav` (13 tabs)

---

## Core Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Live network stats, recent blocks/txs, quick actions |
| Block Explorer | `/explorer` | Block list, tx search, DB fallback when WebSocket offline |
| Token Detail | `/explorer/token/:address` | ERC-20 token drill-down |
| Validators | `/validators` | Active validator list — stake, uptime, commission |
| Mining | `/mining` | Mining pools, block rewards, difficulty, hashrate |
| Token Factory | `/tokens` | Create ERC-20 tokens on GYDS chain |
| DeFi | `/defi` | 13-tab DeFi hub (see below) |
| Wallet | `/wallet` | MetaMask connect, GYDS/GYD balances, send/receive, Ledger |
| Transactions | `/transactions` | Full tx history — filter by type, date, status |
| Network Config | `/network` | Add GYDS to MetaMask (one-click), RPC endpoints |
| Watchlist | `/watchlist` | Track token prices |
| Price Alerts | `/price-alerts` | Set price alert conditions |
| Webhooks | `/webhooks` | Register webhook URLs, event subscriptions, delivery log |
| Node Terminal | `/node-terminal` | Web terminal — live log streaming via WebSocket |
| Testnet Faucet | `/faucet` | Request testnet GYDS (24h cooldown, server-enforced) |
| Insurance | `/insurance` | Coverage plans (all Available), buy/claim, underwriter staking |

---

## DeFi System

**Entry page:** `src/pages/DeFi.tsx`
**Bottom nav:** `src/components/defi/DeFiBottomNav.tsx` (13 tabs)

### All 13 DeFi Tabs

| Tab | Component | Description |
|-----|-----------|-------------|
| `swap` | `SwapInterface.tsx` | Instant token swap (GYDS ↔ GYD + others) |
| `pools` | `PoolsList.tsx` | Liquidity pools — add/remove liquidity |
| `stake` | `StakeInterface.tsx` | GYDS staking for validator rewards |
| `farm` | `LPFarmingDashboard.tsx` | LP farming — stake/unstake/harvest (Live on Testnet) |
| `orderbook` | `OrderBook.tsx` | Limit, market, stop-limit, TWAP, iceberg orders + depth chart |
| `vaults` | `YieldVaults.tsx` | 5 auto-compound yield strategies |
| `bridge` | `CrossChainBridge.tsx` | 25-chain cross-chain bridge |
| `stablecoin` | `StablecoinFactory.tsx` | User-created stablecoins (5-step wizard) |
| `perps` | `PerpetualTrading.tsx` | Perpetuals — long/short GYDS/USD, funding rate |
| `predict` | `PredictionMarkets.tsx` | Binary outcome prediction markets |
| `launchpad` | `Launchpad.tsx` | Token launches + IDO participation |
| `portfolio` | `Portfolio.tsx` | DeFi positions summary + P&L |
| `ilcalc` | `ILCalculator.tsx` | Impermanent loss calculator |

### Cross-Chain Bridge
- **Config:** `src/config/bridgeChains.ts` (25 chains as `EXTERNAL_CHAINS`)
- **Admin control:** `admin_config` table → `bridge_networks_enabled` key → `useBridgeNetworks` hook
- **EVM chains (11):** wallet_switchEthereumChain + eth_getBalance via MetaMask
- **Non-EVM chains (14):** trust-based flow (cross-chain oracle/relayer in production)

**EVM:** Ethereum, BNB Chain, Polygon, Avalanche, Fantom, Cronos, Arbitrum One, Optimism, Base, zkSync Era, Linea
**Non-EVM:** Solana, NEAR, Cosmos Hub, Polkadot, Cardano, TRON, TON, XRP Ledger, Stellar, Algorand, Hedera, Aptos, Sui, Internet Computer

### Yield Vaults
| Vault | APY | Lock |
|-------|-----|------|
| GYDS Auto-Stake | 8.5% | None |
| GYDS-GYD LP | 24.3% | Auto-compound |
| GYD Stable | 5.2% | None |
| GYDS Boosted | 45.8% | 30 days |
| Validator Support | 18.9% | 14 days |

### Stablecoin Factory — Creation Rules
- **Fee:** 10,000 GYDS (configurable in admin_config)
- **Max per user:** 3 (configurable)
- **Peg types:** usd, eur, gbp, btc, eth, gold, custom, basket
- **Collateral models:** over_collateralized (150%), algorithmic (100%), hybrid (120%), fiat_backed (100%)
- **Lifecycle:** draft → pending_review → active → paused/deprecated
- Admin approval required before going live

---

## Ecosystem Pages

| Page | Route | Key Features |
|------|-------|-------------|
| Governance | `/governance` | Proposals, voting, treasury, grants, delegation, quadratic voting |
| NFT Marketplace | `/nft` | Collections, buy/sell, mint, metadata, IPFS, royalties, staking |
| Analytics | `/analytics` | OHLCV charts, heatmap, network metrics, mining profitability calc |
| Community | `/community` | Forum posts, comments, upvotes, referral system, follow |
| Developer Portal | `/developer` | API keys, playground, endpoints, SDKs (JS ✅ Python ✅ Go 🔄 Rust 📋) |
| Leaderboard | `/leaderboard` | XP rankings, traders, validators, builders — weekly/monthly/all-time |
| Multi-Sig | `/multisig` | M-of-N wallets, propose/sign/execute, Ledger support |
| Identity | `/identity` | DID (did:gyds:<addr>), KYC tiers, reputation score, social verify |
| Real-World Assets | `/rwa` | Real estate, bonds, commodities, invoices — invest + yield |
| Mobile Hub | `/mobile` | Auto-redirect for mobile; 5-tab bottom nav |

### Mobile Hub Tabs
- **Home:** Portfolio card (GYDS/GYD/Staked), 6 quick actions, network stats, recent activity
- **Explorer:** Search bar, links to Explorer/Transactions/Validators/Mining/Tokens
- **DeFi:** Shortcut cards to all 13 DeFi features
- **Wallet:** Connected wallet panel, Tx History, Watchlist, Faucet
- **More:** Governance, Leaderboard, Community, Docs + Sign Out + "Switch to Desktop"

### Developer Portal — SDK Coverage

| Feature | JS/TS | Python | Go | Rust |
|---------|-------|--------|----|------|
| Chain stats & blocks | ✅ | ✅ | 🔄 | 📋 |
| Wallet balance & history | ✅ | ✅ | 🔄 | 📋 |
| Send transactions | ✅ | ✅ | 🔄 | 📋 |
| Token operations | ✅ | ✅ | 🔄 | 📋 |
| WebSocket subscriptions | ✅ | ✅ | 📋 | 📋 |
| Smart contract calls | ✅ | 🔄 | 📋 | 📋 |
| Validator queries | ✅ | ✅ | 🔄 | 📋 |

✅ Available · 🔄 In Progress · 📋 Planned

---

## Admin Dashboard

**Route:** `/admin` — `src/pages/Admin.tsx`
**Access:** `isFounder || isAdmin` only

### All Admin Tabs

| Tab | Component | Purpose |
|-----|-----------|---------|
| `nodes` | inline | Approve/reject/revoke node installations |
| `validators` | `ValidatorManager` | Validator management |
| `users` | `UserManager` | View all users, roles, ban/unban |
| `tokens` | `BurnMintManager` | Token supply operations |
| `stablecoin` | `StablecoinManager` | GYD/GYDS stablecoin settings |
| `sponsors` | `SponsorManager` | Project sponsor management |
| `premine` | `PremineManager` | Pre-mine allocation management |
| `logos` | `CoinLogoUpload` | Upload/replace coin icons |
| `database` | `DatabaseSettings` | DB connection settings |
| `github` | `GitSyncPanel` + `NodeRepoSync` | Git pull + node repo health check |
| `firewall` | `AIFirewallTab` + `FirewallManager` | AI firewall + IP rules |
| `audit` | `AuditLogViewer` | System audit log |
| `health` | `HealthCheck` | Node + system health monitor |
| `monitoring` | `ValidatorExplorerMonitor` | Validators, RPC, DB status, uptime, memory |
| `cron-jobs` | `CronJobManager` | 7 scheduled jobs — run/pause/configure |
| `token-pricing` | `TokenPricingManager` | Exchange rate management |
| `token-mgmt` | `TokenManager` | Token admin tools |
| `installer` | `NodeInstaller` | Deploy new nodes (one-liner SSH copy) |
| `console` | `AdminConsole` | Interactive admin terminal |
| `visibility` | `ComponentVisibility` | Show/hide UI features per group |
| `promotion` | `MainnetPromotion` | Mainnet transition manager |
| `pools` | `MiningPoolAdmin` | Mining pool admin |
| `maintenance` | `MaintenanceManager` | Enable maintenance mode + message |
| `bridge-networks` | `BridgeNetworkManager` | Enable/disable bridge chains |
| `explorer-config` | `ExplorerConfig` | Explorer deployment mode + endpoints |
| `node-types` | `NodeVisibilitySettings` | Toggle which node types appear in installer |
| `test-nodes` | `TestNodeManager` | Start/stop in-process test nodes (admin/founder only) |
| `wireguard` | `WireGuardPeerManager` | Assign tunnel IPs, generate wg0.conf, per-peer configs |
| `stablecoin-admin` | inline | Review/approve user stablecoin creations |
| `oracle` | inline | Oracle feed config + submission history |

### Test Nodes (Admin → Test Nodes tab)

| Node | Port | Block Time | Special Features |
|------|------|------------|-----------------|
| RPC Node | 8545 | 5s | Standard JSON-RPC |
| Lite Node | 8555 | 5s | Light sync mode |
| Full Node | 8565 | 2s | txpool + debug_traceTransaction + eth_getLogs |
| Boost Node | 8575 | 1s | MEV bundle (/boost/bundle), high TPS |

All test nodes bind to `0.0.0.0`; UI uses `window.location.hostname` (works on deployed servers).
UFW + iptables commands shown when host ≠ localhost.

### Cron Job Registry (7 jobs)
1. Network Snapshot — every hour (insert into network_snapshots)
2. Price Update — every 5 min (update oracle_feeds)
3. XP Decay — daily at midnight
4. Leaderboard Reset — monthly
5. DB Pruner — daily at 3am (prune old snapshots, logs, expired tokens)
6. Webhook Delivery Retry — every 15 min
7. Validator Score Refresh — every 30 min

---

## Server Services

| Service | File | Purpose |
|---------|------|---------|
| Express server | `server/index.ts` | App bootstrap, middleware, cron, monitoring |
| Auth routes | `server/auth.ts` | Login, register, TOTP, email verify, password reset |
| API routes | `server/routes.ts` | All `/api/*` endpoints |
| Storage layer | `server/storage.ts` | All DB read/write (Drizzle ORM) |
| Database | `server/db.ts` | pgPool + drizzle instance |
| Seeder | `server/seed.ts` | Founder account + achievements on startup |
| TOTP | `server/totp.ts` | Zero-dep RFC 6238 (built-in crypto — no otplib) |
| Email | `server/email.ts` | nodemailer (SMTP_HOST env; console fallback) |
| Wallet crypto | `server/walletCrypto.ts` | AES-256-GCM (WALLET_ENCRYPTION_KEY env) |
| Web Push | `server/webpush.ts` | VAPID auto-gen, push_subscriptions at runtime |
| AI Security | `server/security.ts` | IP blocklist, lockdown, rate limiting, payload inspection |

---

## Hooks & Utilities

### `useBridgeNetworks` — `src/hooks/useBridgeNetworks.ts`
```typescript
const { enabledChains, config, loading, refetch } = useBridgeNetworks();
// enabledChains: BridgeChain[] — only admin-enabled chains
```
Also exports `saveBridgeNetworkConfig(cfg)` for the admin component.

### `useRpcBalance` — `src/hooks/useRpcBalance.ts`
- Calls `eth_getBalance` via JSON-RPC to all configured RPC endpoints
- Returns `{ balance, isLoading, refetch }`

### `useCoinGeckoPrices` — `src/hooks/useCoinGeckoPrices.ts`
- Fetches USD prices for all 25 bridge chain tokens from CoinGecko
- Returns `{ prices, changes, isLoading, lastUpdated, refetch }`
- Auto-refreshes every 60 seconds

### `useWalletConnect` — `src/hooks/useWalletConnect.ts`
- Connects MetaMask (EVM wallet)
- Returns `{ address, isConnected, connect, disconnect, chainId }`

### `useWebSocket` — `src/hooks/useWebSocket.ts`
- WebSocket connection to GYDS node RPC
- Returns `{ latestBlock, tps, connected, gaveUp }`
- `gaveUp` = true after repeated failed reconnects

---

## Database Tables

Schema defined in `shared/schema.ts`. Drizzle returns camelCase in JS/TS.

| Table | Purpose |
|-------|---------|
| `users` | Core user accounts |
| `user_roles` | Role assignments: user / admin / founder |
| `profiles` | Extended user profiles |
| `wallets` | AES-256-GCM encrypted wallet storage per user |
| `node_installations` | Node install requests (nodeType, isApproved, isSynced, wireguardPublicKey) |
| `admin_config` | Key/value config (maintenance, bridge networks, explorer config, visibility) |
| `validators` | Validator registry with stake, uptime, commission |
| `transactions` | Transaction history |
| `tokens` | ERC-20 tokens deployed on GYDS chain (creator_id, not user_id) |
| `liquidity_pools` | AMM pools — reserves, TVL |
| `orders` | Orderbook orders (limit, market, stop-limit, TWAP, iceberg) |
| `vault_positions` | User positions in yield vaults |
| `bridge_transactions` | Cross-chain bridge history |
| `token_launches` | Token launchpad launches |
| `governance_proposals` | DAO proposals (parameter / treasury / upgrade / grant) |
| `governance_votes` | One-vote-per-user enforced |
| `governance_treasury` | DAO treasury balances (GYDS, GYD, ETH) |
| `nft_collections` | NFT collection metadata |
| `nft_tokens` | Individual NFTs (attributes JSONB, royalty %) |
| `nft_marketplace_listings` | Active listings with price |
| `community_posts` | Forum posts (discussion / showcase / idea) |
| `community_comments` | Nested comments |
| `community_votes` | Post + comment upvotes/downvotes |
| `referrals` | Referral codes per user |
| `referral_events` | Successful referral uses (+500 GYDS +100 XP) |
| `price_history` | OHLCV candles for GYDS/GYD |
| `network_snapshots` | Hourly chain health snapshots |
| `node_metrics_history` | Per-node performance history |
| `multisig_wallets` | M-of-N wallet definitions |
| `multisig_signers` | Signer list per wallet |
| `multisig_transactions` | Proposed transactions |
| `multisig_signatures` | Collected signatures |
| `api_keys` | Developer API keys (hashed, max 10/user) |
| `api_usage_logs` | Per-key request log |
| `webhook_endpoints` | Registered webhook URLs + event subscriptions |
| `webhook_deliveries` | Delivery log per event |
| `user_notifications` | In-app notification inbox |
| `insurance_pools` | Coverage pool definitions |
| `insurance_policies` | User coverage policies |
| `oracle_feeds` | Oracle price feed configs |
| `oracle_submissions` | Per-feed price submissions |
| `user_stablecoins` | User-created stablecoins (full CRUD) |
| `kyc_records` | KYC tier per user (0–3) |
| `on_chain_identities` | DID documents |
| `did_documents` | DID:GYDS resolution records |
| `sanctions_list` | Blocked wallet addresses |
| `rwa_assets` | Real-world asset definitions |
| `rwa_holdings` | User investment positions in RWA |
| `trade_history` | Public trade feed (50 seeded trades) |
| `user_xp` | XP totals per user |
| `xp_events` | XP award history |
| `achievements` | Achievement definitions (17 badges, 5 categories) |
| `user_achievements` | Unlocked achievements per user |
| `faucet_claims` | Faucet drip history (24h cooldown) |
| `mining_pools` | Mining pool definitions |

**Runtime-created tables** (CREATE IF NOT EXISTS in server code):
- `email_verification_tokens` — created in auth.ts on register
- `push_subscriptions` — created in webpush.ts on subscribe

---

## Config & Constants

### `src/config/network.ts`
```typescript
CHAIN_ID = 198282
RPC_ENDPOINTS = ['https://rpc.netlifegy.com', 'wss://ws.netlifegy.com']
BLOCK_TIME = 120 // seconds
GYDS_TOTAL_SUPPLY = 1_000_000_000
```

### `src/config/bridgeChains.ts`
- `EXTERNAL_CHAINS`: 25 network definitions (id, name, chainId, symbol, logoUrl, coingeckoId, isEVM)
- `GYDS_CHAIN`: the native GYDS chain definition

---

## Infrastructure Files

| Path | Purpose |
|------|---------|
| `public/docker/Dockerfile.explorer` | Explorer container |
| `public/docker/Dockerfile.node` | Generic node container |
| `public/docker/docker-compose.yml` | Dev compose |
| `public/docker/docker-compose.prod.yml` | Production compose |
| `public/docker/nginx.conf` | Nginx proxy config (CSP, HSTS, health endpoint) |
| `public/docker/init-indexer.sql` | Indexer DB schema |
| `public/scripts/install-fullnode.sh` | Build + install gyds-fullnode from fullnode.git |
| `public/scripts/install-genesis.sh` | Build + install gyds-genesis from genesis.git |
| `public/scripts/install-litenode.sh` | User-mode litenode install |
| `public/scripts/install-boostnode.sh` | Boost node (GYDS_NODE_MODE=boost, port 8547) |
| `public/scripts/install-rpcnode.sh` | RPC node + nginx TLS proxy |
| `public/scripts/install-bootnode.sh` | Peer discovery bootnode |
| `public/scripts/install-all-nodes.sh` | Multi-node on one server |
| `public/scripts/install-termux.sh` | Android (Termux) litenode install |
| `public/scripts/deploy-dashboard.sh` | PM2 + nginx + git cron for dashboard |
| `public/scripts/setup-server.sh` | Fresh Ubuntu + Cloudflare + subdomain |
| `public/scripts/redeploy.sh` | Safe git pull + build + PM2 reload |
| `public/scripts/ssl-setup.sh` | Certbot SSL for all subdomains |
| `public/manifest.json` | PWA manifest (shortcuts: wallet, explorer, defi) |
| `public/sw.js` | Service worker (offline cache + Web Push handler) |
| `public/blockchain-go/` | Full Go blockchain source (fullnode, litenode, bootnode) |
| `node-fixes/` | Corrected Go source files for all 4 GitHub node repos |
| `contracts/` | GydsSwap Solidity contracts (Hardhat project) |

---

## Known Patterns & Conventions

- **Drizzle returns camelCase** — never use snake_case property names in JS/TS after a DB query
- **Supabase shim** — `src/integrations/supabase/client.ts` routes all Supabase calls to Express API; no real Supabase connection needed
- **Layout import** — always `import { Layout } from '@/components/layout/Layout'` (named export, lowercase folder)
- **TOTP** — use `server/totp.ts` (built-in crypto); otplib v12 dropped the `authenticator` export
- **DB push** — `db:push` needs a TTY; use `drizzle-kit generate` then pipe SQL to psql instead
- **tokens table** — uses `creator_id` (no FK to users), not `user_id`; use LEFT JOIN + coalesce for leaderboard queries
- **Test nodes** — bind to `0.0.0.0`; UI uses `window.location.hostname`, not `localhost`
- **Block time** — 120s for fullnode and genesis; 1s for boostnode (intentional); 5s for litenode/rpcnode test nodes
- **API keys** — full key shown exactly once on creation, stored as hash in DB
- **WireGuard** — server IP is 10.8.0.1; peers auto-assigned 10.8.0.2 onwards
- **XP** — `awardXpOnce` prevents double-awards for milestone events
