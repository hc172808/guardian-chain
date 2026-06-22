# ChainCore — GYDS Dashboard · Feature Todo

_Last updated: June 22, 2026_

---

## 👋 Contributor Guide

This section is for anyone helping build ChainCore. Read this first before touching any code.

### Tech Stack
| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Vite + React 18 + TypeScript | Port 5000 in dev |
| Backend | Express.js + Passport.js | Port 5001 in dev |
| Database | PostgreSQL via Drizzle ORM | `DATABASE_URL` env var (Replit managed) |
| Auth | Username/password + Web3 signature | Sessions via connect-pg-simple |
| Styling | Tailwind CSS + shadcn/ui | Dark theme only |
| State | TanStack React Query + React Context | AuthContext is the main context |
| Blockchain | Chain ID 13370, GYDS Network | RPC: rpc.netlifegy.com |

### Running the project
```bash
npm run dev          # starts both Express (5001) + Vite (5000) concurrently
npm run build        # build frontend only
npm run typecheck:server  # check server types (pre-existing Express 5 errors exist; don't block deploy)
```

### Database rules — READ BEFORE ANY SCHEMA CHANGE
- **Source of truth:** `shared/schema.ts` (Drizzle ORM schema)
- **DO NOT use `npm run db:push` alone** — it has a TTY issue in this env and may say "nothing to migrate" even when the DB is out of sync
- **Correct way to add tables/columns:**
  ```bash
  # 1. Add to shared/schema.ts
  # 2. Generate migration SQL
  npm run db:generate
  # 3. Apply directly via psql
  psql "$DATABASE_URL" < drizzle/migrations/latest.sql
  # OR use raw ALTER TABLE / CREATE TABLE via psql for simple changes
  ```
- Always verify with: `psql "$DATABASE_URL" -c "\d tablename"` before assuming it worked
- Drizzle returns **camelCase** column names — use camelCase in TypeScript interfaces
- **Full schema snapshot** (all 75+ tables, safe to re-run): `psql "$DATABASE_URL" < migrations/0002_full_schema_sync.sql`

### Key files
| File | Purpose |
|------|---------|
| `shared/schema.ts` | All DB table definitions (source of truth) |
| `server/routes.ts` | All Express API routes |
| `server/auth.ts` | Auth logic (register, login, TOTP, sessions) |
| `server/storage.ts` | DB query functions (used by routes) |
| `server/db.ts` | Drizzle client + pgPool setup |
| `src/App.tsx` | All frontend routes |
| `src/components/layout/Sidebar.tsx` | Sidebar navigation |
| `src/contexts/AuthContext.tsx` | Auth state (user, signIn, signOut) |
| `src/integrations/supabase/client.ts` | **Supabase shim** — routes ALL Supabase calls to Express API. No real Supabase needed. |

### Import rules (critical — breaks build if wrong)
```typescript
// ✅ CORRECT layout import (lowercase folder, named export):
import { Layout } from '@/components/layout/Layout';

// ❌ WRONG — causes Vite 500:
import Layout from '@/components/Layout';
```

### Adding a new page
1. Create `src/pages/YourPage.tsx` — use `<Layout>` as wrapper
2. Add import + `<Route path="/your-page" element={<YourPage />} />` in `src/App.tsx`
3. Add nav item to the correct section array in `src/components/layout/Sidebar.tsx`
4. Add to the PAGES array in `src/pages/Preview.tsx` for the App Preview
5. Add backend routes to `server/routes.ts` if the page has API calls
6. Mark done in this todo.md

### Adding a new API endpoint
```typescript
// server/routes.ts — follow this pattern:
router.get('/api/your-endpoint', requireAuth, async (req, res) => {
  try {
    const data = await storage.getYourData(req.user!.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});
```
- Use `requireAuth` for user-protected routes
- Use `requireAdmin` for admin-only routes
- Always use `try/catch` and return proper error shapes

### Login as founder (first boot)
```
Username: netlifegy
Password: GYDSchain2026!
```
Change this after first login! Founder role has full admin access.

### Viewing all pages
Go to **`/preview`** — the App Preview page shows all 36 pages with descriptions, routes, and live Preview/Open buttons. Also has a mobile phone mockup and wallet app info.

> **Remember:** whenever you add a new page, add it to the `PAGES` array in `src/pages/Preview.tsx` too.

### Git & pushing code
See `mobile-wallet/git-push-guide.md` for full instructions. Quick version:
```bash
# Push ChainCore dashboard (first time):
git remote add origin https://github.com/YOUR-USERNAME/chaincore-dashboard.git
git add -A && git commit -m "your message" && git push -u origin main

# Push both ChainCore + wallet app:
bash push-all.sh "your message"
```

### Mobile wallet app
Separate repo: https://github.com/hc172808/your-digital-wallet
Already configured for GYDS chain 13370. See `mobile-wallet/SETUP.md` for build instructions (Android + iOS).

---

## ✅ Completed Features

### Core Platform
- [x] Vite + React + TypeScript SPA (port 5000)
- [x] Express.js backend (port 5001) with Passport.js session auth
- [x] Replit PostgreSQL via Drizzle ORM
- [x] Custom username/password login
- [x] Web3 wallet signature login (EIP-6963 multi-wallet: MetaMask, Trust Wallet, Coinbase, Brave, OKX, Rabby, Phantom)
- [x] Founder account auto-seeded on first boot
- [x] Three user roles: user, admin, founder
- [x] Session management + active session panel (view/revoke devices)
- [x] 2FA / TOTP (RFC 6238 — zero-dep server implementation)
- [x] 2FA backup codes (8 codes, SHA-256 hashed, single-use)
- [x] Email verification (token-based; console-logged in dev, email in prod)
- [x] Password reset via email
- [x] WhatsApp-based OTP reset (alternative to email)
- [x] Biometric unlock (WebAuthn — Face ID / fingerprint)
- [x] Ledger hardware wallet support (WebHID, BIP44, 5 accounts)
- [x] Optional phone number on registration (stored in users + profiles)
- [x] Profile privacy toggle (private by default; user can make public)

### Dashboard & Explorer
- [x] Block explorer (search blocks, transactions, addresses)
- [x] Validator dashboard with delegation
- [x] Network config page (add to MetaMask / Trust Wallet etc.)
- [x] Real-time network stats widget in sidebar
- [x] Transaction history page
- [x] Watchlist (track tokens)
- [x] Price alerts
- [x] Webhooks (subscribe to chain events)
- [x] Node terminal (live terminal in browser)

### DeFi (13 tabs)
- [x] Token Swap
- [x] Liquidity Pools
- [x] Staking
- [x] Yield Farming
- [x] Order Book
- [x] Vaults
- [x] Cross-Chain Bridge (25 networks; EVM + non-EVM)
- [x] Stablecoin Factory (5-step wizard; CRUD; fees enforced server-side)
- [x] Perpetuals trading
- [x] Prediction markets
- [x] Launchpad (token launches)
- [x] Portfolio tracker
- [x] IL Calculator

### Wallet
- [x] Multi-wallet creation (encrypted seed AES-256-GCM)
- [x] Send / receive GYDS
- [x] QR code support
- [x] PIN rotation
- [x] Faucet (testnet GYDS drip)

### Governance
- [x] Proposal creation and voting
- [x] Voting power delegation
- [x] Governance notifications

### Token Factory
- [x] Deploy ERC-20 tokens on GYDS chain
- [x] Launchpad integration
- [x] Creator leaderboard (XP system)

### NFT Marketplace
- [x] Browse / list / buy NFTs
- [x] Basic marketplace UI

### Mining
- [x] Mining dashboard
- [x] Hashrate stats

### Community
- [x] Posts, comments, community votes
- [x] Community feed

### Identity
- [x] DID (Decentralised Identity) management page

### Multi-Sig
- [x] Multi-signature wallet creation + signing UI

### Real-World Assets (RWA)
- [x] RWA investment page

### Insurance
- [x] Parametric insurance policies (oracle-triggered payouts)

### Living Trust
- [x] 5 trust types: revocable, irrevocable, testamentary, special needs, spendthrift
- [x] 5-step creation wizard (type → details → beneficiaries → conditions → review & pay)
- [x] Multi-beneficiary support (custom % shares + per-beneficiary conditions)
- [x] Trust conditions: time-lock, age-check, event, multi-sig
- [x] Setup fee payment (50 GYDS setup + 10 GYDS annual = 60 GYDS total)
- [x] Vault deposit (lock GYDS in trust vault)
- [x] Successor trustee designation
- [x] Full CRUD API: GET/POST /api/trusts, POST pay-fee, POST deposit, DELETE
- [x] DB tables: trusts, trust_beneficiaries, trust_conditions, trust_payments
- [x] Living Trust in sidebar navigation (Ecosystem section)

### Analytics
- [x] Chain analytics dashboard (TPS, volume, active wallets)
- [x] Token analytics
- [x] Leaderboard (XP + achievements)

### Developer Portal
- [x] API documentation
- [x] SDK section (JS/TS + Python available; Go in progress; Rust planned)
- [x] Feature matrix table
- [x] CLI reference page

### Admin Panel
- [x] User management (ban, role assignment)
- [x] Node installation management + approval
- [x] WireGuard peer manager (auto IP assignment, config generation)
- [x] Test node manager (5 types: rpc, lite, fullnode, boostnode, validator)
- [x] Validator monitor
- [x] Cron job manager (7 jobs, in-memory registry)
- [x] GitHub webhook receiver (HMAC-SHA256)
- [x] Node repo sync checker
- [x] Payment methods manager (PayPal, MMG, Bank GY, VISA/MC, Crypto)
- [x] Buy requests (approve / reject)
- [x] Cashout requests (approve / reject)
- [x] Monitoring tab (RPC health, DB status, memory, uptime)
- [x] DB pruner cron (auto-prunes logs, snapshots, expired tokens)
- [x] **Wallet App tab** — upload APK / IPA / EXE / DMG builds (multer, 500 MB max); manage & delete releases

### Notifications
- [x] In-app notification bell (faucet, governance, proposals)
- [x] Browser push notifications (Web Push / VAPID)
- [x] Telegram alerts (bot token config)
- [x] WhatsApp alerts (Meta Cloud API)
- [x] Email notifications (SMTP optional)

### Node Software
- [x] Lite node (Go — install-litenode.sh)
- [x] Full node (Go — install-fullnode.sh)
- [x] RPC node, Boost node, Validator node, Genesis node, Boot node, Dev node, Local node
- [x] Validator node: PoS engine + slashing + JSON-RPC validator_* methods
- [x] All-in-one install script
- [x] Web setup wizard (browser UI on port 8888 — lite + fullnode)
- [x] Y/N prompt before launching wizard (user can skip or use --no-wizard flag)
- [x] GYDS_SKIP_WIZARD=1 env var to auto-skip wizard in CI/unattended installs
- [x] Deploy scripts: setup-server.sh, redeploy.sh, deploy-dashboard.sh
- [x] Docker files + Compose configs

### Security
- [x] CSP + security headers (Content-Security-Policy, X-Frame-Options, etc.)
- [x] Rate limiting (auth, faucet, general API)
- [x] IP blocking / firewall (admin-managed)
- [x] Security audit page

### PWA / Mobile (Dashboard)
- [x] Progressive Web App (manifest v2, 7 icons, 4 shortcuts)
- [x] Service worker (stale-while-revalidate + background sync)
- [x] Install prompt (Android + iOS guide)
- [x] Mobile bottom nav hub page (`/mobile`) with 5 tabs: Home, Explorer, DeFi, Wallet, More
- [x] Edge side panel support
- [x] **Real wallet address on mobile page** — fetches from `user.walletAddress` → `/api/wallets` fallback (no more hardcoded address)
- [x] **Real recent transactions on mobile page** — fetches from `/api/transactions`; falls back to demo data if empty
- [x] **Activity rows clickable** — each transaction row navigates to `/transactions`; empty state with direct link shown when no transactions exist
- [x] **Receive QR modal** — bottom-sheet modal with live QR code generated from wallet address (using `qrcode` npm); Copy + Share buttons; opens from Home or Wallet tab "Receive" button
- [x] **Daily faucet banner** — inline banner on Home tab; shows "Claim" button when cooldown elapsed, counts down to next claim time; POST /api/faucet/claim in-place (no navigation needed)
- [x] **Live network stats on Home tab** — Block Height, GYDS Price, TPS, Validator count fetched from `/api/network-stats` (no more hardcoded values)
- [x] **Real blocks in Explorer tab** — block list derived from live `blockHeight`; chain info strip (Chain ID, Block Time, Finality, Consensus); blocks are clickable → `/explorer?q=height`
- [x] **Notification bell with badge** — header bell shows red unread-count badge from `/api/notifications`; navigates to profile/notifications; hidden when logged out
- [x] **NFT mini-gallery in Wallet tab** — fetches `/api/nft/my-tokens`; shows 3 NFTs as square cards with cover art or placeholder; "Gallery →" link to /nft
- [x] **Staking positions in Wallet tab** — fetches `/api/validator-delegations`; shows each delegation with validator name, amount staked, APY; "All →" link to DeFi stake tab
- [x] **Staking rewards banner in Wallet tab** — shown when delegations have pending rewards; "Claim →" opens stake tab
- [x] **Cash Out button in Wallet tab** — 4-button grid (Send/Receive/Swap/Cash Out) replacing the old 3-button grid; Cash Out → /wallet
- [x] **Expanded quick links in Wallet tab** — 6 links: Tx History, Watchlist, NFT Gallery, Network Info, Faucet, Multi-Sig (was 4)

### GYDS Wallet — Mobile App (Android & iOS)
> **Repo:** https://github.com/hc172808/your-digital-wallet
> **Setup guide:** `mobile-wallet/SETUP.md`
> **Git push guide:** `mobile-wallet/git-push-guide.md`
> **Configure:** `bash mobile-wallet/configure.sh`
> **Android build:** `bash mobile-wallet/android-build.sh`
> **iOS build:** `bash mobile-wallet/ios-build.sh` _(macOS + Xcode required)_

- [x] Wallet app repo identified: `hc172808/your-digital-wallet` (Vite + React + TypeScript PWA)
- [x] GYDS chain 13370 already configured — same RPC endpoints (`rpc.netlifegy.com`)
- [x] App identity: `io.netlifegy.gyds` (Android + iOS), TWA: `io.netlifegy.gyds.twa`
- [x] Capacitor config (`mobile/capacitor.config.ts`) — app name "GYDS Wallet", dark theme `#0f1318`
- [x] Bubblewrap TWA manifest (`mobile/bubblewrap/twa-manifest.json`) — Android native wrapper
- [x] PWABuilder config (`mobile/pwabuilder.json`) — no-toolchain alternative
- [x] Configure script written: `mobile-wallet/configure.sh` — clones repo, patches domain, writes `.env.local`
- [x] Android build script written: `mobile-wallet/android-build.sh` (Capacitor / Bubblewrap / PWABuilder)
- [x] iOS build script written: `mobile-wallet/ios-build.sh` (Capacitor / PWABuilder)
- [x] Full SETUP.md guide written: `mobile-wallet/SETUP.md` (step-by-step for all platforms)
- [x] Wallet features: Send, Receive, Swap, History, NFT Gallery, Earn, Buy, Perps, Prediction, Price Alerts, WalletConnect v2, DApp Browser, Hardware Wallet, Multi-Account, QR Scanner, Import/Export, Admin Panel, Push Notifications, PWA install

**Wallet app next steps (to complete the integration):**
- [ ] Run `bash mobile-wallet/configure.sh` → enter your domain → builds locally
- [ ] Set `VITE_API_BASE=https://netlifegy.com` in wallet `.env.local` to link to ChainCore backend
- [ ] Android: `bash mobile-wallet/android-build.sh` → open in Android Studio → sign → submit to Play Store
- [ ] iOS: `bash mobile-wallet/ios-build.sh` (needs Mac + Xcode) → Archive → submit to App Store
- [ ] OR: Deploy wallet to netlifegy.com → use PWABuilder at https://www.pwabuilder.com (no toolchain)
- [ ] Add `/.well-known/assetlinks.json` to your server for Android TWA (see SETUP.md §5)
- [ ] Add Play Store / App Store download buttons to the ChainCore dashboard download page
- [ ] Configure VITE_API_BASE so wallet auth tokens work with ChainCore session API

### Wallet App Distribution
- [x] **Header download button** — `WalletDownloadButton` in top-right header for all logged-in users; shows modal with per-platform download cards (Android/iOS/Windows/macOS); only visible when at least one build has been uploaded
- [x] **Admin → Wallet App tab** — upload APK / IPA / EXE / DMG (multer, 500 MB max); shows version, file size, download count; delete old builds
- [x] **`wallet_releases` DB table** — stores platform, version, filename, file size, notes, download count, uploaded_by
- [x] **`/api/wallet-releases`** — GET (public, lists all builds); POST upload (admin); GET download/:id (streams file, bumps counter); DELETE (admin)
- [x] **`uploads/wallet/`** — server-side file storage directory for uploaded builds

### Branding / Marketing
- [x] Landing page
- [x] Press kit
- [x] Blog
- [x] Protocol docs
- [x] Download page
- [x] **App Preview page** (`/preview`) — catalog of all 36 pages with category filter, search, status badges, Preview overlay + Open buttons; Mobile tab (phone mockup iframe), Landing tab (desktop browser frame), Wallet App tab (build guide + links)

---

## 🔁 GitHub — Pushing to Your Repos

> Full guide: `mobile-wallet/git-push-guide.md`

### Push ChainCore dashboard
```bash
git remote add origin https://github.com/YOUR-USERNAME/chaincore-dashboard.git
git add -A && git commit -m "your message" && git push -u origin main
```

### Push GYDS Wallet changes
```bash
cd gyds-wallet
git add -A && git commit -m "your message" && git push
```

### Push both at once
```bash
# Root of ChainCore project:
bash push-all.sh "your commit message"
```

---

## 🔧 In Progress / Partial

- [~] **Trust vault auto-distribution** — conditions trigger tracking exists; automatic on-chain distribution not yet wired
- [~] **SDK — Go** — marked "In Progress" in Developer Portal; code examples stub only
- [~] **Email SMTP** — verification and reset emails log to console in dev; need SMTP env vars for production delivery
- [~] **Validator node repo** — Go source in node-fixes/validatornode; needs packaging + GitHub release pipeline

---

## 📋 Planned / Todo

### Living Trust (next steps)
- [ ] Trustee notification emails/push when conditions are triggered
- [ ] Emergency unlock multi-sig (100 GYDS fee, 2-of-3 trustee signing)
- [ ] Trust document PDF export (auto-generated legal-style document)
- [ ] Annual auto-renewal — auto-deduct 10 GYDS/year from vault balance
- [ ] Beneficiary portal — beneficiaries can log in and see trusts they're named in
- [ ] Trust transfer (change grantor wallet address)
- [ ] Trust freeze / unfreeze (admin-level emergency action)
- [ ] Condition oracle integration — verify real-world events on-chain

### DeFi Improvements
- [ ] Real AMM pricing (currently simulated)
- [ ] Actual liquidity pool smart contracts deployed on GYDS chain
- [ ] Order book matching engine (backend)
- [ ] Perps funding rate feed (live oracle)
- [ ] Prediction market resolution oracle

### Governance
- [ ] On-chain snapshot voting (currently off-chain DB)
- [ ] Quorum and threshold enforcement
- [ ] Proposal templates

### Identity
- [ ] W3C DID document creation + IPFS storage
- [ ] Verifiable credentials issuance
- [ ] Cross-chain identity verification

### NFT Marketplace
- [ ] NFT minting wizard
- [ ] On-chain royalties
- [ ] Collection pages + auction support

### Node Software
- [ ] Termux (Android) installer — script in place, needs testing
- [ ] Node auto-update mechanism (compare local vs. GitHub release tag)
- [ ] One-click validator registration from dashboard
- [ ] Node health alerts (push/Telegram when node goes offline)

### Analytics
- [ ] Historical chart data (time series — charts show live only now)
- [ ] Wallet analytics (individual address history)
- [ ] Token holder distribution chart

### Security
- [ ] Withdrawal 2FA (require TOTP for large sends)
- [ ] Anomaly detection (flag unusual login locations/IPs)
- [ ] Auto-ban on repeated failed login attempts (beyond rate limit)

### Platform
- [ ] SMTP setup UI (admin panel — configure mail server without env var restart)
- [ ] KYC / identity verification flow
- [ ] Referral system (invite links + GYDS rewards)
- [ ] Multi-language i18n (locale field exists; translations not implemented)
- [ ] Dark/light theme switcher (currently dark-only)
- [x] Mobile app — GYDS Wallet PWA (Android + iOS via Capacitor / Bubblewrap / PWABuilder — see GYDS Wallet section above)
- [ ] SDK — Rust (planned)
- [ ] SDK — Go (complete examples + npm/crates release)
- [ ] GraphQL API (currently REST-only)
- [ ] WebSocket subscriptions for real-time price feeds

### Admin
- [ ] Bulk user actions (export CSV, mass-ban)
- [ ] Audit log viewer (who changed what, when)
- [ ] Revenue dashboard (trust fees, token launches, insurance premiums)
- [ ] Scheduled announcements

---

## 💡 Ideas / Backlog

- [ ] **Will & Estate Planner** — companion to Living Trust; text editor for will documents stored encrypted
- [ ] **Token-Gated Content** — lock blog posts / docs behind a minimum GYDS balance
- [ ] **Staking Rewards Dashboard** — pending rewards, APY history, compound calculator
- [ ] **Chain Bridge (native)** — atomic swaps between GYDS chain and another L1
- [ ] **Decentralised Storage** — pin trust documents and NFT metadata to IPFS / Arweave
- [ ] **DAO Treasury** — community-controlled fund with governance-voted disbursements
- [ ] **Grant Program UI** — apply for GYDS ecosystem grants, track application status
- [ ] **Social Recovery** — recover wallet via trusted contacts (no seed phrase needed)
- [ ] **Subscription Payments** — recurring GYDS payments (e.g. SaaS billing on-chain)
- [ ] **Carbon Credits** — on-chain carbon offset certificates (RWA extension)

---

_To mark something complete: change `- [ ]` to `- [x]` and move it up to the ✅ section._
