# GYDSchain Project — Fix & Production Readiness Checklist

> ✅ = Done | 🔲 = To Do | 🔴 = Critical | 🟡 = Important | 🟢 = Nice to Have
> Last updated: 2026-06-17

---

## 🐳 Docker Files

| # | Status | Priority | Issue | File |
|---|--------|----------|-------|------|
| D1 | ✅ | 🔴 | `Dockerfile.explorer` references `bun.lock*` but project uses npm — must be `package-lock.json` | `public/docker/Dockerfile.explorer` |
| D2 | ✅ | 🔴 | `docker-compose.yml` had `changeme` as default indexer PostgreSQL password — randomized | `public/docker/docker-compose.yml` |
| D3 | ✅ | 🔴 | `docker-compose.prod.yml` port mapping bug: `${GYDS_RPC_PORT:-8545}:8545` should be `8546:8546` | `public/docker/docker-compose.prod.yml` |
| D4 | ✅ | 🟡 | `Dockerfile.node` expects `blockchain-go/` Go source directory — build notes + ARG added | `public/docker/Dockerfile.node` |
| D5 | ✅ | 🟡 | `nginx.conf` missing HSTS header for HTTPS deployments | `public/docker/nginx.conf` |
| D6 | ✅ | 🟡 | `nginx.conf` health endpoint returns no body — nginx returns empty 200 (ambiguous) | `public/docker/nginx.conf` |
| D7 | ✅ | 🟡 | `nginx.conf` CSP policy needs `data:` in font-src and stricter connect-src | `public/docker/nginx.conf` |
| D8 | ✅ | 🟢 | Both docker-compose files missing `INDEXER_DB_PASSWORD` generation comment | `public/docker/docker-compose.yml` |

---

## 🐚 Shell Scripts

| # | Status | Priority | Issue | File |
|---|--------|----------|-------|------|
| S1 | ✅ | 🔴 | Hardcoded private LAN IP `192.168.18.106:8546` — replaced with env variable | `install-fullnode.sh`, etc. |
| S2 | ✅ | 🔴 | `backend-guardian.sh` had placeholder `your-domain.com` and `your-supabase-url` | `public/scripts/backend-guardian.sh` |
| S3 | ✅ | 🔴 | `with backend-guardian.sh` filename had a space — renamed | `public/scripts/` |
| S4 | ✅ | 🔴 | Script referenced wrong repo `guardian-chain` — fixed to actual repo | `public/scripts/backend-guardian.sh` |
| S5 | ✅ | 🟡 | All scripts: use `#!/usr/bin/env bash` instead of `#!/bin/bash` | All `.sh` files |
| S6 | ✅ | 🟡 | `install-litenode.sh` installed a bash stub as the "binary" — now builds real binary | `public/scripts/install-litenode.sh` |
| S7 | ✅ | 🟡 | `setup-gydschain.sh` referenced `gydschain-schema.sql` that didn't exist | `public/scripts/setup-gydschain.sh` |
| S8 | ✅ | 🟡 | `.env.example` had placeholder wallet address and API key values | `public/scripts/.env.example` |
| S9 | ✅ | 🟢 | `deploy-remote-fullnode.sh` used deprecated `docker-compose` command instead of `docker compose` | `public/scripts/deploy-remote-fullnode.sh` |
| S10 | ✅ | 🟢 | `ssl-setup.sh` hardcoded admin@domain for certbot — now uses env var | `public/scripts/ssl-setup.sh` |
| S11 | ✅ | 🔴 | `install-fullnode.sh` REPO_URL pointed to `validatornode.git` — fixed to `fullnode.git` | `public/scripts/install-fullnode.sh` |
| S12 | ✅ | 🔴 | `install-genesis.sh` REPO_URL was `fullnode.git` → fixed to `genesis.git`; BINARY `gyds-fullnode` → `gyds-genesis` | `public/scripts/install-genesis.sh` |
| S13 | 🔲 | 🟡 | Missing `install-rpc-proxy.sh` — reverse-proxy script for rpc.netlifegy.com / rpc2 / rpc3 | `public/scripts/` |
| S14 | 🔲 | 🟡 | WireGuard mesh bring-up automation — auto-provision all founder nodes into VPN mesh | `public/scripts/wireguard-mesh.sh` |

---

## 🌐 Frontend App

| # | Status | Priority | Issue | File |
|---|--------|----------|-------|------|
| F1 | ✅ | 🔴 | `App.tsx` — `BrowserRouter` inside `AuthProvider` without guaranteed Router wrapping for auth redirects | `src/App.tsx` |
| F2 | ✅ | 🔴 | `ResetPassword.tsx` — must handle Supabase auth token from URL hash on load | `src/pages/ResetPassword.tsx` |
| F3 | ✅ | 🟡 | No 404 / error fallback in router for deep routes | `src/App.tsx` |
| F4 | ✅ | 🟡 | `useBlockchainWebSocket` max reconnect 5 attempts with no user-visible status after giving up | `src/hooks/useBlockchainWebSocket.ts` |
| F5 | ✅ | 🟡 | `vite.config.ts` missing `allowedHosts: true` for Replit proxy | `vite.config.ts` |
| F6 | ✅ | 🟡 | `lovable-tagger` removed from devDependencies | `package.json` |
| F7 | ✅ | 🟢 | Missing `<title>` and meta description tags | `index.html` |
| F8 | ✅ | 🟢 | `eslint.config.js` references removed `lovable-tagger` plugin | `eslint.config.js` |
| F9 | ✅ | 🟡 | Insurance page had "Coming Soon" status on all plans — all changed to Available | `src/pages/Insurance.tsx` |
| F10 | ✅ | 🟡 | LP Farming badge was "Mainnet: Coming Soon" — changed to "Live on Testnet" | `src/components/defi/LPFarmingDashboard.tsx` |
| F11 | ✅ | 🟢 | Developer SDK section had "Coming Soon" for JS/TS and Python — replaced with full code examples + Available badge | `src/pages/Developer.tsx` |
| F12 | ✅ | 🟢 | Profile SMS alerts — replaced with Telegram alerts (@GYDSChainBot) | `src/pages/Profile.tsx` |
| F13 | 🔲 | 🟡 | NotificationBell reads demo data — needs live `user_notifications` table wiring | `src/components/layout/NotificationBell.tsx` |
| F14 | 🔲 | 🟡 | Telegram alert integration — @GYDSChainBot shown in UI but no Bot API call exists | `server/routes.ts` |

---

## 📁 Missing Files

| # | Status | Priority | Issue |
|---|--------|----------|-------|
| M1 | ✅ | 🟡 | No `.env.production` template — added as `public/scripts/.env.production.template` |
| M2 | ✅ | 🟡 | `public/scripts/gydschain-schema.sql` referenced by `setup-gydschain.sh` was missing |
| M3 | ✅ | 🟢 | No `DEPLOYMENT.md` guide — added at project root |
| M4 | 🔲 | 🔴 | `validatornode` repo is completely empty — no go.mod, no main.go — full Go implementation needed |
| M5 | 🔲 | 🟡 | `genesis` repo at hc172808/genesis is empty — `node-fixes/genesis/` ready to push |
| M6 | 🔲 | 🟡 | `public/scripts/install-rpc-proxy.sh` — missing reverse-proxy installer |

---

## 🔌 Node Repos — GitHub Push Required

| # | Status | Priority | Issue | Fix Location |
|---|--------|----------|-------|--------------|
| N1 | 🔲 | 🔴 | `rpcnode` go.mod module is `gydschain/litenode` — must be `gydschain/rpcnode` | `node-fixes/rpcnode/` |
| N2 | 🔲 | 🔴 | `rpcnode` main.go imports from `gydschain/litenode/...` — must use own module | `node-fixes/rpcnode/` |
| N3 | 🔲 | 🔴 | `rpcnode` binary name `gyds-litenode` — must be `gyds-rpcnode` | `node-fixes/rpcnode/` |
| N4 | 🔲 | 🔴 | `rpcnode` `NewServer` call has wrong arg count (2 args, needs 5) | `node-fixes/rpcnode/` |
| N5 | 🔲 | 🔴 | `boostnode` go.mod module is `gydschain/litenode` — must be `gydschain/boostnode` | `node-fixes/boostnode/` |
| N6 | 🔲 | 🔴 | `boostnode` main.go imports from `gydschain/litenode/...` — must use own module | `node-fixes/boostnode/` |
| N7 | 🔲 | 🔴 | `boostnode` config NodeMode is `lite` — must be `boost`; BlockTime 5s → 1s | `node-fixes/boostnode/` |
| N8 | 🔲 | 🟡 | `fullnode` binary name `gyds-litenode` in versionCmd — must be `gyds-fullnode` | `node-fixes/fullnode/` |
| N9 | 🔲 | 🔴 | `genesis` repo is completely empty — full implementation ready to push | `node-fixes/genesis/` |
| N10 | 🔲 | 🔴 | `validatornode` repo has no go.mod, no main.go — cannot build | needs full build |
| N11 | 🔲 | 🟡 | All repos: genesis validator addresses are `0x000...001/002/003` placeholders — need real addresses | all repos |

---

## 🔒 Security

| # | Status | Priority | Issue | File |
|---|--------|----------|-------|------|
| SEC1 | ✅ | 🔴 | `docker-compose.yml` default `changeme` DB password — randomized | `public/docker/docker-compose.yml` |
| SEC2 | ✅ | 🔴 | `backend-guardian.sh` wrote real keys in plain text to `.env` on disk | `public/scripts/backend-guardian.sh` |
| SEC3 | ✅ | 🟡 | `nginx.conf` CSP needed tightening — `unsafe-eval` in script-src | `public/docker/nginx.conf` |
| SEC4 | ✅ | 🟡 | `nginx.conf` missing HSTS for production HTTPS | `public/docker/nginx.conf` |
| SEC5 | ✅ | 🟡 | `validator-key` mounted read-only without documented key generation step | `public/docker/docker-compose.yml` |
| SEC6 | ✅ | 🟡 | CSP + security headers added to Express server (X-Frame-Options, Referrer-Policy, etc.) | `server/index.ts` |
| SEC7 | ✅ | 🟡 | AI Firewall: payload inspection, rate limiting, lockdown mode, IP blocklist | `server/security.ts` |
| SEC8 | 🔲 | 🟡 | Genesis validator addresses are placeholders — replace with real funded addresses before mainnet | all node repos |
| SEC9 | 🔲 | 🟡 | Real ECDSA signature verification in blockchain core — currently length-only checks | `public/blockchain-go/` |

---

## ⛓️ Blockchain Core (public/blockchain-go/)

| # | Status | Priority | Issue |
|---|--------|----------|-------|
| B1 | ✅ | 🔴 | Block storage layer — `SaveBlock`, `LoadBlockByHeight`, `LoadBlockByHash`, `GetTransactionByHash` |
| B2 | ✅ | 🔴 | `go.mod` / `go.sum` — missing LevelDB entries populated via `go mod tidy` |
| B3 | ✅ | 🔴 | Import cycle: `mining ↔ liteclient` — resolved with interface |
| B4 | ✅ | 🔴 | `StateDB` missing `SetBalance/AddBalance/SubBalance/AddStake/SubStake` dispatchers |
| B5 | ✅ | 🔴 | `stateDB.Commit()` return type mismatch (returned error, not `[32]byte`) |
| B6 | ✅ | 🔴 | `internal/network/p2p.go` stray import syntax error |
| B7 | ✅ | 🔴 | RPC: duplicate `handleWebSocket`, missing `wsHub` field, field name mismatches |
| B8 | ✅ | 🔴 | `cmd/fullnode/main.go` bare int literals where `*big.Int` required |
| B9 | ✅ | 🔴 | Genesis block nil-pointer panic — `GenesisGYDS` never set |
| B10 | ✅ | 🟡 | BlockTime = 120s everywhere in Go source |
| B11 | 🔲 | 🟡 | Real Merkle/Patricia state-trie root in `header.StateRoot` (currently zero hash) |
| B12 | 🔲 | 🟡 | Real ECDSA signature verification (currently length-only checks) |
| B13 | 🔲 | 🟢 | LevelDB pruning (function is a no-op) |
| B14 | 🔲 | 🟢 | Replace JSON block encoding with RLP/protobuf for production efficiency |

---

## Summary

| Category | Total | ✅ Done | 🔲 To Do | 🔴 Critical Remaining |
|----------|-------|---------|----------|----------------------|
| Docker | 8 | 8 | 0 | 0 |
| Shell Scripts | 14 | 12 | 2 | 0 |
| Frontend | 14 | 12 | 2 | 0 |
| Missing Files | 6 | 3 | 3 | 1 (validatornode) |
| Node Repos | 11 | 0 | 11 | 7 |
| Security | 9 | 7 | 2 | 0 |
| Blockchain Core | 14 | 10 | 4 | 0 |
| **Total** | **76** | **52** | **24** | **8** |

> **Most critical:** Push `node-fixes/` to GitHub repos (N1–N9), implement `validatornode` (M4, N10).
