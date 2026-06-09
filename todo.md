# ChainCore — Master Project TODO
> Last updated: 2026-06-09 | Always update this file when work is done or started.

---

## GitHub Repositories

| Project | Repo | Status |
|---|---|---|
| ChainCore Dashboard | https://github.com/hc172808/guardian-chain.git | ✅ Active |
| Full Node | https://github.com/hc172808/fullnode.git | 🔧 In progress |
| Lite Node | https://github.com/hc172808/litenode.git | 🔧 In progress |
| Boost Node | https://github.com/hc172808/boostnode.git | 🔧 In progress |
| Genesis Node | https://github.com/hc172808/genesis.git | 🔧 In progress |
| RPC Node | https://github.com/hc172808/rpcnode.git | 🔧 In progress |
| MobileCore | https://github.com/hc172808/chaincore-mobile.git | ⏳ Planned |
| Digital Wallet | https://github.com/hc172808/your-digital-wallet.git | ⏳ Planned |

> Add your GitHub Personal Access Token to Replit secrets as `GITHUB_TOKEN` so the agent can push/pull to all repos.

---

## Network & Identity

| Property | Value |
|---|---|
| Blockchain | GydsChain |
| Native Coin | GYDS |
| Chain ID | 13370 |
| Domain | netlifegy.com |
| Dashboard Deploy Path | `/var/www/gydschain` |
| RPC | https://rpc.netlifegy.com |
| WS | wss://ws.netlifegy.com |
| Explorer | https://netlifegy.com |

---

## ✅ Completed Work

### Platform Migration
- [x] Migrated ChainCore from Supabase → Replit Auth (OIDC) + Replit PostgreSQL
- [x] Built Express API server on port 5001 with Drizzle ORM + full schema
- [x] All 160 frontend modules loading without errors
- [x] Fixed temporal dead zone crash in `src/lib/miningPools.ts` (root cause of blank screen)
- [x] App renders correctly — login screen visible, Replit OIDC auth wired

### Deploy Scripts (Phase 1 — complete)
- [x] `public/scripts/deploy-dashboard.sh` — updated to deploy to `/var/www/gydschain`, removed Supabase, added PM2, nginx proxies `/api` to Express on :5001
- [x] `public/scripts/install-fullnode.sh` — updated repo to `github.com/hc172808/fullnode.git`
- [x] `public/scripts/install-litenode.sh` — updated repo to `github.com/hc172808/litenode.git`
- [x] `public/scripts/install-boostnode.sh` — NEW script for `github.com/hc172808/boostnode.git`
- [x] `public/scripts/install-rpcnode.sh` — NEW script for `github.com/hc172808/rpcnode.git`
- [x] `public/scripts/install-genesis.sh` — NEW script for `github.com/hc172808/genesis.git`

### GydsSwap DEX — Phase 1: Smart Contracts (complete)
- [x] `contracts/WGYDS.sol` — Wrapped GYDS ERC-20 wrapper for native coin
- [x] `contracts/GLPToken.sol` — ERC-20 LP token (GLP-GYDS-USDT etc.) with ERC-2612 permit
- [x] `contracts/GydsSwapLibrary.sol` — Pure math: sqrt, quote, getAmountOut/In, TWAP accumulators
- [x] `contracts/GydsSwapPair.sol` — AMM pool (x*y=k), 0.3% fee, mint/burn/swap/sync
- [x] `contracts/GydsSwapFactory.sol` — CREATE2 pair factory, pair registry
- [x] `contracts/GydsSwapRouter.sol` — User router: addLiquidity, removeLiquidity, all swap variants
- [x] `contracts/GydsSwapFarm.sol` — LP staking farm, GYDS rewards, emergency withdraw
- [x] `contracts/README.md` — Deployment order, security notes, AMM formula

---

## 🔧 In Progress

### GydsSwap DEX — Phase 2: Hardhat / Foundry Setup & Tests
- [ ] Set up Hardhat or Foundry project in `contracts/` with GydsChain network config
- [ ] Write deploy scripts: `scripts/deploy.ts` (Factory → Router → Farm → pairs)
- [ ] Unit tests for GydsSwapPair (mint, burn, swap, K invariant, fee math)
- [ ] Unit tests for GydsSwapRouter (slippage, deadline, multi-hop)
- [ ] Unit tests for GydsSwapFarm (stake, unstake, harvest, emergency withdraw)
- [ ] Integration test: full flow — deploy → addLiquidity → swap → removeLiquidity → farm

### GydsSwap DEX — Phase 3: Frontend UI Integration
- [ ] Update `src/pages/DeFi.tsx` — wire SwapInterface to real contract calls
- [ ] `src/components/defi/SwapInterface.tsx` — real getAmountsOut, deadline, slippage
- [ ] `src/components/defi/PoolsList.tsx` — show real reserves, TVL, APR from contracts
- [ ] `src/components/defi/Portfolio.tsx` — show user's GLP balances + earned fees
- [ ] `src/components/defi/StakeInterface.tsx` — wire to GydsSwapFarm stake/unstake/harvest
- [ ] `src/components/defi/Launchpad.tsx` — factory.createPair() UI
- [ ] New: LP Farming Dashboard page (`src/pages/Farm.tsx`)
- [ ] New: Pool statistics page with TVL chart

### GydsSwap DEX — Phase 4: Wallet & Explorer Integration
- [ ] Connect wallet to Chain ID 13370 (GydsChain) in WalletConnectBar
- [ ] Show GYDS native balance + all GLP token balances in wallet panel
- [ ] Explorer: show liquidity pools with TVL on `src/pages/Explorer.tsx`
- [ ] Explorer: add swap history table
- [ ] Explorer: LP token holders per pool

---

## ⏳ Planned (upcoming phases)

### Phase 5 — MobileCore (`github.com/hc172808/chaincore-mobile.git`)
- [ ] Review existing mobile app codebase once GitHub token is added
- [ ] Sync wallet screens with ChainCore dashboard auth (Replit Auth OIDC)
- [ ] Add GydsSwap swap tab in mobile app
- [ ] Push notifications for: new blocks, wallet transactions, farm rewards
- [ ] Biometric auth for transaction signing

### Phase 6 — Digital Wallet (`github.com/hc172808/your-digital-wallet.git`)
- [ ] Review existing wallet codebase
- [ ] Connect to GydsChain (Chain ID 13370) RPC
- [ ] Display GYDS, WGYDS, GLP token balances
- [ ] Send / receive GYDS transactions
- [ ] Sign GydsSwap transactions (swap, add/remove liquidity)
- [ ] Hardware wallet support (Ledger / Trezor via WebHID)
- [ ] Export private key / seed phrase (encrypted)

### Phase 7 — Node Management UI (in ChainCore dashboard)
- [ ] Node installer UI — download & run the right script per node type
- [ ] Node status dashboard — show all 5 node types with health indicators
- [ ] One-click update nodes (pulls from respective GitHub repos)
- [ ] Node logs viewer (tail logs via SSH / API)
- [ ] Genesis block manager — view/edit genesis.json

### Phase 8 — Governance & Token Launch
- [ ] GydsSwap governance token (GYDSX) smart contract
- [ ] On-chain voting for pool weights / emission rates
- [ ] Token launchpad — launch new tokens on GydsChain directly from UI
- [ ] Fair launch mechanics (no pre-mine, linear vesting)

### Phase 9 — Production Hardening
- [ ] Smart contract audit (GydsSwapPair, GydsSwapFarm)
- [ ] Bug bounty program setup
- [ ] Mainnet deployment of all GydsSwap contracts
- [ ] Cloudflare WAF in front of RPC nodes
- [ ] Automated backups for all node data dirs
- [ ] PagerDuty / uptime monitoring for all services

---

## Server Setup Quick Reference

### Deploy Dashboard to Server
```bash
# On your Ubuntu 22.04 server:
git clone https://github.com/hc172808/guardian-chain.git /tmp/deploy
cd /tmp/deploy

DOMAIN=netlifegy.com \
GYDS_SSL_EMAIL=admin@netlifegy.com \
sudo -E bash public/scripts/deploy-dashboard.sh
# → App will be at https://netlifegy.com
# → Files live at /var/www/gydschain
```

### Install Nodes
```bash
# Full Node (founder only)
sudo bash public/scripts/install-fullnode.sh

# Lite Node (public)
bash public/scripts/install-litenode.sh

# RPC Node
sudo bash public/scripts/install-rpcnode.sh

# Boost Node
sudo bash public/scripts/install-boostnode.sh

# Genesis Node (FOUNDER ONLY — run ONCE)
sudo bash public/scripts/install-genesis.sh
```

### Update Dashboard After Changes
```bash
cd /var/www/gydschain
git pull
npm run build
pm2 restart gydschain-api
nginx -s reload
```

---

## GydsSwap Smart Contracts — Deploy Order

```
1. Deploy WGYDS
2. Deploy GydsSwapFactory(feeToSetter)
3. Deploy GydsSwapRouter(factory, WGYDS)
4. Deploy GydsSwapFarm(gydsTokenAddress, emissionRate)
5. Per pair:
   factory.createPair(GYDS, USDT, "GYDS", "USDT")  → GLP-GYDS-USDT
   factory.createPair(GYDS, BTC,  "GYDS", "BTC")   → GLP-GYDS-BTC
   factory.createPair(GYDS, ETH,  "GYDS", "ETH")   → GLP-GYDS-ETH
   factory.createPair(GYDS, USDC, "GYDS", "USDC")  → GLP-GYDS-USDC
6. Per farm pool:
   farm.addPool(glpGydsUsdt, 40)   # 40% of rewards
   farm.addPool(glpGydsBtc,  20)
   farm.addPool(glpGydsEth,  25)
   farm.addPool(glpGydsUsdc, 15)
```

---

## LP Token Standard

| Pair | LP Symbol | Farm Weight |
|---|---|---|
| GYDS / USDT | GLP-GYDS-USDT | 40% |
| GYDS / BTC | GLP-GYDS-BTC | 20% |
| GYDS / ETH | GLP-GYDS-ETH | 25% |
| GYDS / USDC | GLP-GYDS-USDC | 15% |

**AMM:** Uniswap V2 (x × y = k) | **Fee:** 0.3% (0.25% LPs + 0.05% protocol) | **Standard:** ERC-20
