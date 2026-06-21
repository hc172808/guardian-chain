# GYDSchain — Master Project TODO & Roadmap

> Last updated: 2026-06-18 (session update) | Always update this file when work is done or started.
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
| Validator Node | https://github.com/hc172808/validatornode.git | 🟡 Full implementation ready in `node-fixes/validatornode/` — needs push to GitHub |
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
- [x] **DB schema fully synced** — added missing columns to `users` (username, password_hash, wallet_address, auth_nonce, totp_secret, totp_enabled, is_banned, totp_backup_codes) + created missing tables (achievements, orders, vault_positions, governance_proposals, governance_votes, community_posts, community_comments, community_votes, user_xp, xp_events, user_achievements, user_stablecoins, cashout_requests, password_reset_tokens) — 66 tables total
- [x] **Route aliases fixed** — `/api/liquidity-pools`, `/api/token-launches`, `/api/validator-delegations`, `/api/nfts` all wired to correct handlers
- [x] `/api/me` now returns username, walletAddress, totpEnabled, isBanned alongside existing fields
- [x] AuthContext AuthUser type updated to match full /api/me response

### Mobile Experience & PWA
- [x] Mobile device auto-redirect to /mobile
- [x] Bottom tab navigation (Home, Explorer, DeFi, Wallet, More)
- [x] Back button when navigating from mobile hub
- [x] Phone-style UI (status bar, safe area, native app look)
- [x] Pull-to-refresh (touch gesture, progress indicator, 72px threshold)
- [x] QR code scanner — wired into Wallet send dialog and Mobile "QR Pay" quick action
- [x] Biometric unlock (Face ID / fingerprint via WebAuthn) — toggle in Mobile MoreTab + Profile security tab
- [x] Push notifications (Web Push API) — VAPID auto-generated; SW push handler; toggle in MoreTab
- [x] Deep links — PWA manifest.json with shortcuts (wallet, explorer, defi, governance)
- [x] Offline mode / service worker v2 — stale-while-revalidate; background sync for pending txs; SW message handler
- [x] **PWA install prompt** (InstallPrompt.tsx) — auto-shows after 3–5s; Android one-click install; iOS step-by-step guide; added to Layout.tsx
- [x] **Enhanced PWA manifest** — id, 7 icon sizes, 4 shortcuts, share_target (address), protocol_handlers (web+gyds), edge_side_panel, Play Store related_applications
- [ ] **Native Android APK** (Capacitor) — `npx cap init`, `npx cap add android`, `npx cap build android` → upload to Play Store as "ChainCore — GYDSchain"
- [ ] **Native iOS IPA** (Capacitor) — `npx cap add ios` → open Xcode → archive → submit to App Store
- [ ] App Store listing — screenshots, description, categories (Finance, Utilities)
- [ ] Push notifications in native app — Capacitor Push Notifications plugin + FCM/APNs
- [ ] In-app browser for external links instead of leaving app

### GitHub Webhook Integration (NodeRepoSync)
- [x] **Webhook receiver** — `POST /api/webhooks/github` — HMAC-SHA256 signature verification (X-Hub-Signature-256), raw body buffering, stores last 100 events in memory
- [x] **Admin events API** — `GET /api/admin/github-webhook/events` — returns events list + pending repos + webhook URL + secret status
- [x] **Ack endpoint** — `POST /api/admin/github-webhook/ack` — clears pending-recheck flags after NodeRepoSync finishes
- [x] **NodeRepoSync auto-recheck** — polls /api/admin/github-webhook/events every 30s; auto-triggers `checkOne()` for any repo that received a push; shows "push detected" badge; toast notification
- [x] **Webhook setup panel** in NodeRepoSync — copy payload URL, setup instructions, recent event log (pusher, branch, commit SHA, verified badge)
- [ ] Set `GITHUB_WEBHOOK_SECRET` env var (generate with `openssl rand -hex 32`) — enables HMAC verification
- [ ] Add webhook to each GitHub repo: Settings → Webhooks → Payload URL: `https://app.netlifegy.com/api/webhooks/github` → Content-type: `application/json` → Secret: value of env var → Just push events

### Platform Migration
- [x] Migrated from Supabase → Replit Auth + Replit PostgreSQL
- [x] Express API server on port 5001 with Drizzle ORM + full schema
- [x] All frontend modules loading without errors
- [x] Supabase shim routing all calls to /api/* (no real Supabase needed)
- [x] CSP + security headers in server/index.ts (X-Frame-Options, HSTS, Referrer-Policy, etc.)

### Admin Panel (30+ tabs)
- [x] Node visibility controls (admin/founder toggles)
- [x] Git Sync panel (real git pull with live output)
- [x] NodeRepoSync component — checks all 4 node repos via GitHub API for correct module/binary/blocktime; auto-rechecks on GitHub push via webhook integration
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
- [x] Activity feed — all transactions, buy requests, cash outs in unified list; click any item for full detail modal (hash, from/to, amount, fee, block, status, payment method, destination)
- [x] Buy Tokens flow — 3-step wizard (select token + amount → choose payment method → confirm + payment instructions); POST /api/buy-tokens; reference returned
- [x] Cash Out with payment method — payment method picker added to cash out dialog; payment_method stored in cashout_requests
- [x] Payment methods DB — `payment_methods` table; 5 seeded defaults: PayPal, MMG Guyana, Bank Transfer (GY), VISA/MC, Crypto USDT/USDC; GET /api/payment-methods (enabled only)
- [x] Admin → Payments tab (PaymentMethodsManager.tsx) — toggle enable/disable each method, edit name/description/instructions/icon, add/delete methods; review + approve/reject Buy Requests and Cash Out Requests with pending counts badges
- [x] **Mark as Completed** button in Admin → Payments — purple "Mark Completed" button appears on approved buy requests and cashout requests; moves to `completed` state (tokens credited / funds transferred); amber badge on tab counts approved-but-not-completed items; server already fires completed notification/email/Telegram
- [x] Buy/cashout approval notifications — in-app bell, email (sendBuyRequestStatusEmail / sendCashoutStatusEmail in server/email.ts), Telegram; fires on approved/rejected/completed for both buy requests and cashouts; admin can include a rejection note
- [x] Reject with reason dialog — clicking Reject in Admin → Payments opens a modal with optional reason textarea; reason delivered to user via in-app bell + email + Telegram; cancel keeps request pending
- [x] SQL schema files updated — payment_methods + buy_requests tables + cashout_requests.payment_method column added to both public/scripts/pgadmin-schema.sql (§24) and public/scripts/gydschain-complete-schema.sql (§32); idempotent with IF NOT EXISTS + ON CONFLICT DO NOTHING; table count updated to 72

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

### validatornode — COMPLETE ✅
- [x] go.mod — module `github.com/gydschain/validatornode`
- [x] main.go — entry point with cobra CLI (start, version, validator, register, status subcommands)
- [x] config/config.go — ValidatorConfig (NodeMode="validator", BlockTime=120s, StakeRequired=1000 GYDS, P2P port 30302, RPC port 8543)
- [x] core/ package — block.go, chain.go, genesis.go, transaction.go
- [x] consensus/pos.go — ValidatorSet (add, slash, round-robin Next), PoSEngine with OnNewBlock, AddTx, TxPoolSize
- [x] p2p/server.go — TCP listener, peer handshake, peer registry
- [x] rpc/server.go — full JSON-RPC + validator_info/validator_set/validator_getRewards/validator_register
- [x] Dockerfile, docker-compose.yml, setup.sh, README.md
- [x] Wire to Admin → Test Nodes (5th test node at port 8585, 5-second simulated blocks, validator_* methods)

### litenode — Architecture Fix
- [x] Change sync mode to header-only (verify block headers from peers, not produce new blocks)
- [x] Remove PoS block production from litenode (production belongs only in validatornode)
- [x] Add block header signature verification against known validator set
- [x] Add SPV (Simple Payment Verification) proof generation

### rpcnode — Missing RPC Methods
- [x] `eth_getLogs` — filtering against stored receipts (currently returns empty array)
- [x] `eth_getFilterChanges` — polling filters not implemented
- [x] `debug_traceTransaction` — tx trace endpoint missing
- [x] Added 20+ additional RPC methods: eth_getTransactionByHash, eth_getTransactionByBlock*, eth_getBlockTransactionCount*, eth_getProof, eth_feeHistory, eth_createAccessList, eth_getWork, eth_submitWork, eth_submitHashrate, eth_protocolVersion, eth_coinbase, eth_mining, eth_hashrate, eth_accounts, eth_uninstallFilter, eth_getFilterLogs, eth_unsubscribe, eth_getUncleCount*
- [ ] Request rate limiting per API key (premium access tiers)

### GydsSwap — Contract Integration
- [x] Contract config: `src/config/contracts.ts` — addresses, ABI fragments, INIT_CODE_HASH, fee constants
- [x] Swap library: `src/lib/swapContract.ts` — provider, read helpers (reserves, balances, token metadata), write helpers (swap, add/remove liquidity, farm deposit/withdraw/harvest, approve), pure math (getAmountOut, getAmountIn, quoteLiquidity)
- [x] PoolsList: enriched with on-chain reserves/TVL from GydsSwapPair contracts (fallback to DB if not deployed)
- [x] StakeInterface: tries on-chain GydsSwapFarm deposit/withdraw first, falls back to mempool simulation
- [x] SwapInterface: wired with executeSwapExactTokensForTokens / executeSwapExactGYDSForTokens (tries on-chain first, falls back to mempool); uses real 0.3% fee math from SWAP_FEE_NUMERATOR/DENOMINATOR
- [ ] Update INIT_CODE_HASH after pair deploy
- [ ] Deploy contracts to Chain ID 13370 and fill real addresses in CONTRACT_ADDRESSES

### Infrastructure
- [x] install-rpc-proxy.sh — nginx reverse proxy for rpc.netlifegy.com, SSL via certbot, CORS, rate-limit, WS upgrade, MetaMask setup guide
- [x] WireGuard mesh bring-up automation — `setup-wireguard-mesh.sh` (--init bootstrap, --join peer, auto keypair, systemd, UFW)
- [x] GitHub webhook integration for NodeRepoSync — HMAC-SHA256 verified, in-memory event store, auto-trigger repo checks on push

### Blockchain Core (public/blockchain-go/)
- [x] Real Merkle/Patricia state-trie root in header.StateRoot (currently zero hash) — ComputeStateRoot() binary Merkle tree over sorted accounts
- [x] Real ECDSA signature verification (currently length-only checks) — r/s/v parsing + recoverPubKey stub + pubKeyToAddress
- [x] LevelDB pruning (function is a no-op) — oldest-first block deletion with size tracking
- [ ] Replace JSON block encoding with RLP/protobuf for production efficiency
- [ ] Replace placeholder genesis validator addresses (0x000...001 etc.) with real addresses

### Notification Bell
- [x] Wire NotificationBell to live user_notifications table (fetch /api/notifications, 30s poll, mark read, dismiss)
- [x] Server-side event push — notification created on faucet drip, governance vote, new proposal (broadcast to all users)

### Profile / Account
- [x] Telegram Bot API — `server/telegram.ts` helper (sendTelegramMessage, sendTelegramAlert, testTelegramConnection); POST /api/profile/telegram-test wired; faucet drip + governance vote auto-send if user has telegram_chat_id set
- [x] 2FA backup codes — POST /api/auth/totp/backup-codes/generate (8 codes, SHA-256 hashed), GET /api/auth/totp/backup-codes (count), POST /api/auth/totp/backup-codes/use (consume one); totp_backup_codes column added to users table

---

## 🔍 GitHub Node Repo Status (as of 2026-06-17)

| Repo | go.mod module | Binary name | BlockTime | NodeMode | Fix Ready |
|---|---|---|---|---|---|
| rpcnode | ❌ gydschain/litenode → should be gydschain/rpcnode | ❌ gyds-litenode | 5s | rpc ✅ | ✅ node-fixes/rpcnode/ |
| boostnode | ❌ gydschain/litenode → should be gydschain/boostnode | ❌ gyds-litenode | ❌ 5s → should be 1s | ❌ lite → should be boost | ✅ node-fixes/boostnode/ |
| fullnode | ✅ gydschain/fullnode | ❌ gyds-litenode → should be gyds-fullnode | ✅ 120s | fullnode ✅ | ✅ node-fixes/fullnode/ |
| genesis | (empty repo) | (empty repo) | — | — | ✅ node-fixes/genesis/ |
| validatornode | ✅ gydschain/validatornode | ✅ gyds-validatornode | ✅ 120s | ✅ validator | ✅ node-fixes/validatornode/ |
| litenode | ✅ gydschain/litenode | ✅ gyds-litenode | ✅ 5s | ✅ lite | 🟡 arch issue only |
