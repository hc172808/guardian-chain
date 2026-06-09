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

> **Add your GitHub Personal Access Token as `GITHUB_TOKEN` in Replit secrets.**
> This enables auto-pull/push on deploy and from the Admin → GitHub tab.

---

## Network & Identity

| Property | Value |
|---|---|
| Blockchain | GydsChain |
| Native Coin | GYDS |
| Chain ID | 13370 |
| Domain | netlifegy.com |
| Dashboard Deploy Path | `/var/www/gydschain` |
| VPN Server | vpn.netlifegy.com:51820 |
| RPC | https://rpc.netlifegy.com |
| WS | wss://ws.netlifegy.com |
| Explorer | https://netlifegy.com |

---

## ✅ Completed Work

### Platform Migration
- [x] Migrated ChainCore from Supabase → Replit Auth (OIDC) + Replit PostgreSQL
- [x] Built Express API server on port 5001 with Drizzle ORM + full schema
- [x] All 160 frontend modules loading without errors (zero TypeScript errors)
- [x] Fixed temporal dead zone crash in `src/lib/miningPools.ts`
- [x] App renders correctly — login screen visible, Replit OIDC auth wired

### Deploy Scripts (all updated)
- [x] `deploy-dashboard.sh` — deploys to `/var/www/gydschain`, PM2 for API, nginx proxies `/api → :5001`
  - [x] **Git auto-pull** — if `GITHUB_TOKEN` is set, stores token in git remote for auth'd pulls
  - [x] **Auto-pull cron** — installs cron job to `git pull --ff-only` every 5 minutes
- [x] `install-fullnode.sh` — → `github.com/hc172808/fullnode.git`
- [x] `install-litenode.sh` — → `github.com/hc172808/litenode.git`
- [x] `install-boostnode.sh` — NEW → `github.com/hc172808/boostnode.git`
- [x] `install-rpcnode.sh` — NEW → `github.com/hc172808/rpcnode.git`
- [x] `install-genesis.sh` — NEW → `github.com/hc172808/genesis.git`

### Portainer Stack Files (NEW — all with WireGuard VPN client)
- [x] `public/docker/portainer-litenode.yml` — Lite Node + WireGuard VPN CLIENT, auto git-pull & build
- [x] `public/docker/portainer-rpcnode.yml` — RPC Node + WireGuard VPN CLIENT + nginx reverse proxy
- [x] `public/docker/portainer-fullnode.yml` — Full Node + WireGuard VPN CLIENT + validator key gen
- [x] `public/docker/portainer-boostnode.yml` — Boost Node + WireGuard VPN CLIENT
- [x] `public/docker/nginx-rpc.conf` — Nginx config for RPC node (rate limiting, CORS, WS, health)

### Admin: Node Type Visibility (NEW — admin/founder controls)
- [x] `src/components/admin/NodeVisibilitySettings.tsx` — toggle which node types users can see/run
- [x] Admin → "Node Types" tab added to Admin page
- [x] `GET /api/node-visibility` — public endpoint (Download page reads this)
- [x] `PUT /api/node-visibility` — admin-only endpoint with audit log
- [x] Founder-only nodes (fullnode, genesis, bootnode) always hidden from regular users

### Admin: Git Sync (NEW)
- [x] `POST /api/admin/git-pull` — admin endpoint: triggers `git pull --ff-only` in app dir
- [x] Admin → GitHub tab now has real "Git Pull" button with live output
- [x] Shows all repository URLs in one place
- [x] Audit log entry on every git pull

### Node Installer (UPDATED)
- [x] Updated all repo URLs to correct per-type GitHub repos
- [x] Added **Boost Node** type
- [x] Added **3 install modes**: Bash Script / Docker CLI / Portainer Stack
- [x] Portainer mode: shows stack file URLs + download button + WireGuard config template
- [x] WireGuard endpoint configurable in the installer UI
- [x] Removed hardcoded `guardian-chain` repo reference

### Admin Page (FIXED)
- [x] Removed Supabase imports — all data fetching now uses Express API (`/api/nodes`, `/api/profile`)
- [x] `handleApproveNode` now calls `PATCH /api/nodes/:id`
- [x] Added `NodeVisibilitySettings` import and "Node Types" tab
- [x] `GitSyncPanel` inline component — real git pull with output display

### GydsSwap DEX — Smart Contracts (complete)
- [x] `contracts/WGYDS.sol` — Wrapped GYDS ERC-20 wrapper for native coin
- [x] `contracts/GLPToken.sol` — ERC-20 LP token with ERC-2612 permit
- [x] `contracts/GydsSwapLibrary.sol` — Pure math: sqrt, quote, getAmountOut/In, TWAP
- [x] `contracts/GydsSwapPair.sol` — AMM pool (x*y=k), 0.3% fee, flash-swap support
- [x] `contracts/GydsSwapFactory.sol` — CREATE2 pair factory + registry
- [x] `contracts/GydsSwapRouter.sol` — User router: all liquidity + swap variants
- [x] `contracts/GydsSwapFarm.sol` — LP staking farm, GYDS rewards, emergency withdraw
- [x] `contracts/README.md` — Deploy order, security notes, AMM formula

---

## 🔧 In Progress

### GydsSwap DEX — Phase 2: Hardhat/Foundry Tests
- [ ] Set up Hardhat project in `contracts/` with GydsChain network config (Chain ID 13370)
- [ ] Write deploy scripts: `scripts/deploy.ts`
- [ ] Unit tests for GydsSwapPair (mint, burn, swap, K invariant, fee math)
- [ ] Unit tests for GydsSwapRouter (slippage, deadline, multi-hop)
- [ ] Unit tests for GydsSwapFarm (stake, unstake, harvest, emergency withdraw)
- [ ] Update `GydsSwapLibrary.sol` INIT_CODE_HASH after pair is deployed

### ChainCore Features — Fix & Test
- [ ] Download page: read `/api/node-visibility` and hide disabled node types
- [ ] Download page: show Portainer stack download buttons per node type
- [ ] NodeInstaller: respect visibility settings (hide disabled types for non-admins)
- [ ] Admin → Users tab: currently shows only current user's profile — fix to fetch all profiles
- [ ] Admin → Nodes: map `nodeType/isApproved` camelCase from API to snake_case UI fields
- [ ] Explorer page: verify block/tx data loads from RPC
- [ ] Wallet page: verify GYDS balance fetching works
- [ ] DeFi page: all 8 tabs load without errors
- [ ] Token Launchpad: test token creation flow end-to-end
- [ ] Faucet: test claim → cooldown → re-claim flow

---

## ⏳ Planned

### Phase 3 — GydsSwap Frontend Integration
- [ ] Wire SwapInterface to real contract calls (getAmountsOut, deadline, slippage)
- [ ] PoolsList: show real reserves, TVL, APR from contracts
- [ ] Portfolio: show user's GLP balances + earned fees
- [ ] StakeInterface: wire to GydsSwapFarm stake/unstake/harvest
- [ ] Launchpad: factory.createPair() UI
- [ ] New: LP Farming Dashboard page (`src/pages/Farm.tsx`)

### Phase 4 — Wallet & Explorer Integration
- [ ] Connect wallet to Chain ID 13370 in WalletConnectBar
- [ ] Show GYDS + all GLP token balances in wallet panel
- [ ] Explorer: show liquidity pools with TVL
- [ ] Explorer: add swap history + LP token holders per pool

### Phase 5 — MobileCore
- [ ] Review `github.com/hc172808/chaincore-mobile.git` codebase
- [ ] Sync with Replit Auth OIDC
- [ ] Add GydsSwap swap tab in mobile app

### Phase 6 — Digital Wallet
- [ ] Review `github.com/hc172808/your-digital-wallet.git`
- [ ] Connect to GydsChain (Chain ID 13370) RPC
- [ ] Send/receive GYDS, sign GydsSwap transactions

### Phase 7 — Production Hardening
- [ ] Smart contract audit (Pair + Farm)
- [ ] Mainnet deploy of all GydsSwap contracts
- [ ] Cloudflare WAF in front of RPC nodes
- [ ] Automated backups for all node data dirs
- [ ] PagerDuty / uptime monitoring for all services

---

## Server Setup Quick Reference

### Deploy Dashboard (with git auto-pull)
```bash
# On Ubuntu 22.04 server (first time or update):
DOMAIN=netlifegy.com \
GYDS_SSL_EMAIL=admin@netlifegy.com \
GITHUB_TOKEN=your_github_token \
sudo -E bash public/scripts/deploy-dashboard.sh

# The GITHUB_TOKEN enables:
# - Auth'd git pull on deploy
# - Cron job: git pull every 5 minutes automatically
# - Admin → GitHub tab: "Git Pull" button with live output
```

### Install Nodes
```bash
bash public/scripts/install-litenode.sh      # Lite Node (users)
sudo bash public/scripts/install-rpcnode.sh  # RPC Node
sudo bash public/scripts/install-boostnode.sh # Boost Node
sudo bash public/scripts/install-fullnode.sh  # Full Node (founder)
sudo bash public/scripts/install-genesis.sh   # Genesis (founder, ONCE)
```

### Portainer Stack Deploy (with WireGuard VPN client)
```bash
# 1. Create WireGuard config on host:
mkdir -p /etc/gydschain
# Edit /etc/gydschain/wg-litenode.conf (see template in installer UI)

# 2. In Portainer → Stacks → Add stack → Upload file:
#    public/docker/portainer-litenode.yml    (Lite Node)
#    public/docker/portainer-rpcnode.yml     (RPC Node)
#    public/docker/portainer-fullnode.yml    (Full Node)
#    public/docker/portainer-boostnode.yml   (Boost Node)

# 3. Set env vars in Portainer Stack Environment tab:
#    WG_CONF_PATH=/etc/gydschain/wg-litenode.conf
#    GYDS_RPC_URL=https://rpc.netlifegy.com
#    (see comments at top of each .yml for full list)
```

### Update Dashboard
```bash
cd /var/www/gydschain
git pull
npm run build
pm2 restart gydschain-api
nginx -s reload
```

---

## GydsSwap Deploy Order

```
1. Deploy WGYDS
2. Deploy GydsSwapFactory(feeToSetter)
3. Deploy GydsSwapRouter(factory, WGYDS)
4. Deploy GydsSwapFarm(gydsTokenAddress, emissionRate)
5. factory.createPair(GYDS, USDT, "GYDS", "USDT")  → GLP-GYDS-USDT
   factory.createPair(GYDS, BTC,  "GYDS", "BTC")   → GLP-GYDS-BTC
   factory.createPair(GYDS, ETH,  "GYDS", "ETH")   → GLP-GYDS-ETH
   factory.createPair(GYDS, USDC, "GYDS", "USDC")  → GLP-GYDS-USDC
6. farm.addPool(glpGydsUsdt, 40)
   farm.addPool(glpGydsBtc,  20)
   farm.addPool(glpGydsEth,  25)
   farm.addPool(glpGydsUsdc, 15)
```

| Pair | LP Symbol | Farm Weight |
|---|---|---|
| GYDS / USDT | GLP-GYDS-USDT | 40% |
| GYDS / BTC | GLP-GYDS-BTC | 20% |
| GYDS / ETH | GLP-GYDS-ETH | 25% |
| GYDS / USDC | GLP-GYDS-USDC | 15% |
