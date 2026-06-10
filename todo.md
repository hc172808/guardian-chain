# GYDSchain — Master Project TODO & Roadmap

> Last updated: 2026-06-10 | Always update this file when work is done or started.

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

### Mobile Experience
- [x] Mobile device auto-redirect to /mobile
- [x] Bottom tab navigation (Home, Explorer, DeFi, Wallet, More)
- [x] Back button when navigating from mobile hub
- [x] Phone-style UI (status bar, safe area, native app look)

### Platform Migration
- [x] Migrated from Supabase → Replit Auth + Replit PostgreSQL
- [x] Express API server on port 5001 with Drizzle ORM + full schema
- [x] All 160 frontend modules loading without errors
- [x] Fixed temporal dead zone crash in miningPools.ts
- [x] Supabase shim routing all calls to /api/*

### Deploy Scripts
- [x] `deploy-dashboard.sh` — PM2 for API, nginx proxies /api → :5001, git auto-pull cron
- [x] `install-fullnode.sh` → github.com/hc172808/fullnode.git
- [x] `install-litenode.sh` → github.com/hc172808/fullnode.git
- [x] `install-boostnode.sh` → github.com/hc172808/fullnode.git
- [x] `install-rpcnode.sh` → github.com/hc172808/fullnode.git
- [x] `install-genesis.sh` → github.com/hc172808/fullnode.git

### Portainer Stacks — Dashboard
- [x] `portainer-dashboard.yml` — PostgreSQL + Express API + Nginx + auto-pull cron

### Portainer Stacks — Nodes (all from github.com/hc172808/fullnode.git + WireGuard VPN)
- [x] `portainer-fullnode.yml` — Full node, P2P 30303, founder-level
- [x] `portainer-litenode.yml` — Lite node, headers only, low disk
- [x] `portainer-boostnode.yml` — Boost node, high-perf relay + mining
- [x] `portainer-rpcnode.yml` — RPC node + Nginx proxy (rpc.netlifegy.com / ws.netlifegy.com)
- [x] `portainer-validatornode.yml` — Validator node, earns staking rewards
- [x] `portainer-genesis.yml` — Genesis node, FOUNDER ONLY, bootstraps the network

### GydsSwap Smart Contracts
- [x] WGYDS.sol
- [x] GLPToken.sol
- [x] GydsSwapLibrary.sol
- [x] GydsSwapPair.sol
- [x] GydsSwapFactory.sol
- [x] GydsSwapRouter.sol
- [x] GydsSwapFarm.sol
- [x] contracts/README.md

### Admin Panel
- [x] Node visibility controls (admin/founder toggles)
- [x] Git Sync panel (real git pull with live output)
- [x] Audit logs
- [x] Node type approval

---

## 🔧 In Progress

### Dashboard — Auth & Users
- [x] Password reset via token (request + confirm routes)
- [x] 2FA / TOTP (setup, verify, disable — RFC 6238, built-in crypto)
- [x] Admin → Users tab: full UserManager — all profiles, search, role selector, ban/unban, stats
- [x] Admin → Nodes: fixed camelCase/snake_case mapping (nodeType, isApproved, isSynced, wireguardPublicKey, etc.)
- [ ] Email verification on register
- [ ] Email delivery for password reset tokens (currently returns token in API response)

### Mobile App
- [x] Pull-to-refresh (touch gesture, progress indicator, 72px threshold, remounts active tab)
- [x] QR code scanner — QRScanner component wired into Wallet send dialog (QrCode button opens camera; address auto-fills recipient field) and Mobile "QR Pay" quick action (opens scanner, then navigates to wallet with prefillAddress state)
- [ ] Biometric unlock
- [ ] Push notifications (web push)
- [ ] Deep links
- [ ] Offline mode / service worker

### GydsSwap Phase 2 — Tests
- [x] Hardhat project in contracts/ (Chain ID 13370, hardhat.config.ts, tsconfig.json, package.json)
- [x] Deploy scripts: contracts/scripts/deploy.ts (WGYDS, Factory, Router, Farm)
- [x] Unit tests: GydsSwapPair (mint, burn, swap, K invariant, fee math, sync)
- [x] Unit tests: GydsSwapRouter (addLiquidity, removeLiquidity, swapExact, slippage, deadline, getAmountsOut)
- [x] Unit tests: GydsSwapFarm (stake, unstake, harvest, emergency withdraw, multi-user split)
- [x] MockERC20.sol test helper contract
- [ ] Update INIT_CODE_HASH after pair deploy

### ChainCore Pages — Wire to Real Data
- [x] Explorer: DB transaction fallback when WebSocket offline; network stats from /api/network-stats shown in stat cards and side panel; "DB Mode" status indicator
- [x] Wallet: GYDS on-chain balance via useRpcBalance hook (all wallet addresses queried against ALL_RPC_ENDPOINTS, displayed with refresh button + RPC offline indicator)
- [ ] DeFi: all 8 tabs working end-to-end
- [ ] Token Launchpad: test token creation flow
- [ ] Faucet: test claim → cooldown → re-claim
- [x] Download page: respects node visibility settings from /api/node-visibility — litenode/rpcnode/boostnode/fullnode/genesis/bootnode each shown only when admin enables them and user has required role

---

## ⏳ Planned

### Blockchain Core
- [ ] Genesis Creation
- [ ] Genesis Validation
- [ ] Consensus Engine
- [ ] Validator Election + Rewards
- [ ] Slashing Rules
- [ ] Governance Parameters
- [ ] Treasury Allocation
- [ ] Inflation Schedule
- [ ] Chain Upgrade Framework
- [ ] Emergency Recovery Procedures
- [ ] Bootnodes + Peer Discovery
- [ ] Snapshot Export / Import
- [ ] Fast Sync
- [ ] Archive Nodes
- [ ] Network Partition Recovery

### Node Ecosystem
- [ ] Full Node
- [ ] Lite Node
- [ ] RPC Node
- [ ] Boost Node
- [ ] Genesis Node
- [ ] Validator Node
- [ ] Local Node
- [ ] Bootnode

### Wallet
- [ ] Multi Asset (GYDS + GYD)
- [ ] QR Payments
- [ ] Address Book
- [ ] Transaction History
- [ ] Hardware Wallet Support
- [ ] Multi Sig Support
- [ ] Seed Encryption
- [ ] Biometric Login

### Explorer
- [ ] Blocks, Transactions, Addresses
- [ ] Validators, Tokens, Smart Contracts
- [ ] NFT Explorer, Pool Explorer
- [ ] Rich List, Contract Verification

### GydsSwap Phase 3 — Frontend Integration
- [ ] Wire SwapInterface to real contract calls
- [ ] PoolsList: real reserves, TVL, APR
- [ ] Portfolio: GLP balances + earned fees
- [ ] StakeInterface: wire to GydsSwapFarm
- [ ] Launchpad: factory.createPair() UI
- [ ] LP Farming Dashboard (Farm.tsx)

### Cross Chain Bridge
- [ ] Ethereum, BNB Chain, Avalanche, Arbitrum, Optimism
- [ ] Base, zkSync, Linea, Fantom, Cronos
- [~] 25 network support (bridge UI complete, contracts pending)

### Governance DAO
- [ ] Proposals, Voting, Treasury, Grants
- [ ] Delegated Voting, Quadratic Voting
- [ ] Emergency Governance

### NFT Ecosystem
- [ ] Collections, Marketplace, Minting, Batch Minting
- [ ] Royalties, Dynamic NFTs, NFT Staking
- [ ] IPFS Integration

### Identity
- [ ] DID, Reputation, KYC
- [ ] Social Verification, Sanctions Screening
- [ ] Soulbound Tokens

### RWA
- [ ] Real Estate, Bonds, Commodities, Invoices
- [ ] Secondary Markets, Compliance Controls

### Community
- [ ] Forum, Referrals
- [ ] Trader + Validator Profiles
- [ ] Token Gated Channels

### Analytics
- [ ] OHLCV Charts, Network Metrics, TPS Metrics
- [ ] Mining + Validator Metrics
- [ ] Export Reports

### Mining
- [ ] CPU Mining, GPU Mining, Mining Pools
- [ ] Profitability Calculator, Leaderboards

### Oracle Network
- [ ] Oracle Nodes, Price Feeds, Aggregation
- [ ] Outlier Detection, Chainlink Fallback

### Enterprise
- [ ] Multi Sig Wallets, Treasury Management, Enterprise SDK

### Developer Portal
- [ ] API Keys, REST API, GraphQL API
- [ ] JavaScript + Python SDK, API Playground

### Notifications
- [~] In App Notifications (bell component done)
- [ ] Email Notifications, Push Notifications
- [ ] Webhooks, Price Alerts

### Monitoring
- [ ] Prometheus + Grafana + Loki + AlertManager
- [ ] RPC Monitoring (rpc.netlifegy.com)
- [ ] VPN Monitoring (ws.netlifegy.com)
- [ ] Validator + Explorer Monitoring

### Security
- [ ] AI Firewall + Threat Detection + Fraud Detection
- [ ] AI Risk Scoring
- [ ] DDoS Protection, Rate Limiting, CSP Hardening
- [ ] Bug Bounty, Security Audit, Cold Storage Treasury

### Mainnet Readiness
- [ ] Testnet Stable 30 Days
- [ ] Smart Contract Audit
- [ ] Monitoring Deployed
- [ ] Backup Recovery Tested
- [ ] Validator Onboarding
- [ ] Public Documentation
- [ ] Genesis Finalized

### Marketing
- [ ] Landing Page, Press Kit, Blog
- [ ] Community Campaigns, Exchange Listings
- [ ] Ambassador Program

### Long Term Vision
- [ ] Layer 2 Rollup
- [ ] ZK Privacy
- [ ] Decentralized Storage
- [ ] AI Trading Marketplace
- [ ] Cross Chain Aggregator
- [ ] Debit Card
- [ ] Carbon Credits
- [ ] Mobile Mining
- [ ] .gyds Domains
- [ ] Decentralized Cloud Compute Marketplace

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
