# ChainCore — Fixes & Feature Tracker

## ✅ Completed Fixes

### Block Time (120s everywhere)
- **Files**: `src/pages/Landing.tsx`, `src/pages/PressKit.tsx`, `server/routes.ts`
- **Change**: All hardcoded "~4s" → "~120s"; `/v1/network/stats` now returns `block_time: 120, block_time_ms: 120000`

### Wallet-Based Password Reset
- **Files**: `server/auth.ts`, `src/pages/Auth.tsx`
- **Route**: `POST /api/auth/reset-password/wallet`
- **Flow**: User enters username → signs a nonce with MetaMask → server verifies signature → sets new password

### Node Registration → Approve Nodes Tab
- **Files**: `src/components/admin/NodeInstaller.tsx`, `server/routes.ts`
- **Change**: NodeInstaller has a "Register Node Installation" card; `POST /api/nodes` auto-approves for admin/founder, creates as pending for regular users
- **Rule**: Nodes appear in Admin → Nodes tab for approve/reject/revoke

### AI Firewall — Full Enforcement
- **Files**: `server/security.ts` (new), `server/index.ts`, `server/routes.ts`
- **Features**:
  - In-memory + DB-persisted IP blocklist
  - Lockdown mode (503 to all non-auth routes)
  - Adaptive rate limiting (1–100 req/min based on sensitivity 1–10)
  - Payload inspection: SQL injection, XSS, SSRF, shell injection, path traversal, RPC flood
  - Auto-block on attack detection at sensitivity ≥ 6
  - Stats counters: blocked / rate-limited / payload-blocked

### AI Firewall UI — Blocked IPs Tab + Fixes
- **Files**: `src/components/admin/AIFirewallTab.tsx`
- **Fixes**:
  - "Clear Bans" button now calls real `DELETE /api/security/blocked-ips` (was calling broken Supabase shim)
  - Lockdown desync on page reload fixed (derived from `threat_response` field)
- **Added**: New 🚫 Blocked tab — live IP list, manual block form, unblock per-IP, real-time stats

---

## 🔧 Known Issues / In Progress

### Wallet Features
- GYDS/GYD balances read from RPC (`useRpcBalance` hook) — works when RPC is reachable
- Wallets are stored per-user in `wallets` table; connected MetaMask address is read via `useWalletConnect`
- WireGuard keys stored in `users.wireguardPublicKey` / `users.wireguardPrivateKey`

### Node Installations
- Nodes registered via NodeInstaller → stored in `node_installations` table
- Pending nodes show in Admin → Nodes tab for approve/reject
- Admin auto-approves on registration

### Stablecoin Creation (see below)
- Users can now create their own stablecoins via DeFi → Stablecoins tab
- Full rules and collateral requirements enforced

---

## 🆕 Stablecoin Creation — Rules

All user-created stablecoins are subject to these rules:

### 1. Identity
- **Symbol**: 2–10 characters, uppercase letters + numbers only, no conflicts with GYDS/GYD or existing tokens
- **Name**: 3–50 characters
- **Description**: optional, max 500 chars

### 2. Peg Types
| Type | Target | Notes |
|------|--------|-------|
| `usd` | 1.00 USD | Most common |
| `eur` | ~1.08 USD | Euro peg |
| `gbp` | ~1.27 USD | British Pound |
| `btc` | ~65000 USD | BTC peg |
| `eth` | ~3500 USD | ETH peg |
| `gold` | ~2000/oz | XAU peg |
| `custom` | user-defined | Any asset, must specify value |
| `basket` | weighted mix | Must define basket weights |

### 3. Collateral Models
| Model | Min Collateral Ratio | Liquidation Threshold | Notes |
|-------|---------------------|----------------------|-------|
| `over_collateralized` | **150%** | ≥ 110% | Safest, CDP model |
| `algorithmic` | **100%** | ≥ 100% | Algorithm maintains peg, higher risk |
| `hybrid` | **120%** | ≥ 110% | Mix of collateral + algo mechanisms |
| `fiat_backed` | **100%** | ≥ 100% | Off-chain reserves, requires documentation |

### 4. Fee Rules
- **Stability Fee**: 0% – 25% annual (charged to minters holding positions)
- **Minting Fee**: 0% – 5% one-time fee on each mint
- **Burn/Redemption Fee**: 0% – 2% on redemptions

### 5. Creation Requirements
- **Creation Fee**: 10,000 GYDS (admin-configurable via `stablecoin_creation_fee` in admin_config)
- **Max per user**: 3 stablecoins (admin-configurable via `stablecoin_max_per_user`)
- **Admin approval required** before stablecoin goes live
- At least 1 reserve asset must be declared

### 6. Lifecycle States
`draft` → `pending_review` → `active` → `paused` / `deprecated`

### 7. Automatic Rules Enforcement
- Admin can pause/deprecate any stablecoin at any time
- Collateral ratio drops below liquidation threshold → positions liquidated
- Symbol uniqueness checked at creation time against all existing tokens + stablecoins
- Founders/admins can skip creation fee

---

## 🛡️ WireGuard Peer Manager

- Admin panel → Nodes tab has "WireGuard Peers" section
- Lists all approved nodes with their WireGuard public keys
- Assigns /30 subnet IPs sequentially (10.8.0.1 is server, peers start at 10.8.0.2)
- Download button generates per-peer `wg0.conf` and full server config
- Peer count shown on tab badge
