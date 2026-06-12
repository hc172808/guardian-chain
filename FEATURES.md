# GYDSchain — GYDS Blockchain Network Dashboard
## Complete Feature Reference

This document is the single source of truth for every feature in this project.
Use it to understand what exists, where the code lives, and how pieces connect.

---

## Table of Contents
1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Authentication & Roles](#authentication--roles)
4. [Routing](#routing)
5. [Layout & Navigation](#layout--navigation)
6. [Core Pages](#core-pages)
7. [DeFi System](#defi-system)
8. [Ecosystem Pages](#ecosystem-pages)
9. [Admin Dashboard](#admin-dashboard)
10. [Hooks & Utilities](#hooks--utilities)
11. [Supabase Tables](#supabase-tables)
12. [Config & Constants](#config--constants)
13. [Infrastructure Files](#infrastructure-files)
14. [Known Patterns & Conventions](#known-patterns--conventions)

---

## Tech Stack

| Layer | Library | Notes |
|-------|---------|-------|
| Build | Vite 5 | Port 5000 in dev |
| UI | React 18 + TypeScript | Strict mode |
| Styling | Tailwind CSS + shadcn/ui | Custom CSS vars in `index.css` |
| Routing | React Router v6 | `BrowserRouter` in `App.tsx` |
| State | TanStack React Query | Data fetching + caching |
| Animation | Framer Motion | Page transitions, sidebar, modals |
| Auth + DB | Supabase | Project `rmwldjwkyhhaoqehdrbr` |
| Icons | Lucide React | Consistent icon set throughout |

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
│   ├── Validators.tsx         # Validator list (/validators)
│   ├── Mining.tsx             # Mining pools (/mining)
│   ├── Tokens.tsx             # Token factory (/tokens)
│   ├── DeFi.tsx               # DeFi hub (/defi) — 8-tab layout
│   ├── Wallet.tsx             # Wallet manager (/wallet)
│   ├── Transactions.tsx       # Tx history (/transactions)
│   ├── Network.tsx            # Network config (/network)
│   ├── Watchlist.tsx          # Price watchlist (/watchlist)
│   ├── NodeTerminal.tsx       # Node terminal (/node-terminal)
│   ├── Faucet.tsx             # Testnet faucet (/faucet)
│   ├── Governance.tsx         # DAO governance (/governance)
│   ├── NFT.tsx                # NFT marketplace (/nft)
│   ├── Analytics.tsx          # Chain analytics (/analytics)
│   ├── Community.tsx          # Community forum (/community)
│   ├── Developer.tsx          # Dev portal (/developer)
│   ├── Leaderboard.tsx        # Rankings (/leaderboard)
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
│   ├── NotFound.tsx           # 404 page
│   └── TokenDetail.tsx        # Token detail (/explorer/token/:address)
│
├── components/
│   ├── layout/
│   │   ├── Layout.tsx         # Desktop shell: sidebar + header bell + scanning line
│   │   ├── Sidebar.tsx        # Collapsible nav (Core / Ecosystem / Resources / Admin)
│   │   ├── MobileBottomNav.tsx# Mobile bottom bar (non-DeFi pages)
│   │   ├── NotificationBell.tsx # Desktop header notification dropdown
│   │   └── UpgradeBanner.tsx  # Maintenance/upgrade banner
│   │
│   ├── defi/
│   │   ├── SwapInterface.tsx  # Token swap UI
│   │   ├── PoolsList.tsx      # Liquidity pool list
│   │   ├── StakeInterface.tsx # Staking UI
│   │   ├── OrderBook.tsx      # Limit/market/stop-limit order book
│   │   ├── YieldVaults.tsx    # 5 auto-compound yield vaults
│   │   ├── CrossChainBridge.tsx # 25-chain bridge (reads enabled list from admin)
│   │   ├── Launchpad.tsx      # Token launchpad
│   │   ├── Portfolio.tsx      # DeFi portfolio view
│   │   ├── PositionDetails.tsx# Position detail drill-down
│   │   ├── WalletConnectBar.tsx # Connect wallet prompt
│   │   ├── BridgeHistory.tsx  # Bridge transaction history
│   │   ├── BridgeFeeComparison.tsx # Cross-chain fee comparison
│   │   ├── PriceSparkline.tsx # Mini price chart per token
│   │   └── DeFiBottomNav.tsx  # 8-tab bottom nav for DeFi page
│   │
│   ├── admin/
│   │   ├── BridgeNetworkManager.tsx # Enable/disable bridge chains (admin only)
│   │   ├── ExplorerConfig.tsx       # Explorer deployment config (admin only)
│   │   ├── ComponentVisibility.tsx  # Show/hide UI features for users
│   │   ├── MaintenanceManager.tsx   # Toggle maintenance mode + message
│   │   ├── ValidatorManager.tsx     # Validator admin
│   │   ├── BurnMintManager.tsx      # Token burn/mint operations
│   │   ├── StablecoinManager.tsx    # GYD/GYDS settings
│   │   ├── SponsorManager.tsx       # Project sponsors
│   │   ├── PremineManager.tsx       # Pre-mine allocations
│   │   ├── CoinLogoUpload.tsx       # Upload coin icons
│   │   ├── DatabaseSettings.tsx     # DB connection config
│   │   ├── FirewallManager.tsx      # IP firewall rules
│   │   ├── AuditLogViewer.tsx       # Audit log viewer
│   │   ├── HealthCheck.tsx          # System health monitor
│   │   ├── TokenPricingManager.tsx  # Exchange rate management
│   │   ├── TokenManager.tsx         # Token admin tools
│   │   ├── NodeInstaller.tsx        # Node deployment tools
│   │   ├── AdminConsole.tsx         # Interactive admin terminal
│   │   ├── MainnetPromotion.tsx     # Mainnet promotion manager
│   │   ├── MiningPoolAdmin.tsx      # Mining pool admin
│   │   └── SponsorFunding.tsx       # Sponsor funding tracker
│   │
│   ├── auth/
│   │   └── RequireAuth.tsx    # Auth gate wrapper component
│   │
│   ├── dashboard/             # Dashboard widgets (stats, charts, etc.)
│   ├── validators/            # Validator-specific components
│   ├── mining/                # Mining-specific components
│   ├── token/                 # Token factory components
│   ├── wallet/                # Wallet components
│   ├── node/                  # Node management components
│   ├── wireguard/             # WireGuard VPN components
│   └── ui/                    # shadcn/ui + custom primitives
│       ├── GlassCard.tsx      # Glass-morphism card (used everywhere)
│       └── ...                # All other shadcn components
│
├── hooks/
│   ├── useBridgeNetworks.ts   # Fetch enabled bridge chains from admin_config
│   ├── useWalletConnect.ts    # EVM wallet connection (MetaMask)
│   ├── useWebSocket.ts        # WebSocket connection to GYDS node
│   ├── useCoinGeckoPrices.ts  # Live prices for 25 chains from CoinGecko
│   ├── useNetworkDetection.ts # Detect current MetaMask chain
│   ├── useComponentVisibility.ts # Read which UI components are hidden
│   ├── useMaintenance.ts      # Read maintenance mode from admin_config
│   ├── useTransactionNotifications.ts # Real-time tx notification listener
│   ├── use-mobile.ts          # isMobile boolean (768px breakpoint)
│   └── use-toast.ts           # Toast notification hook
│
├── contexts/
│   └── AuthContext.tsx        # Supabase auth: user, roles, isAdmin, isFounder, signOut
│
├── config/
│   ├── bridgeChains.ts        # EXTERNAL_CHAINS array (25 networks) + GYDS_CHAIN
│   └── network.ts             # RPC endpoints, chain ID 13370, tokenomics
│
└── integrations/supabase/
    ├── client.ts              # Supabase client instance
    └── types.ts               # Auto-generated TypeScript types for all tables
```

---

## Authentication & Roles

**Provider:** Supabase Auth (email + password, wallet login)
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

### Auth guard
Wrap any component with `<RequireAuth>` to block unauthenticated access.
Admin/founder check is done inline: `if (!isFounder && !isAdmin) { navigate('/'); }`.

---

## Routing

All routes are in `src/App.tsx`. The `AppContent` component:
1. Runs `<MobileRedirect />` on every page — auto-sends phones/tablets to `/mobile`
2. Checks maintenance mode (redirects to `<MaintenancePage />` if enabled and user not logged in)
3. Renders the `<Routes>` tree

### MobileRedirect logic
```typescript
// Triggers on every route change (runs before rendering)
// Detects: user-agent regex OR window.innerWidth < 768
// Exempt routes: /mobile, /auth, /reset-password
// Action: navigate('/mobile', { replace: true })
```

---

## Layout & Navigation

### Desktop Layout (`src/components/layout/Layout.tsx`)
- Left: `Sidebar` (fixed 256px, `w-64`)
- Top-right: `NotificationBell` (fixed, desktop only)
- Content: `ml-64` offset, `p-8` padding
- Bottom scanning line effect (CSS animation)

### Sidebar (`src/components/layout/Sidebar.tsx`)
Three collapsible `NavSection` groups (uses Framer Motion AnimatePresence):
- **Core** — Dashboard, Block Explorer, Validators, Mining, Token Factory, DeFi, Wallet, Transactions, Watchlist, Network Config, Node Terminal, Testnet Faucet
- **Ecosystem** — Governance, NFT Marketplace, Analytics, Community, Leaderboard, Multi-Sig, Identity, Real-World Assets, Developer Portal
- **Resources** — Protocol Docs, Security Audit, Download
- **Admin** (conditional on `isAdmin || isFounder`) — Admin Dashboard, Edit Documentation

### Mobile Layout
- `/mobile` page has its own self-contained layout (no `Layout` wrapper)
- Other pages on mobile use `MobileBottomNav` from `Layout.tsx`
- DeFi page has its own `DeFiBottomNav` (8 tabs)

### Notification Bell (`src/components/layout/NotificationBell.tsx`)
- Desktop header, top-right
- 5 notification types: `tx`, `price`, `node`, `governance`, `announcement`
- Unread badge count, mark all read, dismiss individual
- Data pattern: reads from `user_notifications` table (currently demo data)

---

## Core Pages

### Dashboard (`/`) — `src/pages/Index.tsx`
- Live network stats (block height, TPS, validator count, price)
- WebSocket connection to GYDS node via `useWebSocket`
- Recent blocks + transactions panels
- Quick-action shortcuts

### Block Explorer (`/explorer`) — `src/pages/Explorer.tsx`
- Block list with real-time updates
- Transaction search by hash/address
- Token detail drill-down at `/explorer/token/:address`

### Validators (`/validators`) — `src/pages/Validators.tsx`
- Active validator list with stake, uptime, commission
- Validator detail panel

### Mining (`/mining`) — `src/pages/Mining.tsx`
- Mining pool list
- Block rewards, difficulty, hashrate

### Token Factory (`/tokens`) — `src/pages/Tokens.tsx`
- Create ERC-20 compatible tokens on GYDS chain
- Token list, detail, price chart

### Wallet (`/wallet`) — `src/pages/Wallet.tsx`
- Connect MetaMask / EVM wallet
- GYDS + GYD balances
- Send / receive flow

### Transactions (`/transactions`) — `src/pages/Transactions.tsx`
- Full transaction history for connected wallet
- Filter by type, date, status

### Network Config (`/network`) — `src/pages/Network.tsx`
- Add GYDS network to MetaMask (one-click)
- RPC endpoints, chain ID 13370, explorer URL

### Node Terminal (`/node-terminal`) — `src/pages/NodeTerminal.tsx`
- Web terminal for node operators
- Live log streaming via WebSocket

### Testnet Faucet (`/faucet`) — `src/pages/Faucet.tsx`
- Request testnet GYDS tokens
- Rate limited per address

### Watchlist (`/watchlist`) — `src/pages/Watchlist.tsx`
- Track token prices, set price alerts

---

## DeFi System

**Entry page:** `src/pages/DeFi.tsx`
**Bottom nav:** `src/components/defi/DeFiBottomNav.tsx` (8 tabs, rendered on all DeFi sub-views)

### 8 DeFi Tabs

| Tab | Component | Description |
|-----|-----------|-------------|
| `swap` | `SwapInterface.tsx` | Instant token swap (GYDS ↔ GYD + others) |
| `pools` | `PoolsList.tsx` | Liquidity pools — add/remove liquidity |
| `stake` | `StakeInterface.tsx` | GYDS staking for validator rewards |
| `orderbook` | `OrderBook.tsx` | Limit, market, stop-limit orders + depth chart |
| `vaults` | `YieldVaults.tsx` | 5 auto-compound yield strategies |
| `bridge` | `CrossChainBridge.tsx` | Cross-chain bridge (25 networks) |
| `launchpad` | `Launchpad.tsx` | New token launches + IDO participation |
| `portfolio` | `Portfolio.tsx` | DeFi positions summary + P&L |

### Cross-Chain Bridge (`CrossChainBridge.tsx`)
**Data source:** `src/config/bridgeChains.ts` (25 chains defined as `EXTERNAL_CHAINS`)
**Admin control:** reads `admin_config` table, key `bridge_networks_enabled` via `useBridgeNetworks` hook
- Admin enables/disables which chains users see — bridge only shows enabled ones
- EVM chains (11): use `wallet_switchEthereumChain` + `eth_getBalance` via MetaMask
- Non-EVM chains (14): trust-based flow (production would use cross-chain oracle/relayer)
- Live prices from CoinGecko via `useCoinGeckoPrices` hook
- Fee comparison, price sparklines, bridge transaction history

#### All 25 Supported Chains
**EVM:** Ethereum, BNB Chain, Polygon, Avalanche, Fantom, Cronos, Arbitrum One, Optimism, Base, zkSync Era, Linea
**Non-EVM:** Solana, NEAR Protocol, Cosmos Hub, Polkadot, Cardano, TRON, TON Network, XRP Ledger, Stellar, Algorand, Hedera, Aptos, Sui, Internet Computer

### Yield Vaults (`YieldVaults.tsx`)
5 vaults with different risk/reward profiles:
1. GYDS Auto-Stake — 8.5% APY, no lock
2. GYDS-GYD LP — 24.3% APY, auto-compound
3. GYD Stable — 5.2% APY, no lock
4. GYDS Boosted — 45.8% APY, 30-day lock
5. Validator Support — 18.9% APY, 14-day lock

### Order Book (`OrderBook.tsx`)
- Limit, Market, Stop-Limit order types
- Live bids/asks depth visualization
- Order history + open orders tab

---

## Ecosystem Pages

### Governance (`/governance`) — `src/pages/Governance.tsx`
- Proposal list (Active, Passed, Rejected, Pending filters)
- Vote For/Against with staked GYDS power
- DAO Treasury panel (multi-coin balances + spending history)
- Proposal voting progress bars with quorum indicator

### NFT Marketplace (`/nft`) — `src/pages/NFT.tsx`
- Browse NFT collections on GYDS chain
- Buy/list NFTs with GYDS
- Mint interface with metadata editor
- My NFTs + collection management

### Analytics (`/analytics`) — `src/pages/Analytics.tsx`
- OHLCV candlestick chart (GYDS price)
- Transaction heatmap (activity by hour/day)
- Network metrics: block time, gas price, active addresses
- Volume, liquidity, TVL over time

### Community (`/community`) — `src/pages/Community.tsx`
- Forum post list (upvote/downvote)
- Post detail with comments
- Referral system (unique codes, reward tracking)
- User reputation scores

### Developer Portal (`/developer`) — `src/pages/Developer.tsx`
- API key generation + management
- Interactive API playground (test endpoints live)
- Endpoint documentation (REST + WebSocket)
- SDK downloads (JavaScript, Python, Go, Rust)
- Rate limit display per key

### Leaderboard (`/leaderboard`) — `src/pages/Leaderboard.tsx`
- 4 categories: Overall XP, Top Traders, Best Validators, Mining Leaders
- Time filter: weekly / monthly / all-time
- Top 10 per category with rank badges

### Multi-Sig Wallet (`/multisig`) — `src/pages/Multisig.tsx`
- Create new multi-sig wallet (M-of-N threshold)
- Propose transactions
- Approve / reject flow (shows signature count progress)
- Execute when threshold reached
- Transaction history per wallet

### Identity (`/identity`) — `src/pages/Identity.tsx`
- Decentralized Identifier (DID) management
- KYC tier levels (Basic → Verified → Premium)
- Verified claims (email, phone, address, social)
- Reputation score breakdown

### Real-World Assets (`/rwa`) — `src/pages/RWA.tsx`
- Asset categories: Real Estate, Government Bonds, Commodities, Invoice Finance
- Asset detail with yield, maturity, minimum investment
- Secondary market listings
- Legal document storage (IPFS CID display)

### Mobile Hub (`/mobile`) — `src/pages/Mobile.tsx`
**Auto-redirect:** any mobile user-agent or screen < 768px is sent here from all other routes
- Self-contained layout (no desktop sidebar)
- 5-tab bottom navigation: Home, Explorer, DeFi, Wallet, More
- **Home tab:** Portfolio card (GYDS/GYD/Staked), 6 quick actions, network stats, recent activity
- **Explorer tab:** Search bar, quick links to Explorer, Transactions, Validators, Mining, Tokens
- **DeFi tab:** Shortcut cards to all 6 DeFi features
- **Wallet tab:** Connected wallet panel, Tx History, Watchlist, Faucet shortcuts
- **More tab:** Governance, Leaderboard, Community, Docs + Sign Out + "Switch to Desktop" button

---

## Admin Dashboard

**Route:** `/admin` — `src/pages/Admin.tsx`
**Access:** `isFounder || isAdmin` only

### All 23 Admin Tabs

| Tab value | Component | Purpose |
|-----------|-----------|---------|
| `nodes` | inline | Approve/reject/revoke node installations |
| `validators` | `ValidatorManager` | Validator management |
| `users` | inline | View all users and roles |
| `tokens` | `BurnMintManager` | Token supply operations |
| `stablecoin` | `StablecoinManager` | GYD/GYDS stablecoin settings |
| `sponsors` | `SponsorManager` | Project sponsor management |
| `premine` | `PremineManager` | Pre-mine allocation management |
| `logos` | `CoinLogoUpload` | Upload/replace coin icons |
| `database` | `DatabaseSettings` | DB connection settings |
| `github` | inline | GitHub repo sync / re-pull |
| `firewall` | `FirewallManager` | IP firewall rules |
| `audit` | `AuditLogViewer` | System audit log |
| `health` | `HealthCheck` | Node + system health monitor |
| `token-pricing` | `TokenPricingManager` | Exchange rate management |
| `token-mgmt` | `TokenManager` | Token admin tools |
| `installer` | `NodeInstaller` | Deploy new nodes |
| `console` | `AdminConsole` | Interactive admin terminal |
| `visibility` | `ComponentVisibility` | Show/hide UI features per group |
| `promotion` | `MainnetPromotion` | Mainnet transition manager |
| `pools` | `MiningPoolAdmin` | Mining pool admin |
| `maintenance` | `MaintenanceManager` | Enable maintenance mode + custom message |
| `bridge-networks` | `BridgeNetworkManager` | Enable/disable bridge chains per-network |
| `explorer-config` | `ExplorerConfig` | Explorer deployment mode + endpoints |

### Bridge Network Manager (`BridgeNetworkManager.tsx`)
- Toggle each of 25 networks on/off
- Enable All / Disable All bulk actions
- Saves to `admin_config` table (key: `bridge_networks_enabled`)
- Bridge UI reads this on load — disabled chains are invisible to users
- Grouped by EVM and Non-EVM

### Explorer Config (`ExplorerConfig.tsx`)
- **Mode:** Co-located (explorer on same server as nodes) vs Standalone (dedicated server)
- **Explorer URL + Port** (e.g. `https://explorer.netlifegy.com:4000`)
- **Node RPC HTTP URL** (e.g. `http://localhost:8545`)
- **Node RPC WebSocket URL** (e.g. `ws://localhost:8546`)
- **Separate Indexer DB** toggle — dedicated PostgreSQL for block data
- Saves to `admin_config` table (key: `explorer_config`)

### Component Visibility (`ComponentVisibility.tsx`)
- Uses `useComponentVisibility` hook
- Hides features from non-admin users instantly (real-time Supabase subscription)
- Components are grouped by category (e.g. DeFi, Wallet, Explorer)

---

## Hooks & Utilities

### `useBridgeNetworks` — `src/hooks/useBridgeNetworks.ts`
```typescript
const { enabledChains, config, loading, refetch } = useBridgeNetworks();
// enabledChains: BridgeChain[] — only admin-enabled chains
// config: Record<string, boolean> — raw enabled/disabled map
```
Also exports `saveBridgeNetworkConfig(cfg)` for the admin component.

### `useCoinGeckoPrices` — `src/hooks/useCoinGeckoPrices.ts`
- Fetches USD prices for all 25 bridge chain tokens from CoinGecko API
- Returns `{ prices, changes, isLoading, lastUpdated, refetch }`
- Auto-refreshes every 60 seconds

### `useWalletConnect` — `src/hooks/useWalletConnect.ts`
- Connects MetaMask (EVM wallet)
- Returns `{ address, isConnected, connect, disconnect, chainId }`

### `useWebSocket` — `src/hooks/useWebSocket.ts`
- WebSocket connection to GYDS node RPC
- Returns `{ latestBlock, tps, connected, gaveUp }`
- `gaveUp` becomes `true` after repeated failed reconnects

### `useNetworkDetection` — `src/hooks/useNetworkDetection.ts`
- Detects which chain MetaMask is on
- Returns `{ networkName, isExternalNetwork, suggestBridge, chainId, dismissSuggestion }`

### `useComponentVisibility` — `src/hooks/useComponentVisibility.ts`
- Reads `hidden_components` from `admin_config`
- Returns `{ hidden: string[], toggle(key), loading }`

### `useMaintenance` — `src/hooks/useMaintenance.ts`
- Reads `maintenance_mode` from `admin_config`
- Returns `{ enabled: boolean, message: string, loading }`

### `useTransactionNotifications` — `src/hooks/useTransactionNotifications.ts`
- Subscribes to Supabase realtime on `bridge_transactions` table
- Shows toast when a user's transaction confirms

---

## Supabase Tables

All types auto-generated in `src/integrations/supabase/types.ts`.

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (id, email, role, created_at) |
| `user_roles` | Role assignments: `user`, `admin`, `founder` |
| `node_installations` | Node install requests (type, WireGuard key, approval status) |
| `admin_config` | Key/value config store (maintenance mode, bridge networks, explorer config, visibility) |
| `bridge_transactions` | Cross-chain bridge tx records |
| `validators` | Validator registry |
| `mining_pools` | Mining pool definitions |
| `tokens` | Token factory creations |
| `token_prices` | Historical token price data |
| `order_book` | DEX order book entries |
| `yield_vaults` | Vault definitions |
| `vault_positions` | User vault deposit positions |
| `governance_proposals` | DAO proposals |
| `governance_votes` | Individual votes |
| `nft_collections` | NFT collections |
| `nft_tokens` | Individual NFT metadata |
| `multisig_wallets` | Multi-sig wallet definitions |
| `multisig_transactions` | Proposed transactions |
| `multisig_signatures` | Per-signer approvals |
| `user_notifications` | In-app notification inbox |
| `ai_security_events` | AI firewall security events |
| `audit_logs` | Admin audit trail |

### Key `admin_config` keys
| Key | Value shape | Used by |
|-----|------------|---------|
| `maintenance_mode` | `{ enabled: boolean, message: string }` | `useMaintenance` |
| `hidden_components` | `string[]` | `useComponentVisibility` |
| `bridge_networks_enabled` | `Record<string, boolean>` | `useBridgeNetworks` |
| `explorer_config` | `{ mode, explorerUrl, explorerPort, rpcHttpUrl, rpcWsUrl, ... }` | `ExplorerConfig` admin tab |

---

## Config & Constants

### `src/config/bridgeChains.ts`
- Exports `EXTERNAL_CHAINS: BridgeChain[]` — 25 networks, each with `{ id, name, symbol, chainId, logo, color, bridgeFee, evm }`
- Exports `GYDS_CHAIN` — the native chain descriptor
- **Import from here** — do NOT define chains inline in components

### `src/config/network.ts`
- Chain ID: `13370`
- Network name: `GYDSchain`
- RPC URL: reads from `GYDS_RPC_LAN` env var (no hardcoded IPs)
- Explorer URL: `https://explorer.netlifegy.com`
- Native token: `GYDS`
- Stablecoin: `GYD`

---

## Infrastructure Files

### Docker
| File | Purpose |
|------|---------|
| `public/docker/Dockerfile.node` | Go blockchain node image |
| `public/docker/Dockerfile.explorer` | Nginx + React dashboard image |
| `public/docker/nginx.conf` | Nginx with CSP, rate limiting, health endpoint |
| `public/docker/docker-compose.yml` | Dev/staging stack |
| `public/docker/docker-compose.prod.yml` | Production stack |

### Shell Scripts (`public/scripts/`)
| File | Purpose |
|------|---------|
| `install-fullnode.sh` | Ubuntu full node installer (founder only) |
| `install-litenode.sh` | Ubuntu/macOS lite node installer |
| `install-node.sh` | Generic node installer (validator/fullnode/rpc/litenode) |
| `deploy-dashboard.sh` | Dashboard-only deployment |
| `deploy-remote-fullnode.sh` | Remote node deployment via SSH |
| `ssl-setup.sh` | Let's Encrypt SSL for all subdomains |
| `setup-gydschain.sh` | Database schema setup |
| `gydschain-schema.sql` | Block indexer DB schema |
| `.env.production.template` | Production env var template |

### Required Environment Variables
```bash
VITE_SUPABASE_URL=            # Supabase project URL
VITE_SUPABASE_PUBLISHABLE_KEY= # Supabase anon key
VITE_SUPABASE_PROJECT_ID=     # Supabase project ID
GYDS_RPC_LAN=                 # Node RPC endpoint (no trailing slash)
GYDS_SSL_EMAIL=               # Email for Let's Encrypt cert
DOMAIN=                       # Primary domain (e.g. netlifegy.com)
```

---

## Known Patterns & Conventions

### GlassCard
The standard card component used everywhere:
```tsx
import { GlassCard } from '@/components/ui/GlassCard';
<GlassCard className="p-6"> ... </GlassCard>
```
Applies `glass-card` CSS class (defined in `index.css`).

### Page structure
Every page that uses the desktop layout wraps its content:
```tsx
import { Layout } from '@/components/layout/Layout';
const MyPage = () => (
  <Layout>
    <div className="space-y-6">...</div>
  </Layout>
);
```
Pages with their own mobile layout (DeFi, Mobile) do NOT use `Layout`.

### Admin config pattern
To read a config value:
```typescript
const { data } = await supabase
  .from('admin_config')
  .select('config_value')
  .eq('config_key', 'your_key')
  .maybeSingle();
```
To write:
```typescript
await supabase.from('admin_config').upsert(
  { config_key: 'your_key', config_value: yourValue, updated_at: new Date().toISOString() },
  { onConflict: 'config_key' }
);
```

### Role-gating
```tsx
const { isFounder, isAdmin } = useAuth();
if (!isFounder && !isAdmin) return <AccessDenied />;
```

### CSS utility classes (defined in `index.css`)
| Class | Effect |
|-------|--------|
| `glass-card` | Frosted glass background + border |
| `grid-pattern` | Subtle dot-grid background |
| `text-gradient-primary` | Teal gradient text |
| `bg-gradient-primary` | Teal gradient background |
| `neon-emerald` | Neon green glow color |
| `scanning-line` | Animated horizontal scan line |

### Framer Motion conventions
- Page content uses `motion.div` with `initial={{ opacity: 0 }} animate={{ opacity: 1 }}`
- Sidebar open/close: `initial={{ x: -280 }} animate={{ x: 0 }}` with spring physics
- Tab transitions: `AnimatePresence mode="wait"` with `y: 10` slide

### Non-EVM bridge flow
Non-EVM chains (NEAR, Cosmos, Polkadot, Cardano, TRON, TON, XRP, Stellar, Algorand, Hedera, Aptos, Sui, ICP) use a trust-based flow in `verifySourceWallet` — the balance check returns `{ ok: true }` immediately. In production, swap this for cross-chain oracle validation once the relayer is deployed.

---

*Last updated: June 2026 — 34 pages, 23 admin tabs, 25 bridge chains, full mobile hub*
