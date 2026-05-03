# ChainCore / GydsChain — Project TODO

> Legend: 🔴 Blocking · 🟡 High · 🟢 Normal · ✅ Done

---

## 🗄️ Database / Backend (Supabase)

| # | Priority | Task | Notes |
|---|----------|------|-------|
| DB-1 | ✅ | `token_operations_operation_type_check` constraint extended | Added `mint_gyds`, `mint_gyd`, `bridge_mint_gyds`, `sponsor_deposit`, `sponsor_withdraw` — migration `20260323100000` |
| DB-2 | 🟡 | Apply migration to production Supabase | Run `supabase db push` or paste migration SQL in Supabase SQL editor |
| DB-3 | 🟢 | Seed `admin_config` with default `gyds_logo`, `gyd_logo`, `founder_wallet`, `gyds_price` rows | Prevents null-dereference on first deploy |
| DB-4 | 🟢 | Add `stake` / `unstake` operation types to `token_operations` constraint | Currently stake writes to `transactions` only; decide if `token_operations` should also log them |
| DB-5 | 🟢 | RLS policy audit — verify `transactions`, `token_operations`, `pools`, `launches` are locked to `user_id = auth.uid()` for writes | Prevent cross-user manipulation |

---

## 🌐 Frontend (React / DeFi / Explorer)

| # | Priority | Task | Notes |
|---|----------|------|-------|
| FE-1 | ✅ | `TokenSelectorButton` wrapped in `React.forwardRef` | Eliminates Radix ref warning |
| FE-2 | ✅ | SwapInterface refresh button wired + slippage editor | `loadTokens` as `useCallback`, spin animation |
| FE-3 | ✅ | StakeInterface "Max" buttons functional + balance `.toFixed(4)` | |
| FE-4 | ✅ | PositionDetails yieldPeriod Badge clickable (24H → 7D → 30D) | |
| FE-5 | ✅ | PositionDetails "Max" deposit buttons set real value | |
| FE-6 | ✅ | CrossChainBridge `chainId` param shadowing fixed | |
| FE-7 | ✅ | Pool ownership check before showing "Close Pool" action | `creator_id` added to `Pool` interface + select; Close menu hidden unless `pool.creator_id === user.id` |
| FE-8 | ✅ | Replace hardcoded GYD price multiplier (`86.8`) in StakeInterface / PositionDetails / PoolsList / Portfolio | New `useDeFiConfig` hook reads `gyd_price.usd` from `admin_config` (default 1.0); seeded by migration `20260424100000_seed_defi_config_defaults.sql` |
| FE-9 | ✅ | Replace hardcoded `priceRatio: 11720.903` in Portfolio → PositionDetails | Now uses `gydPriceUsd` from `useDeFiConfig`; falls back to 1 when oracle not yet wired |
| FE-10 | ✅ | Replace hardcoded staking stats (APR 74.87%, stakedTotal 7 439 000, buybacks24h 12 400, exchangeRate 1.3626) | Loaded from `admin_config.staking_stats` via `useDeFiConfig`; defaults to all-zero / 1.0 exchange rate when no row present |
| FE-11 | 🟢 | Add `data-testid` attributes to all interactive DeFi elements | See fullstack-js guidelines |
| FE-12 | 🟢 | WalletConnectBar — show real on-chain balance via RPC when node is live | Currently reads from `token_operations` aggregation only |
| FE-13 | 🟢 | Faucet cooldown persisted server-side | Currently stored in `localStorage`; can be bypassed by clearing storage |
| FE-14 | 🟢 | Add loading skeleton to Launchpad list | No loading state while `launches` query runs |
| FE-15 | 🟢 | Bridge history empty state | `BridgeHistory` shows nothing when no rows match |
| FE-16 | 🟢 | Mobile viewport — DeFi bottom nav overlaps swap button on small screens | Add `pb-20` or safe-area inset on page container |

---

## ⛓️ Blockchain Core (Token Ledger / Send / Double-Spend)

| # | Priority | Task | Notes |
|---|----------|------|-------|
| BC-1 | ✅ | TokenDetail "Holders" tab now shows real data | Pulls confirmed `token_operations` filtered by `token_id`, plus the creator wallet (resolved from `wallets`); creator gets remainder = `total_supply − burned_supply − Σ(mints to others)`; replaced two hardcoded `[]` arrays in `src/pages/TokenDetail.tsx` |
| BC-2 | ✅ | "Burn Tokens" dialog on TokenDetail (creator only) | Updates `tokens.burned_supply` and inserts `token_operations` row with `operation_type='token_burn'` + `token_id`; live realtime channel re-loads holders on insert |
| BC-3 | ✅ | Wallet Send checks balance + gas before insert | `handleSendTransaction` rejects when `amount + fee > balance`; separate gas check ensures sender keeps enough native GYD when sending non-native asset; surfaces server-side `Insufficient balance` errors with friendly text |
| BC-4 | ✅ | Server-side double-spend prevention | `BEFORE INSERT` trigger `check_transaction_balance` recomputes inflow / outflow / op-credits per `from_address` and rejects insert with `23514` when insufficient; reserved system wallets (founder, mining, LP, staking, dev, team, burn) exempt — migration `20260424110000_token_ledger_and_balance_check.sql` |
| BC-5 | 🟡 | Apply BC migration to production Supabase | `20260424110000_token_ledger_and_balance_check.sql` — adds `token_id` FK, extends operation_type CHECK, installs balance trigger |
| BC-6 | 🟢 | Add per-token transfer UI (token send button) | Currently only the global wallet Send works for GYDS/GYD; custom-token transfers between wallets need their own action that writes `token_transfer` ops |
| BC-7 | 🟢 | Block-confirmation status (pending → confirmed via real RPC) | All inserts currently mark `status='confirmed'` immediately; integrate Go fullnode RPC to flip status only after block inclusion |
| BC-8 | ✅ | Fix Burn (constraint violation) | `BurnMintManager` was inserting legacy `operation_type='burn'`/`'mint'` which the active CHECK constraint rejects (only `burn_gyds`/`mint_gyds`/etc. allowed). Switched both `handleBurnUsdt` and `handleMint` to `burn_gyds` / `mint_gyds`. Burn flow now succeeds end-to-end. |
| BC-9 | ✅ | New wallets always start at 0 balance | `getUserBalances` no longer credits a user just because they're the `created_by` of a `token_operations` row. Balances now derive **strictly** from `wallet_address ∈ user.wallets`. A freshly created wallet has no inbound ops/txs, so `gyd = gyds = 0` until something is sent to its address — fixes phantom balances inherited from admin actions. |

---

## 🌐 Network Environments & Wallet Connectivity

| # | Priority | Task | Notes |
|---|----------|------|-------|
| NET-1 | ✅ | Add **devnet** config | `src/config/network.ts` rewritten with `DEVNET_CONFIG` (chainId 13372, RPC `devnet-rpc.netlifegy.com` / `localhost:8548`), `NETWORK_REGISTRY`, `getNetworkConfig`, `getNetworkByChainId`. `getNetworkParams` now accepts `'mainnet' \| 'testnet' \| 'devnet'`. Hardcoded LAN RPC removed (use `VITE_GYDS_RPC_LAN` instead). Same cleanup applied to `src/config/tokens.ts`. |
| NET-2 | ✅ | Active-network selector | `useActiveNetwork` hook (localStorage + `gyds:active-network-changed` window event for cross-tab sync) and `NetworkSwitcher` mounted in the Sidebar header. Consumers can read `env`/`config` from the hook to scope their RPC calls. |
| NET-3 | ✅ | Strip unsupported bridge chains | Removed Solana from `EXTERNAL_CHAINS` in `CrossChainBridge.tsx` and left a comment pointing at NET-4 for re-enablement once a Phantom adapter exists. |
| NET-4 | 🟢 | Phantom / non-EVM wallet path | Decision deferred. If we re-add Solana to the bridge, we must also ship an SPL adapter; otherwise document EVM-only in onboarding. |
| NET-5 | ✅ | Per-network RPC health badge | `useRpcHealth` polls every endpoint of the active network every 30 s with a 5 s timeout and surfaces `healthy` / `degraded` / `down`. `NetworkSwitcher` renders the coloured dot + latency tooltip. |

---

## ⛏️ Mining

| # | Priority | Task | Notes |
|---|----------|------|-------|
| MIN-1 | ✅ | Move block time to `admin_config.mining_config` | New `useMiningConfig` hook reads `{ block_time_seconds, base_reward, halving_blocks, pool_fee_default }` from `admin_config.mining_config` (defaults preserved). Wired into `Mining.tsx` header and `MiningPoolInterface.tsx` pool stats — no more hardcoded `120s`. Realtime-subscribed so admin edits propagate live. |
| MIN-2 | 🟡 | Audit reward distribution writes | Confirm pool payouts insert `token_operations` rows from the `mining_pool` reserved wallet (`0x…0002`) and respect the balance trigger; add tests for split between solo miner and pool. |
| MIN-3 | 🟢 | Per-miner stats persistence | `MiningStats` currently in-memory only; persist to a `mining_sessions` table so the user can see lifetime hashes / earnings across reloads. |

---

## 🪙 Token Lifecycle (Devnet → Mainnet Promotion)

| # | Priority | Task | Notes |
|---|----------|------|-------|
| LIFE-1 | ✅ | New tokens deploy to **devnet** by default | Migration `20260427100000_token_lifecycle_devnet.sql` adds `tokens.network`, `tokens.lifecycle_stage`, `tokens.market_cap_usd`, `tokens.promoted_at` (all idempotent). `TokenFactory` writes `network='devnet'` unless founder disables `token_lifecycle.devnet_default`. |
| LIFE-2 | ✅ | Promotion eligibility logic | View `v_token_promotion_eligibility` joins `admin_config.network_features.token_lifecycle` thresholds against each token's `age_days` and `market_cap_usd` and exposes `is_eligible`. Granted to `authenticated`/`anon`. |
| LIFE-3 | ✅ | Founder/admin promotion review UI | New `TokenPromotionsManager.tsx` mounted at Admin → Promotions. Lists eligible / waiting / promoted tokens; Promote flips `network` + `lifecycle_stage` to mainnet, stamps `promoted_at`, and writes an `audit_logs` row (`token:promote`). Reject just records `token:reject`. |
| LIFE-4 | ✅ | Configurable lifecycle thresholds | `useNetworkFeatures.NetworkFeatures.token_lifecycle` typed; new "Token Lifecycle Thresholds" card in `NetworkFeaturesManager` lets founders tune `min_age_days`, `min_market_cap_usd`, `allow_self_promotion`, `devnet_default`. |

---

## 🛡️ Admin / Operator Tools

| # | Priority | Task | Notes |
|---|----------|------|-------|
| ADM-1 | ✅ | Secure server-side console panel | `AdminConsolePanel.tsx` — 7 whitelisted commands (`node:status`, `audit:tail`, `config:reseed-defaults`, `nodes:purge-rejected`, `transactions:cancel-stale`, `featureflags:reset`, `bootnodes:rotate`); every run inserted into `audit_logs` with category `admin_console`. |
| ADM-2 | ✅ | One-click multi-service deploy UI | `DeployServicesPanel.tsx` — picks fullnode / litenode / bootnode / termux, generates a chained `curl … \| sudo bash` command, copy + script-download buttons. |
| ADM-3 | ✅ | Component-visibility matrix | `network_features.hidden_components: string[]` — chosen via the new card in `NetworkFeaturesManager`; `Sidebar.tsx` filters its `navItems` (founders/admins always see everything). |
| ADM-4 | ✅ | Edge Function secrets manager (admin) | `SecretsManager.tsx` — list / add / edit / remove secrets stored in `admin_config.edge_secrets`; values masked, save-all UX. Consumed by `blockchain-api` edge function (`GYDS_RPC_ENDPOINT`). |
| ADM-5 | ✅ | Project file browser + editor (admin) | `FileEditor.tsx` — full-tree browser of `public/blockchain-go/` with in-place text editing, save back to repo path. Founder/admin only. |
| ADM-6 | ✅ | Smart-contract template manager (admin) | `SmartContractManager.tsx` — admin can add/edit/remove `contract_templates` (GRC-20, GRC-721, Staking, Multi-Sig); deploys exposed at `/smart-contracts`. |
| ADM-7 | ✅ | Feature toggle manager (admin) | `FeatureToggleManager.tsx` + `feature_toggles` table — per-feature enable/disable + admin-only flag (DeFi, Mining, Token Factory, Smart Contracts, etc.). |

---

## 🌐 Node Infrastructure (Bootnode)

| # | Priority | Task | Notes |
|---|----------|------|-------|
| INF-3 | ✅ | Bootnode creation script | `public/scripts/install-bootnode.sh` — minimal Ubuntu 22.04 install (P2P 30301), generates node key, prints the resulting enode URL for paste-into-admin. |
| INF-4 | ✅ | Admin UI for bootnode list | `BootnodeManager.tsx` — list / add (with enode-URL validation) / move-up / remove / copy-JSON-for-fullnode-config; persists to `admin_config.bootnodes` with realtime watch. |
| INF-5 | 🟡 | Public `/bootnodes.json` endpoint | Add a Supabase Edge Function (or static deploy step) that mirrors `admin_config.bootnodes` to a public JSON URL so `install-fullnode.sh` can `curl` it on first boot. |
| INF-15 | ✅ | **Run a node directly on Replit** | New `scripts/replit-node.sh` (lite \| devnet \| build-only) builds the Go binary on first run (cached under `.local/bin/`), exports a clean banner, and forces `GOTOOLCHAIN=local`. `lite` mode connects to peer RPCs (env `NODE_RPC_ENDPOINTS`) on local API port 3000; `devnet` mode runs a self-contained `--founder` fullnode with RPC on **8000** + P2P on **8080** (Replit-supported ports). Side fixes: lowered `public/blockchain-go/go.mod` to `go 1.21` and `golang.org/x/net` to `v0.27.0` so the sandbox toolchain compiles; populated `FounderAddress` + `GenesisGYDS` (1B premine to `0x…01` sentinel) in `cmd/fullnode/main.go` to fix a nil-pointer panic in `createGenesisBlock`. New "ChainCore Node" workflow runs `./scripts/replit-node.sh devnet`; `Download → Nodes` tab now shows `RunOnReplitCard` with copy-to-clipboard commands. |
| INF-16 | ✅ | **Live node-status everywhere (no mocks)** | Added Vite dev proxy `/__node-rpc/*` → `http://127.0.0.1:8000` in `vite.config.ts` so the browser (port 5000) can reach the local node RPC despite Replit's preview proxy. New hook `src/hooks/useNodeStatus.ts` polls `chain_getBlockNumber` + `pos_getFinalizedBlock` every 5s via TanStack Query, returns `{ online, blockHeight, finalizedHeight, latencyMs }`. Wired into `RunOnReplitCard` (green "Devnet running locally" badge with live block height + RPC latency + manual refresh) **and** the global `Sidebar` bottom panel — the previously hardcoded `Block Height: 1,234,567` / `TPS: 1,250` placeholders are gone, replaced with real numbers from the running node, with a graceful "Local Node Offline" state that prompts the user to run `./scripts/replit-node.sh devnet`. |
| INF-17 | ✅ | **Authorities Status widget in Admin sidebar** | New `src/components/admin/AuthoritiesStatusWidget.tsx` rendered in `Sidebar.tsx` for `isFounder \|\| isAdmin`. Reads live `authorities` table via `useAuthorities` (49 rows total), shows "X of N authorities disabled" headline, escalates color from emerald (all live) → yellow (some disabled) → amber (critical disabled: `validator`/`miner`/`consensus`) → red ("CHAIN HALTED" when `emergency_shutdown` row is OFF). Lists the first 3 critical-disabled authorities by name. The whole card is a button that deep-links to `/admin?tab=authorities`. `Admin.tsx` was upgraded to a controlled `<Tabs value/onValueChange>` driven by `useSearchParams` so `?tab=...` selects (and is kept in sync with) the active tab — also enables shareable URLs to any admin sub-section. |

---

## 🧬 GPL — Smart Contract Layer

| # | Priority | Task | Notes |
|---|----------|------|-------|
| GPL-1 | ✅ | GYDS-20 token program library | `src/gpl/programs/token/index.ts` — typed builders for `mint`, `transfer`, `burn`, `approve`, `freeze`, `thaw`, `updateMeta`, `ret` + `deployToken()` helper. Spec at `public/docs/GYDS-20.md`. |
| GPL-2 | ✅ | Sandboxed VM (TS + Go fullnode executor) | TS interpreter at `src/gpl/vm/index.ts` and equivalent Go VM at `public/blockchain-go/internal/gpl/vm.go`. **Wired into the chain**: new `TxTypeProgram` (= 6); `executeTransactionLocked` decodes `tx.Data` as `[]gpl.Instruction`, loads program state from LevelDB key `program-state:<addr>` via `program_state.go`, runs `gpl.Interpret`, persists the post-exec state, and stamps `tx.GasUsed` from the VM's metered amount. Failed program txs still bump nonce (EVM-style) so they can't be replayed forever. |
| GPL-3 | ✅ | Gas metering, block-gas ceiling, miner enforcement | Per-opcode gas table seeded in `admin_config.gpl_config.gas_table`; `transactions.gas_limit` / `gas_used` columns added by `20260425100000`; VM enforces `gas_limit` per run. `Config.MaxGasPerBlock` (default 30 M, mirrors `block_gas_limit`) + `Blockchain.BuildBlock(proposer, maxTxs)` drains the txpool while honouring the block budget, and **`internal/consensus/pos.go::proposeBlock` now actually calls it**: every consensus tick the elected proposer runs `BuildBlock → CommitBlock` so the ceiling is enforced at mining time, not just declared. `CommitBlock` re-checks `GasUsed ≤ MaxGasPerBlock` and prev-hash continuity before advancing the head. |
| GPL-4 | ✅ | GPL playground | `GPLPlayground.tsx` — founder-only Admin tab; sample programs, JSON editor, gas estimator vs limit, runs program in the in-browser VM, shows events / final state / errors with `ip`. |

## Authority Registry (chain-level capability switches)

| # | Priority | Task | Notes |
|---|----------|------|-------|
| AUTH-1 | ✅ | `authorities` table + seed (REAL — applied 2026-05-02) | Migration creates `authorities(id, category, name, description, enabled, required_role, updated_by, updated_at)` and seeds **49** named authorities across 9 categories: Consensus & Block Production, Economic / Monetary, Protocol Upgrade, Administrative, Governance, Access / Security, Cross-Chain & Oracles, Contract Lifecycle, Wallet. Includes `v_authority_summary` view. |
| AUTH-2 | ✅ | RLS — founder/admin gated writes | SELECT open to authenticated; UPDATE only by founder, or by admin if `required_role='admin'`. INSERT founder only. |
| AUTH-3 | ✅ | `useAuthorities()` hook | `src/hooks/useAuthorities.ts` — fetches the registry, exposes `byCategory`, `isEnabled(id)` (safe-default ON), and a `toggle()` mutator with realtime subscription. |
| AUTH-4 | ✅ | Admin → Authorities tab | `AuthoritiesManager.tsx` with grouped switches, per-category Enable-all/Disable-all, search filter. Wired as a new tab in `Admin.tsx` (controlled by `?tab=authorities`). |
| AUTH-WIDGET | ✅ | Sidebar Authorities Status widget | `AuthoritiesStatusWidget.tsx` — emerald/yellow/orange/red colored chip in the sidebar (founders/admins only) showing "X of N disabled", escalating to red "CHAIN HALTED" when `emergency_shutdown` is OFF. Deep-links to `/admin?tab=authorities`. |
| AUTH-5 | ✅ | Global `ChainStatusBanner` in Layout | `src/components/authority/ChainStatusBanner.tsx` mounted in `Layout.tsx`. Reads `useAuthorities`; sticky red banner when `emergency_shutdown=OFF` ("CHAIN HALTED"), yellow banner when `freeze_pause=OFF`. |
| AUTH-6 | ✅ | `<AuthorityGate>` reusable wrapper | `src/components/authority/AuthorityGate.tsx` — accepts `requireAll: string[]`, optional `silent`, renders disabled-state card when blocked. Also exports imperative `checkAuthorities(isEnabled, ids[])` for handlers. |
| AUTH-7 | ✅ | Wire Burn/Mint Manager to authorities | `handleBurnUsdt` checks `emergency_shutdown + freeze_pause + burn + mint`. `handleMint` checks `emergency_shutdown + freeze_pause + mint`. Toast surfaces the blocking authority id. |
| AUTH-8 | ✅ | Wire Swap (DeFi) to authorities | `executeSwap` gated on `emergency_shutdown + freeze_pause + contract_execute`. |
| AUTH-9 | ✅ | Wire Bridge to authorities | `handleBridge` gated on `emergency_shutdown + bridge + cross_chain_messaging + mint`. |
| AUTH-10 | ✅ | Server-side `emergency_shutdown` check in `github-sync` edge fn | New `supabase/functions/github-sync/index.ts` calls `authorities` table with the service-role key BEFORE doing any work and returns `423 chain_halted` when `emergency_shutdown=OFF`. Also gates on `protocol_config`. |

## Self-host Supabase (own the data plane)

| # | Priority | Task | Notes |
|---|----------|------|-------|
| SUPA-1 | ✅ | Drop-in compose stack | `infra/supabase-selfhost/docker-compose.yml` — Postgres 15 + Kong + GoTrue + PostgREST + Realtime + Storage + postgres-meta + Studio. Localhost-only DB binding, healthchecks, named volumes for db/storage. |
| SUPA-2 | ✅ | Kong gateway routing | `infra/supabase-selfhost/kong.yml` — declarative routes for `/auth/v1`, `/rest/v1`, `/realtime/v1`, `/storage/v1`, `/pg`. Anon + service_role consumers wired with `key-auth` + `acl`. |
| SUPA-3 | ✅ | Bootstrap script + env template | `bootstrap.sh` checks for docker, copies `.env.example`→`.env` if missing, pulls images, brings the stack up, waits for db health. `.env.example` documents every required secret (POSTGRES_PASSWORD, JWT_SECRET, SECRET_KEY_BASE, ANON_KEY, SERVICE_ROLE_KEY, SMTP_*). |
| SUPA-4 | ⏳ | TLS + reverse proxy recipe | Add a sample nginx vhost / Caddyfile for `supabase.<domain>` → `:8000` and `studio.<domain>` → `:3001` with basic auth. (next pass) |

---

## ⚙️ Smart Contract & Network Settings (Founder/Admin Toggles)

| # | Priority | Task | Notes |
|---|----------|------|-------|
| SC-1 | ✅ | `NetworkFeaturesManager` admin UI | Grouped Switch toggles + min-GYDS Input + sticky Save bar; restricted to founder/admin |
| SC-2 | ✅ | `useNetworkFeatures` hook | Reads `admin_config.network_features` + counts approved/online nodes; realtime subscribed to both tables |
| SC-3 | ✅ | User verification (KYC) flag on `profiles` | New `is_verified` boolean; Admin → Users tab now shows Verified badge + Verify/Revoke button (founders excluded) |
| SC-4 | ✅ | Swap gated by network features | `executeSwap` rejects when `swap_enabled=false` or (`require_node_for_swap` && no online node) |
| SC-5 | ✅ | Bridge gated by KYC + balance + node | `handleBridge` checks `bridge_enabled`, online node, `is_verified`, and aggregate GYDS balance ≥ `min_gyds_for_bridge` |
| SC-6 | ✅ | Token Factory authority gates | Mint / Freeze / Update Authority Switches disabled & badged "DISABLED BY ADMIN" when corresponding `allow_*_authority` flag is off |
| SC-7 | 🟡 | Apply migration to production Supabase | `20260424120000_network_features_and_verification.sql` — adds `profiles.is_verified`, seeds `network_features` config, adds founder-only RLS policy |

---

## 🐳 Docker / Node Infrastructure

| # | Priority | Task | File | Status |
|---|----------|------|------|--------|
| INF-1 | ✅ | `Dockerfile.explorer` — fixed `bun.lock` → `package-lock.json`, `npm install` → `npm ci` | `public/docker/Dockerfile.explorer` | Done |
| INF-2 | ✅ | `docker-compose.yml` — hard-fail on missing `INDEXER_DB_PASSWORD` | `public/docker/docker-compose.yml` | Done |
| INF-3 | ✅ | `docker-compose.prod.yml` — port mapping `8545→8545` corrected to `8546→8546` | `public/docker/docker-compose.prod.yml` | Done |
| INF-4 | ✅ | `nginx.conf` — HSTS, `font-src data:`, `wss://*.supabase.co`, `frame-ancestors none` | `public/docker/nginx.conf` | Done |
| INF-5 | ✅ | Build Go fullnode binary | `public/blockchain-go/cmd/fullnode/main.go` | `go build ./cmd/fullnode` → OK; `--help` prints flags |
| INF-6 | ✅ | Build Go litenode binary | `public/blockchain-go/cmd/litenode/main.go` | Compiles cleanly via `go build ./...` |
| INF-7 | ✅ | Resolve Go module import cycles & compile errors | `public/blockchain-go/internal/*` | `mining↔liteclient` cycle fixed (MiningClient interface); `state.Commit()` returns `([32]byte, error)`; added generic `SetBalance/AddBalance/SubBalance/AddStake/SubStake` dispatchers; added `Blockchain.GetAccountState`; added `Tx.HashHex()`, `Tx.GasUsed`; fixed `BlockHeader` field names; added `Blockchain.BlockChan/TxChan` event channels; `go vet ./...` clean |
| INF-8 | ✅ | `node.env` template with all required env vars | `public/scripts/node.env.template` | Hardcoded LAN IP `192.168.18.106` removed; `GYDS_RPC_LAN` is now opt-in |
| INF-9 | ✅ | Standalone systemd service files for fullnode + litenode | `public/systemd/gyds-{fullnode,litenode}.service` | Hardened (`NoNewPrivileges`, `ProtectSystem=strict`, `RestrictSUIDSGID`, etc.); reads `EnvironmentFile=/opt/guardian-chain/node.env` |
| INF-10 | ✅ | UFW firewall rules: SSH (rate-limited), HTTP/HTTPS, RPC (8546/8547), P2P (30303 tcp+udp), bootnode (30301 udp), WireGuard (51820 udp) | `public/systemd/gyds-ufw.sh` | Defaults to deny-incoming; ports overridable via env |
| INF-11 | ✅ | Fail2Ban jails for SSH + GYDS RPC + GYDS P2P | `public/systemd/gydschain-fail2ban.conf` | Drop-in for `/etc/fail2ban/jail.d/gydschain.conf` |
| INF-12 | 🟢 | WireGuard VPN for private node-to-node P2P | `wireguard-config.template` | 🔲 |
| INF-13 | 🟢 | SSL certificates via `ssl-setup.sh` (certbot + nginx) | `public/scripts/ssl-setup.sh` | 🔲 |
| INF-14 | 🟢 | `deploy-ecosystem.sh` end-to-end smoke test | `public/scripts/deploy-ecosystem.sh` | 🔲 |

---

## 🔐 Security

| # | Priority | Task | Notes |
|---|----------|------|-------|
| SEC-1 | ✅ | Wallet key backup procedure documented | `public/docs/wallet-backup.md` — manual + GPG + systemd-timer + restore-verify + key-rotation steps |
| SEC-2 | ✅ | Genesis block verification on node start | `internal/blockchain/genesis_verify.go` — `VerifyAndPersistGenesis()` persists hash on first boot, refuses to start on mismatch; wired into `cmd/fullnode/main.go` before any service starts |
| SEC-3 | ✅ | Admin/sensitive routes guarded by role on the frontend | `/admin` and `/node-terminal` wrapped in `<RequireAuth requiredRole="admin">`; `/smart-contracts` wrapped in `<RequireAuth>`. Non-admins are redirected to `/`. RLS still enforces server-side. |
| SEC-4 | 🟢 | Rate-limit Faucet server-side (Supabase RLS or edge function) | Client-side cooldown is bypassable |

---

## 🚀 Deployment Checklist (netlifegy.com)

> Follow the GYDSChain Full Ecosystem Deployment Guide order.

- [x] **INF-5/6** Go binaries built and tested locally
- [x] **INF-7** `go mod tidy`, no import cycles
- [x] **INF-8** `node.env` template clean (no hardcoded LAN IP)
- [x] **INF-9** systemd unit files written (`public/systemd/gyds-*.service`) — operator must `cp` + `enable --now`
- [x] **INF-10/11** UFW (`public/systemd/gyds-ufw.sh`) + Fail2Ban (`public/systemd/gydschain-fail2ban.conf`) artifacts ready
- [ ] **DB-2** Migration applied to production Supabase
- [ ] **DB-3** `admin_config` seeded with defaults
- [ ] `docker compose -f docker-compose.prod.yml up -d` after setting `INDEXER_DB_PASSWORD`
- [ ] **INF-13** SSL certs via `ssl-setup.sh`
- [ ] Nginx routing verified: `/api/` → litenode RPC, `/explorer` → frontend
- [ ] Smoke test: `https://netlifegy.com/api/status` returns 200
- [ ] Explorer loads and indexes blocks

---

## 📦 Ecosystem File Map (quick reference)

| Path | Purpose |
|------|---------|
| `public/blockchain-go/` | Go node source (fullnode + litenode) |
| `public/docker/` | Docker Compose stacks + Nginx config |
| `public/scripts/` | Shell installers and deploy scripts |
| `supabase/migrations/` | PostgreSQL schema migrations |
| `src/` | React frontend (SPA) |
| `src/pages/` | Top-level pages (Explorer, DeFi, Wallet, Admin, …) |
| `src/components/defi/` | DeFi widgets (Swap, Stake, Bridge, Pools, …) |
| `src/components/admin/` | Admin panel widgets |
| `src/hooks/` | Custom React hooks |
| `src/integrations/supabase/` | Supabase client + auto-generated types |
| `public/systemd/` | Standalone deployment artifacts (.service, fail2ban, ufw) |
| `public/docs/` | Operator-facing docs (wallet backup, GYDS-20 spec, …) |

---

## 🧬 GPL — GYDS Program Library (Solana-style Architecture)

> **Goal**: build a modular program library inspired by Solana / SPL.
> All token logic lives in **one shared engine** (no per-token contracts);
> smart contracts are sandboxed, opt-in modules deployable by registered accounts only.
> Backward-compatible with the existing `chaincore` Go node — extends, never replaces.

### GPL-A · Core Programs (each lives under `public/blockchain-go/internal/programs/<name>/`)

| # | Module | Purpose | Reuse / Extend |
|---|--------|---------|----------------|
| GPL-A1 | 🟡 `system` | Account creation, lamport (GYDS-wei) transfer, nonce/replay, fee deduction | Wraps `internal/blockchain/state.go` `Account` + `SubBalance` |
| GPL-A2 | 🟡 `token` (GYDS-20) | Single shared engine for **all** fungible tokens; mint, burn, transfer, freeze, delegate | Promote `internal/token/factory.go` to a Program; tokens become `Mint{authority, supply, decimals}` + `TokenAccount{mint, owner, amount}` records |
| GPL-A3 | 🟡 `accounts` | PDA-style addressing, account metadata, owner/program tagging | New; index by `[20]byte` address + `program_id` |
| GPL-A4 | 🟡 `staking` | Validator stake, delegator stake, rewards, slashing | Wraps existing `consensus/pos.go` + `state.AddStake/SubStake` |
| GPL-A5 | 🟡 `vm` | Sandboxed deterministic VM for user contracts; gas-metered, upgradeable | New; start with WASM (wazero) or a constrained interpreter |

### GPL-B · Smart-Contract System (opt-in, gated)

| # | Item | Notes |
|---|------|-------|
| GPL-B1 | 🟡 Contract registry: `programs/registry/` — only addresses with `is_contract_developer = true` (or admin/founder) may `DeployContract` | Prevents accidental "every account is a contract" sprawl |
| GPL-B2 | 🟡 Sandbox limits: max gas/tx, max memory, no syscalls, no host clock — strict determinism | Required for replay-correct consensus |
| GPL-B3 | 🟡 `TxType.ContractCall` + `TxType.ContractDeploy` added to `blockchain.Transaction.TxType` | Extend the typed-tx switch in `ExecuteTransaction` |
| GPL-B4 | 🟢 Upgradeable contract pattern (proxy/admin pointer record per contract) | Optional; off by default |

### GPL-C · State, Storage & Sync

| # | Item | Notes |
|---|------|-------|
| GPL-C1 | ✅ Persistent KV via existing `internal/storage/` (LevelDB-shape `Database` interface) | Already used by `StateDB.Commit()` |
| GPL-C2 | 🟡 Deterministic state-root via `sha256` over sorted dirty-account serializations | **DONE** in `state.Commit()`; promote to a true Merkle / IAVL tree later |
| GPL-C3 | ✅ Snapshot export/import (`state-snapshot:<height>` key prefix) | `internal/blockchain/state_snapshot.go` — `StateDB.ExportSnapshot/LoadSnapshotManifest/ImportSnapshot/PruneSnapshot`; persists per-account rows + 48-byte manifest under `state-snapshot:<height>:_manifest` in the same LevelDB keyspace |
| GPL-C4 | 🟢 Fast state sync RPC (`gyds_getSnapshot`, `gyds_applySnapshot`) | Pair with GPL-C3 |

### GPL-D · Accounts & Security

| # | Item | Notes |
|---|------|-------|
| GPL-D1 | 🟡 Ed25519 signing helpers in `internal/crypto/ed25519.go` | Currently only ECDSA assumed; add wrapper |
| GPL-D2 | 🟡 Address validation (length, checksum, EIP-55-style for compatibility) | Frontend already shows checksum; backend should reject malformed |
| GPL-D3 | ✅ Nonce-based replay protection | `Account.Nonce` exists; verify `validateTransaction()` enforces strict-increment |
| GPL-D4 | 🟢 Multisig / threshold-sig program (optional standalone Program) | Phase 2 |

### GPL-E · Transactions & Mempool

| # | Item | Notes |
|---|------|-------|
| GPL-E1 | 🟡 Typed-tx enum: `Transfer`, `Mint`, `Burn`, `ContractDeploy`, `ContractCall`, `Stake`, `Unstake`, `Sponsor` | Extend `blockchain.TxType` |
| GPL-E2 | 🟡 Fee model: `base_fee + priority_tip` (EIP-1559-style) | Currently flat `GasPrice * GasLimit`; add `MaxPriorityFeePerGas` to `Transaction` |
| GPL-E3 | 🟡 Mempool prioritization by tip + nonce ordering | `internal/blockchain/txpool.go` exists — extend with priority queue |
| GPL-E4 | 🟢 Tx receipts table (gas_used, status, logs[]) emitted via event channel | Pair with GPL-G1 |

### GPL-F · Consensus Hooks

| # | Item | Notes |
|---|------|-------|
| GPL-F1 | 🟡 Pre-block hook: validators apply program-level state transitions deterministically | Plumb through `consensus/pos.go` |
| GPL-F2 | 🟡 Block validation: re-execute all txs and compare resulting state-root | Already partially done in `ExecuteTransaction` |
| GPL-F3 | 🟢 Slashing program for double-sign / equivocation | Already enabled in config (`SlashingEnabled: true`); needs implementation |

### GPL-G · Events, Logging, RPC

| # | Item | Notes |
|---|------|-------|
| GPL-G1 | 🟡 Indexed event/log emission per state change (program_id, topics[], data) | Push to `Blockchain.BlockChan` consumers (indexer + WS hub) |
| GPL-G2 | ✅ WebSocket hub wired into RPC server | `wsHub` field added; `BroadcastNewBlock/Tx/Pending` ready |
| GPL-G3 | 🟡 New JSON-RPC namespaces: `gpl_token_*`, `gpl_account_*`, `gpl_program_*`, `gpl_stake_*` | Add to `internal/rpc/server.go` route map |
| GPL-G4 | 🟢 REST mirror at `/v1/...` for explorer/wallet that prefer REST | Optional façade over JSON-RPC |
| GPL-G5 | 🟢 OpenAPI / Swagger spec auto-generated for explorer integration | |

### GPL-H · Networking & Distribution

| # | Item | Notes |
|---|------|-------|
| GPL-H1 | ✅ P2P gossip, node discovery scaffolding | `internal/network/p2p.go` exists |
| GPL-H2 | 🟡 Secure transport: TLS over P2P + WireGuard option for cluster-private links | INF-12 |
| GPL-H3 | 🟡 Lite-node HTTPS RPC compatibility (`gyds_*` + `eth_*` namespaces) | `cmd/litenode/` already separate; ensure HTTPS + auth header |
| GPL-H4 | 🟡 Each component (node, RPC, indexer, explorer, wallet backend) deployable to a separate host | Already split in `docker-compose.prod.yml`; document in deployment guide |

### GPL-I · Permissions, Governance, Tooling

| # | Item | Notes |
|---|------|-------|
| GPL-I1 | 🟡 Roles: `admin`, `founder`, `validator`, `developer`, `user` enforced both on-chain (program checks) and off-chain (Supabase RLS) | Mirror existing Supabase `user_roles` |
| GPL-I2 | 🟡 Token mint authority lives **on the Mint record**, not in code; transferable / revocable | Replaces hard-coded mint guards |
| GPL-I3 | 🟢 On-chain governance program (proposals + voting weighted by stake) | Phase 2 |
| GPL-I4 | 🟡 CLI: `gpl` binary at `cmd/gpl/` — mirrors Solana CLI ergonomics (`gpl token create`, `gpl account info`, `gpl program deploy`) | New |
| GPL-I5 | 🟢 Developer SDK (TypeScript) at `packages/gpl-sdk/` for wallet & explorer | Pair with GPL-G3 namespaces |

### GPL-J · Extensibility (plugin / module system)

| # | Item | Notes |
|---|------|-------|
| GPL-J1 | 🟢 `Program` interface in Go — `ID() [20]byte`, `Execute(ctx, ix Instruction) error`, `State() StateView` | Drop-in for new modules |
| GPL-J2 | 🟢 NFT program (ERC-721-like): non-fungible variant of GPL-A2 | Phase 2 |
| GPL-J3 | 🟢 DEX program (constant-product AMM) reusing `pools` schema | Phase 2 |
| GPL-J4 | 🟢 Lending program (collateralized borrow) | Phase 2 |

### GPL-K · Migration / Compatibility Notes (do **not** break existing functionality)

- The current `internal/token/factory.go` stays in place; GPL-A2 wraps it behind a `Program` façade so the existing factory API continues to work.
- The current `consensus/pos.go` stays in place; GPL-A4 calls into it instead of replacing it.
- The current `Transaction` struct keeps all existing fields; GPL-E1/E2 only **add** fields and `TxType` values.
- The current frontend talks only to Supabase + RPC; once GPL-G3 namespaces ship, the frontend can opt-in via env flag without touching existing pages.

### GPL Build/Test commands (for next session)

```bash
# Compile everything
cd public/blockchain-go && GOFLAGS="-mod=mod" go build ./...

# Vet & race-check
cd public/blockchain-go && GOFLAGS="-mod=mod" go vet ./... && go test -race ./...

# Validate every shell installer
for f in public/scripts/*.sh; do bash -n "$f" && echo "OK: $f"; done

# Run frontend dev server
npm run dev
```

### Current build/test status — 2026-04-27

- ✅ `go build ./...` — clean (with `-buildvcs=false` in sandbox)
- ✅ `go vet ./...` — clean
- ✅ `fullnode --help` — runs and prints all flags
- ✅ `bash -n` — all 12 installer + systemd shell scripts pass syntax
- ✅ Vite dev server — running on port 5000
- ✅ Genesis verification (SEC-2) — fullnode aborts on hash mismatch
- ✅ LevelDB snapshot export/import (GPL-C3) — manifest + per-account rows under `state-snapshot:<height>:`
- 🔲 `go test ./...` — no tests written yet (add as part of GPL-A modules)
