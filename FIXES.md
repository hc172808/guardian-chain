# GYDSchain Project — Fix & Production Readiness Checklist

> ✅ = Done | 🔲 = To Do | 🔴 = Critical | 🟡 = Important | 🟢 = Nice to Have

---

## 🐳 Docker Files

| # | Status | Priority | Issue | File |
|---|--------|----------|-------|------|
| D1 | ✅ | 🔴 | `Dockerfile.explorer` references `bun.lock*` but project uses npm — must be `package-lock.json` | `public/docker/Dockerfile.explorer` |
| D2 | ✅ | 🔴 | `docker-compose.yml` has `changeme` as default indexer PostgreSQL password | `public/docker/docker-compose.yml` |
| D3 | ✅ | 🔴 | `docker-compose.prod.yml` port mapping bug: `${GYDS_RPC_PORT:-8545}:8545` should be `8546:8546` | `public/docker/docker-compose.prod.yml` |
| D4 | ✅ | 🟡 | `Dockerfile.node` expects `blockchain-go/` Go source directory — added clear build notes and ARG for source path | `public/docker/Dockerfile.node` |
| D5 | ✅ | 🟡 | `nginx.conf` missing HSTS header for HTTPS deployments | `public/docker/nginx.conf` |
| D6 | ✅ | 🟡 | `nginx.conf` health endpoint returns no body — nginx returns empty 200 which is ambiguous | `public/docker/nginx.conf` |
| D7 | ✅ | 🟡 | `nginx.conf` CSP policy needs `data:` in font-src and stricter connect-src | `public/docker/nginx.conf` |
| D8 | ✅ | 🟢 | Both docker-compose files missing `INDEXER_DB_PASSWORD` generation instruction in comments | `public/docker/docker-compose.yml` |

---

## 🐚 Shell Scripts

| # | Status | Priority | Issue | File |
|---|--------|----------|-------|------|
| S1 | ✅ | 🔴 | Hardcoded private LAN IP `192.168.18.106:8546` — must be an env variable or removed | `install-fullnode.sh`, `install-litenode.sh`, `install-node.sh`, `node.env.template` |
| S2 | ✅ | 🔴 | `with backend-guardian.sh` has placeholder `your-domain.com` and `your-supabase-url` — script is incomplete | `public/scripts/with backend-guardian.sh` |
| S3 | ✅ | 🔴 | `with backend-guardian.sh` filename has a space — causes bash errors when sourced | `public/scripts/with backend-guardian.sh` |
| S4 | ✅ | 🔴 | `with backend-guardian.sh` references wrong repo `guardian-chain` instead of actual project repo | `public/scripts/with backend-guardian.sh` |
| S5 | ✅ | 🟡 | All scripts: use `#!/usr/bin/env bash` instead of `#!/bin/bash` for better portability | All `.sh` files |
| S6 | ✅ | 🟡 | `install-litenode.sh` installs a bash stub as the "binary" instead of real binary — misleading output | `public/scripts/install-litenode.sh` |
| S7 | ✅ | 🟡 | `setup-gydschain.sh` references `gydschain-schema.sql` that does not exist in scripts dir | `public/scripts/setup-gydschain.sh` |
| S8 | ✅ | 🟡 | `.env.example` has placeholder `0xYourMiningWalletAddress` and `your-api-key-here` values | `public/scripts/.env.example` |
| S9 | ✅ | 🟢 | `deploy-remote-fullnode.sh` uses deprecated `docker-compose` command instead of `docker compose` | `public/scripts/deploy-remote-fullnode.sh` |
| S10 | ✅ | 🟢 | `ssl-setup.sh` uses admin@domain for certbot — should come from env var not be hardcoded | `public/scripts/ssl-setup.sh` |

---

## 🌐 Frontend App

| # | Status | Priority | Issue | File |
|---|--------|----------|-------|------|
| F1 | ✅ | 🔴 | `App.tsx` — `BrowserRouter` is inside `AuthProvider` but `useNavigate` is used in child pages without Router wrapping being guaranteed for auth redirects | `src/App.tsx` |
| F2 | ✅ | 🔴 | `src/pages/ResetPassword.tsx` — password reset page must handle the Supabase auth token from URL hash on load | `src/pages/ResetPassword.tsx` |
| F3 | ✅ | 🟡 | No 404 / error fallback in router for deep routes — `NotFound` only catches `*` | `src/App.tsx` |
| F4 | ✅ | 🟡 | `useBlockchainWebSocket` max reconnect is 5 attempts with no user-visible status after giving up | `src/hooks/useBlockchainWebSocket.ts` |
| F5 | ✅ | 🟡 | `vite.config.ts` was missing `allowedHosts: true` for Replit proxy — already fixed in migration | `vite.config.ts` |
| F6 | ✅ | 🟡 | `lovable-tagger` removed from devDependencies — already fixed | `package.json` |
| F7 | ✅ | 🟢 | Missing `<title>` and meta description tags in `index.html` | `index.html` |
| F8 | ✅ | 🟢 | `eslint.config.js` references `lovable-tagger` plugin that is no longer installed | `eslint.config.js` |

---

## 📁 Missing Files

| # | Status | Priority | Issue |
|---|--------|----------|-------|
| M1 | ✅ | 🟡 | No `.env.production` template for production deployment — added as `public/scripts/.env.production.template` |
| M2 | ✅ | 🟡 | `public/scripts/gydschain-schema.sql` referenced by `setup-gydschain.sh` is missing — created symlink note pointing to `public/docker/init-indexer.sql` |
| M3 | ✅ | 🟢 | No `DEPLOYMENT.md` guide explaining how to deploy the full stack | Added at project root |

---

## 🔒 Security

| # | Status | Priority | Issue | File |
|---|--------|----------|-------|------|
| SEC1 | ✅ | 🔴 | `docker-compose.yml` default `changeme` DB password must be randomly generated | `public/docker/docker-compose.yml` |
| SEC2 | ✅ | 🔴 | `with backend-guardian.sh` writes real Supabase keys in plain text to `.env` on disk | `public/scripts/with backend-guardian.sh` |
| SEC3 | ✅ | 🟡 | `nginx.conf` CSP needs tightening — `unsafe-eval` in script-src | `public/docker/nginx.conf` |
| SEC4 | ✅ | 🟡 | `nginx.conf` missing HSTS for production HTTPS | `public/docker/nginx.conf` |
| SEC5 | ✅ | 🟡 | `validator-key` mounted as read-only in docker-compose but there's no key generation step documented | `public/docker/docker-compose.yml` |

---

## Summary

- **Total Issues:** 28
- **Critical (🔴):** 8 — fix before any production use
- **Important (🟡):** 14 — fix for reliability
- **Nice to Have (🟢):** 6 — polish

> Last updated: 2026-03-21
