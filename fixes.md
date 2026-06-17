# ChainCore — Fixes & Feature Tracker

> Last updated: 2026-06-17
> Tracks all completed fixes and known outstanding issues.

---

## ✅ Completed Fixes

### Block Time (120s everywhere)
- **Files:** `src/pages/Landing.tsx`, `src/pages/PressKit.tsx`, `server/routes.ts`
- **Change:** All hardcoded "~4s" / "~5s" → "~120s"; `/v1/network/stats` returns `block_time: 120, block_time_ms: 120000`
- **Node fixes:** fullnode config.go = 120s ✅; genesis config.go = 120s ✅; boostnode = 1s (intentional boost mode)

### Wallet-Based Password Reset
- **Files:** `server/auth.ts`, `src/pages/Auth.tsx`
- **Route:** `POST /api/auth/reset-password/wallet`
- **Flow:** User enters username → signs a nonce with MetaMask → server verifies signature → sets new password

### Node Registration → Approve Nodes Tab
- **Files:** `src/components/admin/NodeInstaller.tsx`, `server/routes.ts`
- **Change:** NodeInstaller has "Register Node Installation" card; auto-approves for admin/founder, creates as pending for users

### AI Firewall — Full Enforcement
- **Files:** `server/security.ts`, `server/index.ts`, `server/routes.ts`
- **Features:** In-memory + DB-persisted IP blocklist, lockdown mode, adaptive rate limiting (1–100 req/min), payload inspection (SQLi, XSS, SSRF, shell injection, path traversal, RPC flood), auto-block at sensitivity ≥ 6

### AI Firewall UI — Blocked IPs Tab
- **Files:** `src/components/admin/AIFirewallTab.tsx`
- **Fixes:** "Clear Bans" calls real `DELETE /api/security/blocked-ips`; lockdown desync on reload fixed (derived from `threat_response` field)
- **Added:** 🚫 Blocked tab — live IP list, manual block form, unblock per-IP, real-time stats

### Node camelCase Mapping Fix
- **Files:** `src/components/admin/` (nodes tab), `server/routes.ts`
- **Change:** Drizzle returns camelCase; NodeInstallation interface now uses `nodeType`, `isApproved`, `isSynced`, `wireguardPublicKey`, `createdAt`

### Test Nodes — Hostname Fix
- **Files:** Admin → Test Nodes tab (`TestNodeManager`)
- **Change:** All nodes bind to `0.0.0.0`; UI uses `window.location.hostname` not `localhost`; firewall commands shown for remote hosts; copy buttons on all URLs

### Install Script Repo URLs Fixed
- `install-fullnode.sh` — REPO_URL was `validatornode.git` → fixed to `fullnode.git`
- `install-genesis.sh` — REPO_URL was `fullnode.git` → fixed to `genesis.git`; BINARY was `gyds-fullnode` → fixed to `gyds-genesis`

### TOTP — otplib Replacement
- **Files:** `server/totp.ts` (new)
- **Reason:** otplib v12 dropped the `authenticator` named export — caused runtime crash
- **Fix:** Zero-dep RFC 6238 TOTP using only Node.js built-in `crypto` module

### SDK Section — Coming Soon Removed
- **Files:** `src/pages/Developer.tsx` (SDKs tab)
- **Change:** JS/TypeScript and Python SDKs changed from "Coming Soon" → "Available" (green badge)
- **Added:** Full code examples for JS/TS (GYDSClient init, balance, send tx, WebSocket) and Python (GYDSClient init, async); Go snippet (In Progress); Rust snippet (Planned); SDK feature coverage matrix table

### Insurance — All Plans Available
- **Files:** `src/pages/Insurance.tsx`
- **Change:** All 4 plan tiers (Smart Contract, Stablecoin De-Peg, Validator Slashing, Uptime SLA) set to `status: 'available'`

### LP Farming — Live on Testnet
- **Files:** `src/components/defi/LPFarmingDashboard.tsx`
- **Change:** Badge changed from "Mainnet: Coming Soon" → "Live on Testnet" (green)

### Profile — Telegram Alerts
- **Files:** `src/pages/Profile.tsx`
- **Change:** SMS notification option replaced with Telegram alerts (@GYDSChainBot) — no carrier dependency

### NodeRepoSync — Admin GitHub Tab
- **Files:** `src/components/admin/NodeRepoSync.tsx` (new), `src/pages/Admin.tsx`
- **Change:** New component checks each of 4 node repos via GitHub API; validates module name, binary name, block time vs expected values; wired into Admin → GitHub tab alongside GitSyncPanel

### Node Fixes Prepared
- **Directory:** `node-fixes/`
- **rpcnode:** go.mod module = `github.com/gydschain/rpcnode`; main.go imports + NewServer 5-arg signature fixed
- **boostnode:** go.mod module = `github.com/gydschain/boostnode`; config NodeMode=boost, BlockTime=1s
- **fullnode:** main.go version string `gyds-litenode` → `gyds-fullnode`
- **genesis:** Full implementation (go.mod, main.go with export-genesis cmd, config, Dockerfile, docker-compose, setup.sh, README)

### Stablecoin Creation System
- **Tables:** `user_stablecoins`
- **Routes:** GET/POST/PATCH/DELETE `/api/stablecoins`
- **Rules enforced server-side:** creation fee, max per user, symbol uniqueness, peg types, collateral models
- **UI:** `StablecoinFactory.tsx` — 5-step wizard in DeFi → Stablecoins tab

### WireGuard Peer Manager
- **Files:** `src/components/admin/WireGuardPeerManager.tsx`
- **Features:** Reads approved nodes, assigns 10.8.0.x tunnel IPs (server = 10.8.0.1), generates full wg0.conf + per-peer client configs, download/copy buttons

### Cron Job System
- **Files:** `server/routes.ts` (registry), `src/components/admin/CronJobManager.tsx`
- **Features:** 7 in-memory jobs; GET/PATCH/POST `/api/admin/cron-jobs/:id/run`; no external cron package

### Admin Monitoring Tab
- **Files:** `src/components/admin/ValidatorExplorerMonitor.tsx`
- **Route:** `GET /api/admin/monitoring` (requireAdmin)
- **Returns:** validators, nodes, RPC health, DB status, uptime, memory

### Email Verification
- **Tables:** `email_verification_tokens` (CREATE IF NOT EXISTS in auth.ts)
- **Routes:** `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`
- **Dev mode:** token logged to console (no SMTP required)

### DB Pruner Cron
- **Files:** `server/index.ts` (`runDbPruner`)
- **Prunes:** network_snapshots, api_usage_logs, webhook_deliveries, xp_events, expired email tokens
- **Schedule:** on startup + every 24h

### CSP + Security Headers
- **Files:** `server/index.ts` (middleware, before setupAuth)
- **Headers:** Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Permissions-Policy

### PWA + Web Push
- **Files:** `public/manifest.json`, `public/sw.js`, `server/webpush.ts`
- **Routes:** `/api/push/vapid-key`, `/api/push/subscribe` (POST/DELETE), `/api/push/test`
- **Table:** `push_subscriptions` (CREATE IF NOT EXISTS in webpush.ts)

### Biometric Unlock
- **Files:** `src/lib/biometric.ts`
- **Features:** WebAuthn (navigator.credentials); `isBiometricAvailable`, `registerBiometric`, `authenticateBiometric`, `disableBiometric`, `isBiometricEnabled`
- **Wired:** Profile security tab + Mobile MoreTab

### Ledger WebHID
- **Files:** `src/components/wallet/LedgerConnect.tsx`
- **Features:** navigator.hid (WebHID); compact prop for header use; reads 5 accounts via BIP44 APDU
- **Note:** Chrome/Edge only; wired to Wallet.tsx header

---

## 🔧 Known Issues / In Progress

### Node Repos — Fixes Ready But Not Pushed
- `node-fixes/rpcnode/`, `node-fixes/boostnode/`, `node-fixes/fullnode/`, `node-fixes/genesis/` all have corrected source
- **Action required:** Push each directory's contents to the corresponding GitHub repo
- **Instructions:** See `node-fixes/README.md`

### Notification Bell — Demo Data
- `NotificationBell.tsx` reads from demo data, not live `user_notifications` table
- **Fix needed:** Wire to GET `/api/notifications` + mark-read endpoint; server-side push on tx confirm / governance / price alert

### validatornode — Empty Repo
- `github.com/hc172808/validatornode` has no go.mod, no main.go, cannot compile
- **Fix needed:** Full Go implementation (see todo.md validatornode section)

### litenode — Architectural Issue
- Litenode runs a full PoS consensus engine and produces blocks — it should only sync headers
- **Fix needed:** Header-only sync mode, remove block production, add SPV proofs

### GydsSwap — Frontend Simulated
- SwapInterface, PoolsList, StakeInterface are UI-only simulations
- **Fix needed:** Wire to deployed GydsSwapRouter/Factory/Farm contract addresses

### rpcnode — Missing RPC Methods
- `eth_getLogs`, `eth_getFilterChanges`, `debug_traceTransaction` not implemented (returns empty/error)
- **Fix needed:** Implement against stored receipts in rpcnode repo

### Telegram Alerts
- Profile shows @GYDSChainBot but no Telegram Bot API integration exists yet
- **Fix needed:** Server-side Telegram Bot API call when alert conditions are met

### Oracle — Decentralized Node
- Oracle admin panel exists but actual decentralized oracle Go binary not built
- **Fix needed:** Go binary extension + on-chain oracle contract integration

---

## 🆕 Stablecoin Creation — Rules Reference

### Peg Types
| Type | Target |
|------|--------|
| `usd` | 1.00 USD |
| `eur` | ~1.08 USD |
| `gbp` | ~1.27 USD |
| `btc` | ~65,000 USD |
| `eth` | ~3,500 USD |
| `gold` | ~2,000/oz |
| `custom` | User-defined |
| `basket` | Weighted mix |

### Collateral Models
| Model | Min Ratio | Liquidation |
|-------|-----------|-------------|
| `over_collateralized` | 150% | ≥ 110% |
| `algorithmic` | 100% | ≥ 100% |
| `hybrid` | 120% | ≥ 110% |
| `fiat_backed` | 100% | ≥ 100% |

### Lifecycle: `draft` → `pending_review` → `active` → `paused` / `deprecated`

---

## 🛡️ WireGuard Peer Manager

- Admin → Nodes tab → WireGuard Peers section
- Assigns /30 subnet IPs sequentially (10.8.0.1 = server, peers start at 10.8.0.2)
- Download: per-peer `wg0.conf` and full server config
- Peer count shown on tab badge

---

## 🔐 AI Firewall Features

- In-memory + DB-persisted IP blocklist
- Lockdown mode (503 to all non-auth routes)
- Adaptive rate limiting (1–100 req/min, configurable sensitivity 1–10)
- Payload inspection: SQL injection, XSS, SSRF, shell injection, path traversal, RPC flood
- Auto-block on attack detection at sensitivity ≥ 6
- Blocked IPs tab: live list, manual block form, unblock per-IP, stats counters
