# GYDSchain — Master Project TODO & Roadmap

> Last updated: 2026-06-17 | Always update this file when work is done or started.
> Legend: `[x]` Done · `[ ]` Not started · `[~]` In progress · `[!]` Blocked

**Blockchain:** GYDSchain | **Coin:** GYDS | **Stablecoin:** GYD | **Chain ID:** 13370
**Domain:** netlifegy.com — subdomains ONLY (ws. rpc. node. explorer. app. faucet. swap. bridge. docs. api.)

---

## GitHub Repositories

| Project | Repo | Status |
|---|---|---|
| GYDSchain Dashboard | https://github.com/hc172808/guardian-chain.git | ✅ Active |
| RPC Node | https://github.com/hc172808/rpcnode.git | 🟡 Fix files ready in `node-fixes/rpcnode/` — needs push to GitHub |
| Lite Node | https://github.com/hc172808/litenode.git | 🟡 Compiles — architectural issues (should be header-only, not block-producing) |
| Boost Node | https://github.com/hc172808/boostnode.git | 🟡 Fix files ready in `node-fixes/boostnode/` — needs push to GitHub |
| Full Node | https://github.com/hc172808/fullnode.git | 🟡 Fix files ready in `node-fixes/fullnode/` — needs push to GitHub |
| Validator Node | https://github.com/hc172808/validatornode.git | 🔴 Empty repo — no go.mod, no main.go, cannot compile — needs full implementation |
| Genesis Node | https://github.com/hc172808/genesis.git | 🟡 Full implementation ready in `node-fixes/genesis/` — repo is empty, needs push |

> **Action required:** Push `node-fixes/<repo>/` contents to each GitHub repo. See `node-fixes/README.md`.

---

## Network & Subdomains

| Subdomain | Purpose | Status |
|---|---|---|
| app.netlifegy.com | Dashboard | 🟡 Deploy with `public/scripts/deploy-dashboard.sh` |
| explorer.netlifegy.com | Block Explorer | 🟡 Needs deployed chain node |
| rpc.netlifegy.com | RPC Endpoint | 🔴 Needs `install-rpcnode.sh` + TLS proxy |
| ws.netlifegy.com | WebSocket RPC | 🔴 Needs ws proxy config |
| node.netlifegy.com | Node Portal | 🟡 Via dashboard |
| api.netlifegy.com | REST / GraphQL API | 🟡 `/api/v1/*` live in Express |
| faucet.netlifegy.com | Testnet Faucet | 🟡 Faucet page live, needs subdomain |
| bridge.netlifegy.com | Cross-Chain Bridge | 🟡 Bridge UI live |
| swap.netlifegy.com | GydsSwap DEX | 🔴 Smart contracts not wired |
| docs.netlifegy.com | Documentation | 🟡 Docs page live |

---

## ✅ Completed

### Auth & Access
- [x] Username + password login (bcrypt + passport-local)
- [x] Web3 wallet login (ECDSA signature challenge + ethers.verifyMessage)
- [x] Wallet-based password reset (sign nonce → verify → set new password)
- [x] Session persistence via connect-pg-simple
- [x] Register with username / email / password
- [x] netlifegy / GYDSchain2026! seeded as admin + founder
- [x] Role-based middleware (requireAuth, requireAdmin, enrichUserWithRoles)
- [x] Password reset via token (request + confirm routes)
- [x] Email verification on register (token in email_verification_tokens; real SMTP if SMTP_HOST set)
- [x] 2FA / TOTP (setup, verify, disable — RFC 6238, built-in crypto in server/totp.ts)

### Mobile Experience
- [x] Mobile device auto-redirect to /mobile
- [x] Bottom tab navigation (Home, Explorer, DeFi, Wallet, More)
- [x] Back button when navigating from mobile hub
- [x] Phone-style UI (status bar, safe area, native app look)
- [x] Pull-to-refresh (touch gesture, progress indicator, 72px threshold)
- [x] QR code scanner — wired into Wallet send dialog and Mobile "QR Pay" quick action
- [x] Biometric unlock (Face ID / fingerprint via WebAuthn) — toggle in Mobile MoreTab + Profile security tab
- [x] Push notifications (Web Push API) — VAPID auto-generated; SW push handler; toggle in MoreTab
- [x] Deep links — PWA manifest.json with shortcuts (wallet, explorer, defi)
- [x] Offline mode / service worker — public/sw.js; network-first cache; offline fallback

### Platform Migration
- [x] Migrated from Supabase → Replit Auth + Replit PostgreSQL
- [x] Express API server on port 5001 with Drizzle ORM + full schema
- [x] All frontend modules loading without errors
- [x] Supabase shim routing all calls to /api/* (no real Supabase needed)
- [x] CSP + security headers in server/index.ts (X-Frame-Options, HSTS, Referrer-Policy, etc.)

### Admin Panel (30+ tabs)
- [x] Node visibility controls (admin/founder toggles)
- [x] Git Sync panel (real git pull with live output)
- [x] NodeRepoSync component — checks all 4 node repos via GitHub API for correct module/binary/blocktime
- [x] Audit logs
- [x] Node type approval (camelCase fixed: nodeType, isApproved, isSynced, wireguardPublicKey)
- [x] Admin → Users tab: full UserManager — search, role selector, ban/unban, stats
- [x] Admin → Test Nodes: 4 in-process nodes — RPC (8545), Lite (8555), Full Node (8565), Boost Node (8575)
- [x] Test Nodes: dynamic hostname (window.location.hostname, not localhost); UFW instructions for remote
- [x] Full Node: full-state JSON-RPC + txpool_status + debug_traceTransaction + eth_getLogs
- [x] Boost Node: 1-second blocks, MEV bundle endpoint (/boost/bundle), high TPS simulation
- [x] WireGuard Peer Manager — auto-assigns 10.8.0.x tunnel IPs, generates wg0.conf + per-peer configs
- [x] AI Firewall (security.ts) — IP blocklist, lockdown mode, rate limiting, payload inspection
- [x] AI Firewall UI (AIFirewallTab.tsx) — blocked IPs tab, manual block/unblock, real-time stats
- [x] Cron Job Manager — 7 in-memory jobs; GET/PATCH/POST /api/admin/cron-jobs; CronJobManager.tsx
- [x] System Monitoring tab — validators, nodes, RPC health, DB status, uptime, memory (ValidatorExplorerMonitor)
- [x] GYDS + GYD coin logos (public/gyds-coin.jpg, public/gyd-coin.png)

### DeFi & Trading (13 tabs)
- [x] Swap interface (mempool simulation, real token balances)
- [x] Liquidity pools (DB-persisted, add/remove liquidity)
- [x] Staking interface (mempool, hardcoded APR)
- [x] Orderbook DEX (limit, market, stop-limit, TWAP, iceberg — orders in `orders` table)
- [x] Orderbook depth chart (bid/ask cumulative volume bars, mid-price indicator, live every 3s)
- [x] Trade history public feed (trade_history table seeded with 50 trades; refreshes every 10s)
- [x] Yield Vaults (5 vaults, deposits/withdrawals in vault_positions table)
- [x] Cross-chain bridge (25 networks, real wallet balance checks, non-EVM trust-based flow)
- [x] Token Launchpad (token_launches table, realtime subscriptions)
- [x] Portfolio (dynamic positions from transaction history)
- [x] Perpetuals & options (long/short on GYDS/USD, funding rate)
- [x] Prediction markets (binary outcome, price prediction)
- [x] Stablecoin Factory (5-step wizard; user_stablecoins table; full CRUD; rules enforced server-side)
- [x] LP Farming Dashboard (LPFarmingDashboard.tsx; stake/unstake/harvest; "Live on Testnet" badge)
- [x] IL (Impermanent Loss) Calculator tab
- [x] Flash loan circuit breaker
- [x] Bridge fee comparison, bridge history

### Explorer & Wallet
- [x] Explorer: DB transaction fallback when WebSocket offline; network stats from /api/network-stats
- [x] Explorer: "DB Mode" status indicator + side panel
- [x] Wallet: GYDS on-chain balance via useRpcBalance hook; all RPC endpoints; refresh button
- [x] Ledger hardware wallet (LedgerConnect.tsx — WebHID; reads 5 accounts via BIP44 APDU; Chrome/Edge)
- [x] Faucet: 24h cooldown enforced server-side

### Governance (Phase 3) — fully wired to DB
- [x] Proposal list, detail, voting (one-vote enforced), progress bars + quorum
- [x] Create proposal (parameter / treasury / upgrade / grant)
- [x] Vote tracking (governance_votes table, 409 on duplicate)
- [x] Voting power calculator (nodes × 1000 + XP ÷ 10 + staked GYDS)
- [x] Treasury balance (GYDS, GYD, ETH seeded)
- [x] Grant application flow (Grants tab; 3-tier: Micro/Builder/Foundation)
- [x] On-chain proposal execution, delegation, emergency governance, quadratic voting

### NFT Ecosystem (Phase 4) — fully wired to DB
- [x] Collection browser (floor/volume/24h change/rarity), individual NFT detail + buy/list
- [x] Single mint + batch mint (up to 10 via POST /api/nft/batch-mint)
- [x] Metadata editor, IPFS upload (Pinata/NFT.Storage), royalty config
- [x] Whitelist/allowlist minting, dynamic NFTs, NFT staking for yield

### Identity & Reputation (Phase 5) — fully wired to DB
- [x] DID creation (did:gyds:<address> — auto-provisioned on first access)
- [x] Reputation score (composite: nodes+xp+governance+referrals)
- [x] KYC tier display (None/Basic/Advanced/Full)
- [x] Social link verification, soulbound tokens, sanctions screening

### Real-World Assets (Phase 6) — fully wired to DB
- [x] Asset listing (real estate, bonds, commodities, invoices — 4 seeded)
- [x] Investment interface, holdings tab, yield tracking, legal document CID, secondary market

### Community (Phase 7) — fully wired to DB
- [x] Posts (discussion / showcase / idea), comments, upvote/downvote
- [x] Referral system (unique codes; +500 GYDS +100 XP on use; referrals table)
- [x] Referral tracking dashboard, follow system, token-gated channels

### Analytics (Phase 8) — fully wired to DB
- [x] GYDS OHLCV candlestick chart, network health time-series, activity heatmap
- [x] Hourly network snapshot cron (captureNetworkSnapshot in index.ts)
- [x] Mining profitability calculator v2, validator performance charts, CSV/PDF export

### Multi-Sig & Enterprise (Phase 9) — fully wired to DB
- [x] Create M-of-N wallets (multisig_wallets + multisig_signers tables)
- [x] Propose + co-sign + auto-execute on threshold
- [x] Hardware wallet (Ledger WebHID), multi-sig for DAO treasury

### Notifications & Webhooks (Phase 10) — fully wired
- [x] In-app notification bell + drawer (desktop header)
- [x] Email notifications (nodemailer; SMTP_HOST/PORT/USER/PASS/FROM; console fallback in dev)
- [x] Web Push notifications (VAPID auto-generated; push_subscriptions table at runtime)
- [x] Webhook management page, price alert notifications, governance proposal notifications

### Developer Portal (Phase 11) — fully wired to DB
- [x] API key generation (scope selection; hashed in DB; max 10/user; full key shown once)
- [x] Usage dashboard (requests/day, rate limit status)
- [x] Interactive API playground (live endpoint testing)
- [x] REST API v1: GET /v1/network/stats, /v1/tokens, /v1/validators, /v1/oracle/prices, /v1/address/:address/balance
- [x] REST API v1: POST /v1/transactions/submit, GET /v1/blocks/:height, GET /v1/tx/:hash
- [x] SDK: JavaScript/TypeScript — `@gydschain/sdk` — Available (full code examples in Developer.tsx)
- [x] SDK: Python — `gydschain-py` — Available (full code examples in Developer.tsx)
- [x] SDK: Go — `github.com/gydschain/go-sdk` — In Progress (snippet shown)
- [x] SDK: Rust — `gydschain-rs` — Planned (snippet shown)
- [x] SDK feature coverage matrix table

### Insurance Protocol (Phase 13) — fully wired to DB
- [x] Insurance pool list (5 seeded pools); all plans marked Available
- [x] Buy coverage modal, active policies tab
- [x] Claims process (POST /api/insurance/claim/:policyId)
- [x] Underwriter staking, parametric insurance (auto-trigger on oracle data)

### Gamification (Phase 14) — fully wired to DB
- [x] user_xp, xp_events, achievements, user_achievements tables
- [x] XP storage methods + API routes (/api/leaderboard/xp, /transactions, /tokens, /my-xp)
- [x] 8 XP tiers (Newcomer → Legend) with progress bar
- [x] Auto-award XP on key actions (awardXpOnce prevents double-awards)
- [x] Achievement badges UI — 17 badges, 5 categories; seeded on startup

### Deploy & Infrastructure
- [x] deploy-dashboard.sh — PM2 + nginx + git cron
- [x] setup-server.sh — fresh Ubuntu + Cloudflare + subdomain
- [x] redeploy.sh — safe git pull + build + PM2 reload
- [x] install-fullnode.sh — fixed REPO_URL → fullnode.git
- [x] install-genesis.sh — fixed REPO_URL → genesis.git, BINARY → gyds-genesis
- [x] install-litenode.sh, install-boostnode.sh, install-rpcnode.sh
- [x] install-bootnode.sh (new) — peer discovery node
- [x] install-all-nodes.sh — multi-node on one server
- [x] Portainer stacks for all node types
- [x] DB pruner cron — prunes network_snapshots, api_usage_logs, xp_events, expired tokens (24h cycle)

### GydsSwap Smart Contracts
- [x] WGYDS.sol, GLPToken.sol, GydsSwapLibrary.sol, GydsSwapPair.sol
- [x] GydsSwapFactory.sol, GydsSwapRouter.sol, GydsSwapFarm.sol
- [x] Hardhat project + deploy scripts + unit tests

---

## 🔧 In Progress / Needs Push to GitHub

### Node Repo Fixes (ready locally — must be pushed to GitHub)
- [~] rpcnode — `node-fixes/rpcnode/` has corrected go.mod (module = gydschain/rpcnode) + main.go imports + NewServer 5-arg signature
- [~] boostnode — `node-fixes/boostnode/` has corrected go.mod (module = gydschain/boostnode) + main.go + config.go (NodeMode=boost, BlockTime=1s)
- [~] fullnode — `node-fixes/fullnode/` has version string fix (gyds-litenode → gyds-fullnode)
- [~] genesis — `node-fixes/genesis/` has full implementation; repo at hc172808/genesis is empty — needs push + setup.sh run

> See `node-fixes/README.md` for exact git commands to push each fix.

### Oracle Network (Phase 12)
- [x] Oracle admin panel (feed config, submission history)
- [ ] Decentralized oracle node (Go binary extension of fullnode)
- [ ] On-chain oracle contract integration
- [ ] Chainlink Data Feed fallback

---

## ❌ Not Started / Still Needed

### validatornode — CRITICAL (repo is empty, cannot compile)
- [ ] go.mod — module `github.com/gydschain/validatornode`
- [ ] main.go — entry point with cobra CLI (start, version, validator subcommands)
- [ ] config/config.go — ValidatorConfig (NodeMode="validator", BlockTime=120s, StakeRequired=1000 GYDS, P2P port 30302, RPC port 8543)
- [ ] core/ package — block.go, chain.go, genesis.go, transaction.go (copy from fullnode + adjust)
- [ ] consensus/ — pos.go with validator set management, slashing, reward distribution
- [ ] p2p/ — peer.go, server.go, gossip.go
- [ ] rpc/ — server.go with validator-specific endpoints (validator_info, validator_set, eth_* standard)
- [ ] Dockerfile, docker-compose.yml, setup.sh, README.md
- [ ] Wire to Admin → Test Nodes (5th test node at port 8585)

### litenode — Architecture Fix
- [ ] Change sync mode to header-only (verify block headers from peers, not produce new blocks)
- [ ] Remove PoS block production from litenode (production belongs only in validatornode)
- [ ] Add block header signature verification against known validator set
- [ ] Add SPV (Simple Payment Verification) proof generation

### rpcnode — Missing RPC Methods
- [ ] `eth_getLogs` — filtering against stored receipts (currently returns empty array)
- [ ] `eth_getFilterChanges` — polling filters not implemented
- [ ] `debug_traceTransaction` — tx trace endpoint missing
- [ ] Request rate limiting per API key (premium access tiers)

### GydsSwap — Contract Integration (frontend still simulated)
- [ ] Wire SwapInterface to real GydsSwapRouter contract calls
- [ ] PoolsList: real reserves, TVL, APR from GydsSwapPair contracts
- [ ] StakeInterface: wire to GydsSwapFarm contract
- [ ] Update INIT_CODE_HASH after pair deploy

### Infrastructure
- [ ] install-rpc-proxy.sh — reverse-proxy for rpc.netlifegy.com / rpc2 / rpc3
- [ ] WireGuard mesh bring-up automation (auto-provision all founder nodes into mesh)
- [ ] GitHub webhook integration for NodeRepoSync (auto-trigger repo checks on push)

### Blockchain Core (public/blockchain-go/)
- [ ] Real Merkle/Patricia state-trie root in header.StateRoot (currently zero hash)
- [ ] Real ECDSA signature verification (currently length-only checks)
- [ ] LevelDB pruning (function is a no-op)
- [ ] Replace JSON block encoding with RLP/protobuf for production efficiency
- [ ] Replace placeholder genesis validator addresses (0x000...001 etc.) with real addresses

### Notification Bell
- [ ] Wire NotificationBell to live user_notifications table (currently demo data)
- [ ] Server-side event push when tx confirms, governance passes, price alert triggers

### Profile / Account
- [ ] Wire Telegram alerts (@GYDSChainBot) to actual Telegram Bot API
- [ ] 2FA backup codes (generate + download + use for recovery)

---

## 🔍 GitHub Node Repo Status (as of 2026-06-17)

| Repo | go.mod module | Binary name | BlockTime | NodeMode | Fix Ready |
|---|---|---|---|---|---|
| rpcnode | ❌ gydschain/litenode → should be gydschain/rpcnode | ❌ gyds-litenode | 5s | rpc ✅ | ✅ node-fixes/rpcnode/ |
| boostnode | ❌ gydschain/litenode → should be gydschain/boostnode | ❌ gyds-litenode | ❌ 5s → should be 1s | ❌ lite → should be boost | ✅ node-fixes/boostnode/ |
| fullnode | ✅ gydschain/fullnode | ❌ gyds-litenode → should be gyds-fullnode | ✅ 120s | fullnode ✅ | ✅ node-fixes/fullnode/ |
| genesis | (empty repo) | (empty repo) | — | — | ✅ node-fixes/genesis/ |
| validatornode | ❌ none (no go.mod) | ❌ none | — | — | ❌ needs full build |
| litenode | ✅ gydschain/litenode | ✅ gyds-litenode | ✅ 5s | ✅ lite | 🟡 arch issue only |
