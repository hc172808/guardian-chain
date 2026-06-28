# ChainCore — GYDS Dashboard · Feature Todo

_Last updated: June 27, 2026_

---

## 👋 Contributor Guide

This section is for anyone helping build ChainCore. Read this first before touching any code.

### Tech Stack
| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Vite + React 18 + TypeScript | Port 5000 in dev |
| Backend | Express.js + Passport.js | Port 5001 in dev |
| Database | PostgreSQL via Drizzle ORM | `DATABASE_URL` env var (Replit managed) |
| Auth | Username/password + Web3 signature | Sessions via connect-pg-simple |
| Styling | Tailwind CSS + shadcn/ui | Dark theme only |
| State | TanStack React Query + React Context | AuthContext is the main context |
| Blockchain | **Custom private EVM chain — Chain ID 13370, GYDS Network** | RPC: rpc.netlifegy.com |

> ⚠️ **This is a fully custom private blockchain network.** It is EVM-compatible (uses the same tooling as Ethereum) but runs its own validators, nodes, consensus, and tokenomics. It is NOT Ethereum mainnet or any public testnet.

### Running the project
```bash
npm run dev          # starts both Express (5001) + Vite (5000) concurrently
npm run build        # build frontend only
npm run typecheck:server  # check server types (pre-existing Express 5 errors; don't block deploy)
```

### Database rules — READ BEFORE ANY SCHEMA CHANGE
- **Source of truth:** `shared/schema.ts` (Drizzle ORM schema)
- **DO NOT use `npm run db:push` alone** — TTY issue; may say "nothing to migrate" even when DB is out of sync
- **Correct way to add tables/columns:**
  ```bash
  # 1. Add to shared/schema.ts
  # 2. Generate migration SQL
  npm run db:generate
  # 3. Apply directly via psql
  psql "$DATABASE_URL" < drizzle/migrations/latest.sql
  # OR: raw ALTER TABLE / CREATE TABLE via psql for simple changes
  ```
- Always verify with: `psql "$DATABASE_URL" -c "\d tablename"`
- Drizzle returns **camelCase** column names — use camelCase in TypeScript interfaces
- **Full schema snapshot** (75+ tables, safe to re-run): `psql "$DATABASE_URL" < migrations/0002_full_schema_sync.sql`

### Key files
| File | Purpose |
|------|---------|
| `shared/schema.ts` | All DB table definitions (source of truth) |
| `server/routes.ts` | All Express API routes |
| `server/auth.ts` | Auth logic (register, login, TOTP, sessions) |
| `server/storage.ts` | DB query functions (used by routes) |
| `server/db.ts` | Drizzle client + pgPool setup |
| `src/App.tsx` | All frontend routes |
| `src/components/layout/Sidebar.tsx` | Sidebar navigation |
| `src/contexts/AuthContext.tsx` | Auth state (user, signIn, signOut) |
| `src/integrations/supabase/client.ts` | Supabase shim — routes ALL Supabase calls to Express API |

### Import rules (critical — breaks build if wrong)
```typescript
// ✅ CORRECT:
import { Layout } from '@/components/layout/Layout';

// ❌ WRONG — causes Vite 500:
import Layout from '@/components/Layout';
```

### Adding a new page
1. Create `src/pages/YourPage.tsx` — use `<Layout>` as wrapper
2. Add import + `<Route>` in `src/App.tsx`
3. Add nav item to `src/components/layout/Sidebar.tsx`
4. Add to PAGES array in `src/pages/Preview.tsx`
5. Add backend routes to `server/routes.ts`
6. Mark done here

### Login as founder (first boot)
```
Username: netlifegy
Password: GYDSchain2026!
```

### Founder wallet address
```
0x6422d12bfaddee5142bfad21b3006a74d0907b1
```

---

## ✅ Completed Features

### Core Platform
- [x] Vite + React + TypeScript SPA (port 5000)
- [x] Express.js backend (port 5001) with Passport.js session auth
- [x] Replit PostgreSQL via Drizzle ORM (75+ tables)
- [x] Custom username/password login
- [x] Web3 wallet signature login (EIP-6963: MetaMask, Trust Wallet, Coinbase, Brave, OKX, Rabby, Phantom)
- [x] Founder account auto-seeded on first boot
- [x] Three user roles: user, admin, founder
- [x] Session management + active session panel (view/revoke devices)
- [x] 2FA / TOTP (RFC 6238 — zero-dep server implementation in `server/totp.ts`)
- [x] 2FA backup codes (8 codes, SHA-256 hashed, single-use)
- [x] Email verification (token-based; console in dev, SMTP in prod)
- [x] Password reset via email
- [x] WhatsApp-based OTP reset
- [x] Biometric unlock (WebAuthn — Face ID / fingerprint)
- [x] Ledger hardware wallet (WebHID, BIP44, 5 accounts)
- [x] Optional phone number on registration
- [x] Profile privacy toggle

### 🔗 Custom Private Blockchain Network
- [x] **Chain ID: 13370** — fully custom, not Ethereum mainnet or any testnet
- [x] **Block time: 120 seconds** — all UI, node binaries, and test nodes use 120s
- [x] **Consensus: Proof of Stake (PoS)** — custom engine with slashing (`consensus/pos.go`)
- [x] **Native token: GYDS** — used for gas, staking, governance, and all fees
- [x] **Stablecoin: GYD** — pegged stablecoin, Stablecoin Factory in DeFi
- [x] **Network domain:** `netlifegy.com` · RPC: `rpc.netlifegy.com`
- [x] **Genesis block config** — managed via Admin → Nodes → Genesis Manager
- [x] **Bootstrap nodes** — `GYDS_BOOTSTRAP_NODES` env var; managed from Admin
- [x] **WireGuard VPN mesh** — all nodes communicate over encrypted tunnel (10.8.0.x)
- [x] **CORS on RPC** — `Access-Control-Allow-Origin: *` so MetaMask / Trust Wallet can connect

### 🖥️ Node Infrastructure
- [x] **Node types:** lite, fullnode, rpc, boostnode, validator, genesis, bootnode, devnode, localnode
- [x] **Test node manager** — 21 test nodes (7 types × 3 networks: mainnet/testnet/devnet)
- [x] **Node registration & approval** — users register nodes; admin approves / rejects / removes
- [x] **Node ping button** — manual RPC test (`eth_blockNumber`, 5s timeout) on each node card
- [x] **Node auto-pinger cron** — runs every 5 min; pings all approved remote nodes; updates `is_online`
- [x] **Node offline/recovery alerts** — push notification + in-app bell to all admins/founders on status change
- [x] **Main fullnode designation** — ⭐ star one fullnode as primary; shown on card + in VPN config
- [x] **VPN tunnel IP display** — each approved node card shows its assigned `10.8.0.x` address
- [x] **Node details drawer** — click node card → side panel with latency/block/peer charts + WireGuard peer config snippet
- [x] **Node ping history** — in-memory ring buffer (40 entries per node); powers drawer charts
- [x] **Node heartbeat endpoint** — `POST /api/nodes/:id/heartbeat`; deployed nodes call this to stay online
- [x] **Node install scripts** — `install-litenode.sh`, `install-fullnode.sh`, `install-rpcnode.sh`, `install-boostnode.sh`, `install-validatornode.sh`, `install-genesis.sh`, `install-bootnode.sh`, `install-all-nodes.sh`
- [x] **Node installer UI** — browser wizard generating `curl | bash` commands per node type with correct GitHub URLs
- [x] **Node repo sync checker** — Admin → GitHub: checks each repo status via GitHub API + auto-triggers on push webhook
- [x] **Genesis Manager** — Admin → Nodes: manage genesis validators/peers/enodes; generates `GYDS_BOOTSTRAP_NODES`
- [x] **WireGuard Peer Manager** — assigns tunnel IPs, generates `wg0.conf` + per-peer client configs
- [x] **Validator node (Go)** — PoS engine + slashing + `validator_*` JSON-RPC + `/validators` HTTP; `node-fixes/validatornode/`
- [x] **Genesis node** — serves `GET /genesis.json`; responds to `eth_chainId` / `eth_blockNumber`; ports 8590/8605/8655
- [x] **Boot node** — serves `GET /peers`; responds to `net_peerCount` / `admin_peers`; 32 peers; ports 8595/8606/8656
- [x] **Deploy scripts** — `setup-server.sh`, `redeploy.sh`, `deploy-dashboard.sh`, `deploy-remote-fullnode.sh`
- [x] **Update script** — `public/scripts/update-chaincore.sh` — git pull → npm install → DB migrate → build → PM2 reload
- [x] **Admin "Update Project" button** — links to download update script; visible to founder/admin only
- [x] **`gyds-config.env`** — shared config sourced by all 7 node install scripts
- [x] **Docker files + Compose configs** in `public/docker/`

### Dashboard & Explorer
- [x] User GYDS balance card (total, available, locked, USD; 30s auto-refresh)
- [x] Admin-controlled dashboard widget visibility (8 widgets)
- [x] Block explorer (search blocks, transactions, addresses)
- [x] Validator dashboard with delegation
- [x] Network config page (one-click add to MetaMask / Trust Wallet)
- [x] Real-time network stats in sidebar
- [x] Transaction history
- [x] Watchlist (track tokens)
- [x] Price alerts
- [x] Webhooks (subscribe to chain events)
- [x] Node terminal (live browser terminal)

### DeFi (13 tabs)
- [x] Token Swap · Liquidity Pools · Staking · Yield Farming · Order Book · Vaults
- [x] Cross-Chain Bridge (25 networks; EVM + non-EVM)
- [x] Stablecoin Factory (5-step wizard; fees enforced server-side)
- [x] Perpetuals · Prediction Markets · Launchpad · Portfolio Tracker · IL Calculator

### Wallet
- [x] Multi-wallet creation (AES-256-GCM encrypted seed)
- [x] Send / receive GYDS · QR code support · PIN rotation
- [x] Faucet (testnet GYDS drip, 24h cooldown)
- [x] Cash Out requests

### Governance
- [x] Proposal creation and voting · Voting power delegation · Governance notifications

### Token Factory
- [x] Deploy ERC-20 tokens on GYDS chain · Launchpad · Creator leaderboard (XP)

### NFT Marketplace
- [x] Browse / list / buy NFTs · Basic marketplace UI

### Mining
- [x] Mining dashboard + hashrate stats · Mining pool live data (polls `/api/nodes` every 15s)

### Community, Identity, Multi-Sig, RWA, Insurance
- [x] Community posts/comments/votes
- [x] DID page · KYC tier system (Tier 1/2/3)
- [x] Multi-sig wallet creation + signing UI
- [x] RWA investment page
- [x] Parametric insurance policies

### Living Trust
- [x] 5 trust types · 5-step wizard · multi-beneficiary · conditions · vault deposit
- [x] Full CRUD API + DB tables (trusts, trust_beneficiaries, trust_conditions, trust_payments)

### Analytics
- [x] Chain analytics (TPS, volume, active wallets) · Leaderboard (XP + achievements)

### Developer Portal
- [x] API docs · SDK section (JS/TS + Python available; Go in progress; Rust planned)
- [x] CLI reference

### Admin Panel (40+ tabs)
- [x] Categorised dropdown nav (6 sections)
- [x] User management · Node management · WireGuard peer manager · Genesis Manager
- [x] Test node manager (21 nodes) · Validator monitor
- [x] Cron job manager (8 jobs: db-pruner, session-cleanup, network-snapshot, webhook-retry, price-feed, health-check, email-cleanup, **node-autopinger**)
- [x] GitHub webhook receiver (HMAC-SHA256) · Node repo sync checker
- [x] Payment methods manager · Buy/cashout request management
- [x] Monitoring tab (RPC health, DB, memory, uptime) · Audit log viewer
- [x] Dashboard + Download visibility controls
- [x] Server Config tab (live-edit env vars; writes `.env` + PM2 restart)
- [x] Revenue dashboard (trust fees, stablecoin fees, insurance, bridge, buy/cashout)
- [x] Query cache stats + manual clear
- [x] Wallet App tab (upload APK/IPA/EXE/DMG; manage releases)
- [x] **"Update Project" button** — founder/admin button; downloads `update-chaincore.sh`

### Notifications
- [x] In-app notification bell · Browser push (Web Push / VAPID)
- [x] Telegram alerts · WhatsApp alerts · Email (SMTP optional)
- [x] Node offline / recovery alerts (push + in-app to all admins/founders)

### Security
- [x] CSP + security headers · Rate limiting · IP blocking / firewall
- [x] CORS headers for RPC endpoints

### PWA / Mobile
- [x] PWA (manifest v2, 7 icons, 4 shortcuts) · Service worker (stale-while-revalidate + background sync)
- [x] Install prompt (Android + iOS) · Edge side panel
- [x] Mobile hub (`/mobile`) — 5 tabs with real balances, transactions, stats, faucet, NFT gallery, staking

### GYDS Wallet — Mobile App
> **Repo:** https://github.com/hc172808/your-digital-wallet

- [x] GYDS chain 13370 configured · App ID `io.netlifegy.gyds`
- [x] Capacitor config · Bubblewrap TWA · PWABuilder config
- [x] Android + iOS build scripts + SETUP.md

---

## 🔁 In Progress / Partial

- [~] **Node details drawer** — component built (`NodeDetailsDrawer.tsx`); needs wiring into Admin node card `onClick`
- [~] **Trust vault auto-distribution** — condition tracking exists; on-chain distribution not yet wired
- [~] **SDK — Go** — marked "In Progress" in Developer Portal; stub only
- [~] **Email SMTP** — logs to console in dev; needs SMTP env vars for production delivery
- [~] **Validator node repo** — Go source in `node-fixes/validatornode`; needs GitHub release pipeline
- [~] **Referral system** — DB tables exist (`referrals`, `referral_events`); no UI page yet
- [~] **Announcement banner GUI** — works via Admin Console `announce` command; no dedicated panel yet

---

## 📋 Planned / Todo

### 🔗 Private Blockchain — Still Needed
- [ ] **On-chain ERC-20 / ERC-721 deployment** — deploy real contracts to GYDS chain (currently simulated)
- [ ] **Real AMM / DEX contracts** — Uniswap v2-style contracts on GYDS chain
- [ ] **Block explorer live data** — connect to real node RPC for live blocks/txs (currently mocked)
- [ ] **On-chain governance voting** — currently off-chain DB; needs smart contract
- [ ] **Validator registration on-chain** — one-click from dashboard; currently manual
- [ ] **Staking smart contract** — real stake/unstake/reward distribution on-chain
- [ ] **Node auto-update mechanism** — compare local vs GitHub release tag; notify + one-click update
- [ ] **Termux (Android) node installer** — script in place, needs testing
- [ ] **Chain bridge (native atomic swap)** — between GYDS chain and another EVM chain
- [ ] **Real RPC load balancing** — route requests across multiple RPC nodes (currently single endpoint)
- [ ] **Slashing dashboard** — show validator slashing events from PoS engine log

### DeFi Improvements
- [ ] Real AMM pricing (currently simulated)
- [ ] Order book matching engine (backend)
- [ ] Perps funding rate feed (live oracle)
- [ ] Prediction market resolution oracle

### Governance
- [ ] Quorum and threshold enforcement
- [ ] Proposal templates

### Identity
- [ ] W3C DID document creation + IPFS storage
- [ ] Verifiable credentials issuance
- [ ] Cross-chain identity verification

### NFT Marketplace
- [ ] NFT minting wizard
- [ ] On-chain royalties
- [ ] Collection pages + auction support

### Analytics
- [ ] Historical chart data (time series — charts show live only now)
- [ ] Wallet analytics (individual address history)
- [ ] Token holder distribution chart

### Living Trust
- [ ] Trustee notification emails/push when conditions triggered
- [ ] Emergency unlock multi-sig (100 GYDS, 2-of-3 signing)
- [ ] Trust document PDF export
- [ ] Annual auto-renewal (auto-deduct 10 GYDS/year from vault)
- [ ] Beneficiary portal

### Security
- [ ] Withdrawal 2FA (require TOTP for large sends)
- [ ] Anomaly detection (flag unusual login IPs)
- [ ] Auto-ban on repeated failed login attempts

### Platform
- [ ] KYC full integration (Sumsub/Onfido — simulated until mainnet)
- [ ] Referral UI page (invite links + GYDS rewards — DB tables exist)
- [ ] Multi-language i18n
- [ ] Dark/light theme switcher (dark-only now)
- [ ] SDK — Rust (planned)
- [ ] SDK — Go (complete examples + release)
- [ ] GraphQL API (currently REST-only)
- [ ] WebSocket subscriptions for real-time price feeds

### Admin
- [ ] Bulk user actions (export CSV, mass-ban)
- [ ] Scheduled announcements GUI (currently console command only)

### Mobile App (next steps)
- [ ] Run `bash mobile-wallet/configure.sh` → enter domain
- [ ] Set `VITE_API_BASE=https://netlifegy.com` in wallet `.env.local`
- [ ] Android: `bash mobile-wallet/android-build.sh` → sign → submit to Play Store
- [ ] iOS: `bash mobile-wallet/ios-build.sh` (needs Mac + Xcode) → Archive → App Store
- [ ] Add `/.well-known/assetlinks.json` to server for Android TWA

---

## 💡 Ideas / Backlog

- [ ] **Will & Estate Planner** — companion to Living Trust; encrypted text editor
- [ ] **Token-Gated Content** — lock blog posts/docs behind minimum GYDS balance
- [ ] **Staking Rewards Dashboard** — pending rewards, APY history, compound calculator
- [ ] **Decentralised Storage** — pin trust docs + NFT metadata to IPFS / Arweave
- [ ] **DAO Treasury** — community-controlled fund with governance-voted disbursements
- [ ] **Grant Program UI** — apply for GYDS ecosystem grants
- [ ] **Social Recovery** — recover wallet via trusted contacts (no seed phrase)
- [ ] **Subscription Payments** — recurring GYDS payments on-chain
- [ ] **Carbon Credits** — on-chain carbon offset certificates (RWA extension)
- [ ] **Slashing history page** — full log of validator slashing events
- [ ] **Network upgrade governance** — submit and vote on chain parameter changes

---

_To mark something complete: change `- [ ]` to `- [x]` and move it to the ✅ section._
_Last updated by agent: June 27, 2026_
