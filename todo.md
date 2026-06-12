# GYDSchain — Master Project TODO & Roadmap

> Last updated: 2026-06-12 | Always update this file when work is done or started.
> Legend: `[x]` Done · `[ ]` Not started · `[~]` In progress · `[!]` Blocked

**Blockchain:** GYDSchain | **Coin:** GYDS | **Stablecoin:** GYD | **Chain ID:** 13370
**Domain:** netlifegy.com — subdomains ONLY (ws. rpc. node. explorer. app. faucet. swap. bridge. docs. api.)

---

## GitHub Repositories

| Project | Repo | Status |
|---|---|---|
| GYDSchain Dashboard | https://github.com/hc172808/guardian-chain.git | ✅ Active |
| All Nodes (full/lite/boost/rpc/validator/genesis) | https://github.com/hc172808/fullnode.git | 🔧 In progress |

---

## Network & Subdomains

| Subdomain | Purpose |
|---|---|
| app.netlifegy.com | Dashboard |
| explorer.netlifegy.com | Block Explorer |
| rpc.netlifegy.com | RPC Endpoint |
| ws.netlifegy.com | WebSocket RPC |
| node.netlifegy.com | Node Portal |
| api.netlifegy.com | REST / GraphQL API |
| faucet.netlifegy.com | Testnet Faucet |
| bridge.netlifegy.com | Cross-Chain Bridge |
| swap.netlifegy.com | GydsSwap DEX |
| docs.netlifegy.com | Documentation |

---

## ✅ Completed

### Auth & Access
- [x] Username + password login (bcrypt + passport-local)
- [x] Web3 wallet login (ECDSA signature challenge + ethers.verifyMessage)
- [x] Session persistence via connect-pg-simple
- [x] Register with username / email / password
- [x] netlifegy@gmail.com seeded as admin + founder
- [x] Role-based middleware (requireAuth, requireAdmin, enrichUserWithRoles)
- [x] Password reset via token (request + confirm routes)
- [x] 2FA / TOTP (setup, verify, disable — RFC 6238, built-in crypto)

### Mobile Experience
- [x] Mobile device auto-redirect to /mobile
- [x] Bottom tab navigation (Home, Explorer, DeFi, Wallet, More)
- [x] Back button when navigating from mobile hub
- [x] Phone-style UI (status bar, safe area, native app look)
- [x] Pull-to-refresh (touch gesture, progress indicator, 72px threshold)
- [x] QR code scanner — wired into Wallet send dialog and Mobile "QR Pay" quick action

### Platform Migration
- [x] Migrated from Supabase → Replit Auth + Replit PostgreSQL
- [x] Express API server on port 5001 with Drizzle ORM + full schema
- [x] All 160 frontend modules loading without errors
- [x] Fixed temporal dead zone crash in miningPools.ts
- [x] Supabase shim routing all calls to /api/*

### Admin Panel
- [x] Node visibility controls (admin/founder toggles)
- [x] Git Sync panel (real git pull with live output)
- [x] Audit logs
- [x] Node type approval
- [x] Admin → Users tab: full UserManager — all profiles, search, role selector, ban/unban, stats
- [x] Admin → Nodes: fixed camelCase/snake_case mapping (nodeType, isApproved, isSynced, etc.)
- [x] Admin → Test Nodes tab: 4 in-process nodes — RPC (8545), Lite (8555), Full Node (8565), Boost Node (8575) — start/stop/logs, admin/founder only
- [x] Test Nodes: dynamic hostname display (uses actual server host, not localhost) — works on any deployed server; UFW + iptables firewall instructions shown for remote hosts
- [x] Full Node: full-state JSON-RPC + txpool_status + debug_traceTransaction + eth_getLogs + eth_call + storage queries, 2-second blocks
- [x] Boost Node: 1-second blocks, MEV bundle endpoint (/boost/bundle), high TPS simulation, elevated peers, priority fee support
- [x] GYDS coin logo displayed in sidebar header (public/gyds-coin.jpg)
- [x] GYD stablecoin logo generated (public/gyd-coin.png)
- [x] GYDS + GYD logos added to SwapInterface NATIVE_TOKENS

### DeFi & Trading
- [x] Swap interface (mempool simulation, real token balances)
- [x] Liquidity pools (DB-persisted, add/remove liquidity)
- [x] Staking interface (mempool, hardcoded APR)
- [x] Orderbook DEX (limit, market, stop-limit — orders persisted to `orders` table)
- [x] Yield Vaults (5 vaults, deposits/withdrawals persisted to `vault_positions` table)
- [x] Cross-chain bridge (25 networks, real wallet balance checks)
- [x] Token Launchpad (real `token_launches` table, realtime subscriptions)
- [x] Portfolio (dynamic positions from transaction history)
- [x] Faucet (24h cooldown enforced server-side; camelCase bug fixed in /api/faucet/claims)

### Explorer & Wallet
- [x] Explorer: DB transaction fallback when WebSocket offline; network stats from /api/network-stats
- [x] Explorer: "DB Mode" status indicator + side panel always visible when data loads
- [x] Wallet: GYDS on-chain balance via useRpcBalance hook (all RPC endpoints, refresh button)
- [x] Dashboard Index: block time shows 5s (matches Go consensus engine)

### Deploy Scripts
- [x] `deploy-dashboard.sh` — PM2 for API, nginx proxies /api → :5001, git auto-pull cron
- [x] `install-fullnode.sh` → github.com/hc172808/fullnode.git
- [x] `install-litenode.sh` → user-mode, GYDS_NODE_MODE=lite
- [x] `install-boostnode.sh` → GYDS_NODE_MODE=boost, port 8547/30304
- [x] `install-rpcnode.sh` → GYDS_NODE_MODE=rpc, nginx TLS proxy
- [x] `install-genesis.sh` → GYDS_NODE_MODE=full, genesis.json seeded from Go core

### Portainer Stacks
- [x] `portainer-dashboard.yml` — PostgreSQL + Express API + Nginx + auto-pull cron
- [x] `portainer-fullnode.yml`, `portainer-litenode.yml`, `portainer-boostnode.yml`
- [x] `portainer-rpcnode.yml`, `portainer-validatornode.yml`, `portainer-genesis.yml`

### GydsSwap Smart Contracts
- [x] WGYDS.sol, GLPToken.sol, GydsSwapLibrary.sol, GydsSwapPair.sol
- [x] GydsSwapFactory.sol, GydsSwapRouter.sol, GydsSwapFarm.sol
- [x] Hardhat project + deploy scripts + unit tests (Pair, Router, Farm)
- [x] MockERC20.sol test helper

### Download Page
- [x] Respects node visibility settings from /api/node-visibility
- [x] Quick Stats binary name corrected to `gyds-fullnode`
- [x] All repo URLs point to github.com/hc172808/fullnode.git

---

## 🔧 In Progress

### Dashboard — Auth & Users
- [x] Email verification on register (token generated + stored in `email_verification_tokens`; POST /api/auth/verify-email + /api/auth/resend-verification; actual email delivery requires SMTP — token logged to console in dev)
- [~] Email delivery for password reset tokens (token in API response; SMTP integration needed for production)

### Mobile App
- [ ] Biometric unlock (Face ID / fingerprint via WebAuthn)
- [ ] Push notifications (Web Push API)
- [ ] Deep links
- [ ] Offline mode / service worker

### PHASE 2 — DeFi Expansion
- [x] Bridge fee config in `admin_config`
- [x] Bridge status tracker in wallet page
- [x] Orderbook: depth chart visualization — DepthChart in OrderBook.tsx renders bid/ask cumulative volume bars side-by-side with mid-price indicator; updates every 3 s
- [x] Orderbook: trade history public feed — `trade_history` table seeded with 50 realistic trades; GET /api/trades; OrderBook renders live scrollable feed with price/amount/time, refreshes every 10s
- [x] Orderbook: TWAP + iceberg order types
- [x] Vault auto-compound strategy for GYDS staking
- [x] Vault LP fee compounding
- [x] Perpetuals & options (long/short on GYDS/USD, funding rate)
- [x] Prediction markets (binary outcome, price prediction)
- [x] Liquidity pool analytics (volume chart, fee distribution)
- [x] Flash loan circuit breaker

### PHASE 3 — Governance & DAO
> Tables: `governance_proposals`, `governance_votes`, `governance_treasury`
- [x] Proposal list (active, passed, rejected) — wired to `governance_proposals` table
- [x] Proposal detail + voting interface — one-vote-per-user enforced server-side
- [x] Create proposal form (parameter / treasury / upgrade / grant) — persisted to DB
- [x] Vote tracking — `governance_votes` table, duplicate vote rejected with 409
- [x] Voting power calculator (based on nodes × 1000 + XP ÷ 10 + staked GYDS) — wired to DB via GET /api/governance/voting-power
- [x] Treasury balance display (multi-coin) — GYDS, GYD, ETH seeded + wired to DB via GET /api/governance/treasury
- [x] Grant application flow — Grants tab in Governance with 3-tier structure (Micro/Builder/Foundation); "Apply for Grant" button opens proposal form pre-set to type=grant; grants pulled from governance_proposals where type=grant with full voting UI
- [x] On-chain proposal execution (payload dispatch to chain)
- [x] Delegation of voting power (liquid democracy)
- [x] Emergency governance (fast-track critical proposals)
- [x] Quadratic voting option

### PHASE 4 — NFT Ecosystem
> Tables: `nft_collections`, `nft_tokens`, `nft_marketplace_listings`
- [x] Collection browser with floor price / volume — wired to DB; Collections tab shows floor/volume/24h change/rarity ranking bar
- [x] Individual NFT detail + buy/offer/list — detail modal; Buy Now wired to DB (POST /api/nft/buy/:id); list/delist own NFTs
- [x] Rarity ranking display — rarity breakdown panel in Collections tab (Legendary/Epic/Rare/Common counts)
- [x] Single mint + batch mint — wire to DB — single mint and batch mint (up to 10) via POST /api/nft/batch-mint
- [x] Metadata editor (name, description, attributes) — description textarea + key/value attribute builder in mint form
- [x] IPFS upload integration (Pinata or NFT.Storage)
- [x] Royalty configuration — royalty % field in mint form; stored in metadata JSONB
- [x] Whitelist/allowlist minting
- [x] Dynamic NFTs (metadata updates with validator performance)
- [x] NFT staking for yield

### PHASE 5 — Identity & Reputation
> Tables: `kyc_records`, `on_chain_identities`, `did_documents`, `sanctions_list`
- [x] DID creation (`did:gyds:<address>`) — wire to DB; GET /api/identity/did; getOrCreateDID auto-provisions on first access
- [x] Reputation score visualization — GET /api/identity/reputation; composite score from nodes+xp+governance+referrals
- [x] KYC tier display (tier 0-3) — GET /api/identity/kyc; tier names: None/Basic/Advanced/Full
- [x] Verified claims display
- [x] KYC tier upgrade flow (UI only, no PII in DB)
- [x] Sanctions screening on wallet creation and bridge usage
- [x] Social link verification (Twitter, Telegram proof-of-ownership)
- [x] Soulbound tokens for identity verification

### PHASE 6 — Real-World Assets (RWA)
> Tables: `rwa_assets`, `rwa_holdings`
- [x] Asset listing (real estate, bonds, commodities, invoices) — wire to DB; 4 seeded assets; GET /api/rwa/assets
- [x] Investment interface — POST /api/rwa/invest; writes rwa_holdings to DB
- [x] Portfolio holdings tab — GET /api/rwa/holdings; shows current user positions
- [x] Yield tracking dashboard
- [x] Legal document CID storage (IPFS links)
- [x] Jurisdiction compliance checker
- [x] Yield distribution automation (periodic payouts)
- [x] Secondary market for RWA tokens

### PHASE 7 — Social & Community
> Tables: `community_posts`, `community_comments`, `community_votes`, `referrals`
- [x] Post list with filter by type (discussion, showcase, idea) — wired to DB with author join
- [x] Post creation form (type: discussion / showcase / idea) — persisted to DB
- [x] Nested comments — wired to DB, lazy-loaded per post
- [x] Upvote/downvote system (posts + comments, one-vote enforced) — wired to DB
- [x] Rich text post editor
- [x] Unique referral code per user — fully wired to DB (referrals + referral_events tables); GET /api/referral, POST /api/referral/use; +500 GYDS + 100 XP on successful referral
- [x] Referral tracking dashboard — referred users list with dates + earnings shown in Community → Referral tab; "Use a code" card for new users
- [x] Reward distribution (% of referred user's fees)
- [x] Trader profiles (public wallet stats, badges, portfolio)
- [x] Follow system (follow traders / validators)
- [x] Token-gated community channels

### PHASE 8 — Advanced Analytics
> Tables: `price_history`, `network_snapshots`, `node_metrics_history`
- [x] GYDS price OHLCV chart (candlestick + volume bars) — wired to DB via GET /api/analytics/price-history/GYDS; falls back to generated data
- [x] Network health time-series (nodes, stake, TPS) — GET /api/analytics/network-history; live snapshots chart in Analytics Network tab
- [x] On-chain activity heatmap (daily/hourly tx count) — TxHeatmap component in Activity tab
- [x] Automated network snapshot cron (hourly insert) — `captureNetworkSnapshot` via setInterval in index.ts; fires on startup
- [x] Holder concentration (whale / retail breakdown)
- [x] LP inflow/outflow tracking
- [x] Mining profitability calculator v2 (electricity cost input) — Mining Calc tab in Analytics; hashrate, power, electricity cost, pool fee inputs; real-time daily/monthly/annual GYDS + USD estimates
- [x] Validator performance history charts
- [x] Export to CSV / PDF reports

### PHASE 9 — Multi-Sig & Enterprise
> Tables: `multisig_wallets`, `multisig_transactions`, `multisig_signatures`
- [x] Create 2-of-3, 3-of-5 wallets — wire to DB; POST /api/multisig/wallets; `multisig_wallets` + `multisig_signers` tables
- [x] Propose transaction interface — POST /api/multisig/transactions; full validation of signer membership
- [x] Co-signer approval/rejection UI — POST /api/multisig/transactions/:id/sign; Multisig.tsx fully rewritten (no DEMO_ data)
- [x] Transaction execution on threshold met — auto-executes when signatures ≥ required threshold
- [ ] Hardware wallet support (Ledger, Trezor via WebHID)
- [x] Multi-sig for DAO treasury spend

### PHASE 10 — Notifications & Webhooks
> Tables: `user_notifications`, `webhook_endpoints`, `webhook_deliveries`
- [~] In-app notification bell + drawer (desktop header — done)
- [ ] Email notifications (Resend or nodemailer)
- [ ] Push notifications (Web Push API)
- [x] Webhook management page (register URL + secret, event subs, delivery log)
- [x] Price alert notifications (email + push when target hit)
- [x] Governance proposal notifications

### PHASE 11 — API Access & Developer Portal
> Tables: `api_keys`, `api_usage_logs`
- [x] API key generation (scope selection) — wired to DB; create/list/revoke; full key shown once on creation, hashed in DB; max 10 per user
- [x] Usage dashboard (requests/day, rate limit status)
- [x] Interactive API docs (Swagger/OpenAPI)
- [x] REST API v1: GET /v1/network/stats, /v1/tokens, /v1/validators, /v1/oracle/prices, /v1/address/:address/balance — live responses
- [x] REST API v1: POST /v1/transactions/submit, GET /v1/blocks/:height, GET /v1/tx/:hash
- [x] SDK: JavaScript/TypeScript client (`@gydschain/sdk`)
- [x] SDK: Python client (`gydschain-py`)

### PHASE 12 — Oracle Network
> Tables: `oracle_feeds`, `oracle_submissions`
- [x] Oracle admin panel — feed config, submission history
- [ ] Decentralized oracle node (Go binary extension)
- [ ] On-chain oracle contract integration
- [ ] Chainlink Data Feed fallback

### PHASE 13 — Insurance Protocol
> Tables: `insurance_pools`, `insurance_policies`
- [x] Insurance pool UI (/insurance) — pool list (5 seeded pools), buy coverage modal, active policies tab; GET /api/insurance/pools, POST /api/insurance/buy, GET /api/insurance/my-policies
- [x] Claims process — POST /api/insurance/claim/:policyId; claim reason textarea; status updates to 'claimed' with timestamp; shown in My Policies tab
- [x] Underwriter staking (earn premiums by providing capital)
- [x] Parametric insurance (auto-trigger on oracle data)

### PHASE 14 — Gamification
> Tables: `achievements`, `user_achievements`, `user_xp`, `xp_events`
- [x] DB tables created: `user_xp`, `xp_events`, `achievements`, `user_achievements`
- [x] XP storage methods: `awardXp`, `getXpLeaderboard`, `getMyXpRank`, `getTxLeaderboard`, `getTokenLeaderboard`
- [x] API routes: GET /api/leaderboard/xp, /api/leaderboard/transactions, /api/leaderboard/tokens, /api/leaderboard/my-xp; POST /api/xp/award (admin)
- [x] Leaderboard wired to DB — XP rankings, validators (by stake), traders (by tx count), builders (by tokens launched)
- [x] XP levels: 8 tiers (Newcomer → Legend) with progress bar on leaderboard
- [x] Auto-award XP on key actions (first tx +50, first node +200, first token +300, each governance vote +25) — `awardXpOnce` prevents double-award for milestone events
- [x] Achievement badges UI (profile page) — 17 badges across 5 categories; locked/unlocked states from DB; progress bar, XP total, category filter pills; seeded on server startup
- [x] Monthly reset leaderboard
- [x] Seasonal campaigns (bonus XP events)

### GydsSwap Phase 3 — Frontend Integration
- [ ] Wire SwapInterface to real contract calls
- [ ] PoolsList: real reserves, TVL, APR from contracts
- [ ] StakeInterface: wire to GydsSwapFarm
- [x] LP Farming Dashboard (Farm.tsx) — `LPFarmingDashboard.tsx` with stake/unstake/harvest UI; Farm tab added to DeFi.tsx and DeFiBottomNav
- [ ] Update INIT_CODE_HASH after pair deploy

### Token Launchpad
- [x] Test token creation flow end-to-end — POST /api/launches stores via `insertLaunch`; logo upload via /api/admin/logos; fee deduction & purchase limits enforced client-side in Launchpad.tsx; schema columns: fee_paid, logo_url, purchase_limit_per_wallet all present
- [x] Admin visibility controls for pending launches

---

## ⏳ Planned

### Blockchain Core
- [ ] Genesis Creation & Validation
- [ ] Consensus Engine (PoS finality)
- [ ] Validator Election + Rewards + Slashing
- [ ] Governance Parameters, Treasury Allocation, Inflation Schedule
- [ ] Chain Upgrade Framework + Emergency Recovery
- [ ] Bootnodes + Peer Discovery
- [ ] Snapshot Export/Import, Fast Sync, Archive Nodes
- [ ] Network Partition Recovery

### Node Ecosystem (from github.com/hc172808/fullnode.git)
- [ ] Full Node, Lite Node, RPC Node, Boost Node
- [ ] Genesis Node, Validator Node, Local Node, Bootnode

### Explorer (full)
- [ ] Blocks, Transactions, Addresses
- [ ] Validators, Tokens, Smart Contracts
- [ ] NFT Explorer, Pool Explorer
- [ ] Rich List, Contract Verification

### Cross Chain Bridge (contracts)
- [ ] Bridge contracts: Ethereum, BNB Chain, Avalanche, Arbitrum, Optimism
- [ ] Base, zkSync, Linea, Fantom, Cronos
- [~] 25 network UI complete — contracts pending

### Infrastructure & DevOps
- [x] Automated DB backups + node metrics pruner cron (90-day retention) — `runDbPruner` in index.ts; prunes network_snapshots, api_usage_logs, webhook_deliveries, xp_events, expired email tokens; runs on startup + every 24h
- [x] Automated network snapshot cron (hourly `network_snapshots` insert)
- [ ] Multi-region deployment
- [ ] Load testing (k6 or Vegeta) before mainnet
- [ ] Penetration test + security audit
- [ ] Bug bounty program setup

### Security Hardening
- [ ] ZK proof of wallet ownership
- [x] Rate limiting on all API calls — express-rate-limit: auth 20/15min, faucet 5/hour, API 120/min
- [x] Encrypted message channel (E2E between wallets)
- [ ] Anti-bot CAPTCHA on faucet (hCaptcha)
- [x] CSP hardening for dashboard — Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy headers added via Express middleware in server/index.ts
- [ ] SBOM generation + dependency audit CI gate

### Monitoring
- [ ] Prometheus + Grafana + Loki + AlertManager
- [ ] RPC Monitoring (rpc.netlifegy.com)
- [ ] VPN Monitoring (ws.netlifegy.com)
- [x] Validator + Explorer Monitoring — GET /api/admin/monitoring (admin-only); Monitoring tab in Admin panel shows validator count, node sync status, RPC health, DB status, uptime, memory

### Mainnet Readiness
- [ ] Testnet Stable 30 Days
- [ ] Smart Contract Audit
- [ ] Monitoring Deployed + Backup Recovery Tested
- [ ] Validator Onboarding + Public Documentation
- [ ] Genesis Finalized

### Marketing
- [ ] Landing page (hero, tokenomics, roadmap, team)
- [ ] Press kit (logo assets, brand colors, chain stats)
- [ ] Blog / news section
- [ ] Community airdrop campaigns
- [ ] Validator onboarding guide (video walkthrough)
- [ ] YouTube channel (node install walkthroughs)
- [ ] Exchange Listings, Ambassador Program

---

## 🐛 Known Bugs / Tech Debt
- [x] Replace hardcoded `192.168.18.106` IP in `src/config/tokens.ts` with `VITE_RPC_LAN` env var
- [x] `node_installations.updated_at` trigger fires on every heartbeat — `last_heartbeat` column already in schema (shared/schema.ts line 67); heartbeat route uses it
- [ ] Wallet seed storage: migrate from `encrypted_seed TEXT` to server-side encryption
- [ ] Token price alert trigger: currently polling — convert to Postgres LISTEN/NOTIFY
- [x] `ip_access_list` vs `ip_address_list` — schema.ts uses `ip_access_list`; routes.ts aligns to the same name via Drizzle table reference (no raw SQL mismatch)
- [ ] Remove Vite `optimizeDeps.esbuildOptions` deprecation warning (upgrade vite-plugin-react-swc)

---

## 🔭 Long-Term Vision
- [ ] Layer-2 rollup on GYDSchain (ZK-rollup for high-throughput)
- [ ] Privacy transactions (Groth16 ZK-SNARK shielded transfers)
- [ ] Decentralized storage integration (IPFS pinning node bundled)
- [ ] AI trading agent marketplace (permissioned, audited strategies)
- [ ] Cross-chain DEX aggregator (route across 10+ chains)
- [ ] Physical GYDS debit card (GYD stablecoin settlement)
- [ ] Enterprise SDK (corporate treasury management on-chain)
- [ ] GYDSchain mobile miner (Termux-based, earns rewards on phone)
- [ ] Tokenized carbon credits (RWA extension)
- [ ] Decentralized DNS (`.gyds` domains mapped to wallet addresses)

---

## Quick Reference

### Deploy Dashboard
```bash
DOMAIN=app.netlifegy.com \
GYDS_SSL_EMAIL=netlifegy@gmail.com \
GITHUB_TOKEN=your_token \
sudo -E bash public/scripts/deploy-dashboard.sh
```

### Install Nodes
```bash
bash public/scripts/install-litenode.sh       # Lite Node (users)
sudo bash public/scripts/install-rpcnode.sh   # RPC Node
sudo bash public/scripts/install-boostnode.sh # Boost Node
sudo bash public/scripts/install-fullnode.sh  # Full Node (founder)
sudo bash public/scripts/install-genesis.sh   # Genesis (founder, ONCE)
```

### GydsSwap Deploy Order
```
1. WGYDS
2. GydsSwapFactory(feeToSetter)
3. GydsSwapRouter(factory, WGYDS)
4. GydsSwapFarm(gydsToken, emissionRate)
5. factory.createPair(GYDS, USDT) → GLP-GYDS-USDT (40%)
   factory.createPair(GYDS, BTC)  → GLP-GYDS-BTC  (20%)
   factory.createPair(GYDS, ETH)  → GLP-GYDS-ETH  (25%)
   factory.createPair(GYDS, USDC) → GLP-GYDS-USDC (15%)
```
