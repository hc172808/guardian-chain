# GYDS / ChainCore — Development Log

Chronological record of changes. Newest entries on top.

---

## 2026-05-06 (cont.) — DB-3, SC-7, GPL truth-up

**DB-3 / SC-7 closed.** Audited `admin_config` and seeded the 6 missing default rows the frontend was falling back on hardcoded values for:
- `gyds_price` `{usd: 0.0000001}`
- `gyd_price`  `{usd: 1.00}`
- `mining_config` `{block_time_seconds: 120, base_reward: 50, halving_blocks: 210000, pool_fee_default: 0.02}`
- `staking_stats` `{apr: 0, staked_total: 0, buybacks_24h: 0, exchange_rate: 1.0}`
- `bootnodes` `{mainnet: [], testnet: [], devnet: []}` so `/bootnodes` returns a valid envelope before any peers are registered.
- `gpl_config` `{gas_table, max_gas_per_tx: 10M, block_gas_limit: 30M}`

Verified `network_features` row already present (SC-7 migration applied earlier). Marked SC-7 as ✅ with the audit note rather than leaving it perpetually 🟡.

**GPL truth-up.** Earlier log/TODO entries claimed `internal/programs/`, `internal/gpl/vm.go`, and `program_state.go` were live in the Go tree. They are NOT — `public/blockchain-go/internal/` only contains: banking, blockchain, consensus, database, genesis, indexer, liteclient, mining, network, rpc, storage, token, wallet. The GPL-A1..A5 / GPL-B1..B4 / GPL-2 / GPL-3 entries are aspirational, not shipped. Calling this out so the next agent (Replit / second AI dev) doesn't build on a phantom foundation. Decision: ship the GPL programs scaffold in a dedicated Go pass after the remaining frontend/infra items.

---

## 2026-05-06 — Security linter cleanup + faucet hardening + server install doc

**All 10 Supabase linter issues resolved (re-run shows 0).**

- **ERROR — Security Definer View** → `v_authority_summary` recreated with `WITH (security_invoker = true)` so it respects the caller's RLS, not the view creator's. `GRANT SELECT` re-issued to `authenticated`.
- **WARN ×3 — SECURITY DEFINER functions executable by anon/authenticated** → revoked `EXECUTE` on `has_role(uuid, app_role)`, `handle_new_user()`, `handle_new_user_role()` from `PUBLIC, anon, authenticated`. `has_role` keeps working inside RLS policies (RLS bypasses grants); the other two are trigger functions (triggers run regardless of grants).
- **WARN ×2 — Public bucket allows listing** → dropped broad SELECT policies on `storage.objects` for `token-logos` / `token-sites`; replaced with owner-only listing policies. Buckets remain public for direct URL fetches (CDN-style), but enumeration via `list()` is now blocked unless the caller owns the object.
- **WARN — Leaked password protection disabled** → enabled via `configure_auth(password_hibp_enabled=true)`. Signup + password-change now check Have-I-Been-Pwned.

**Faucet hardening (`faucet-claim`).**
- `supabase/config.toml`: switched `faucet-claim` from `verify_jwt = false` (manual validation only) to **`verify_jwt = true`** so the gateway rejects unauthenticated/anonymous callers before they ever hit our handler.
- Function still re-validates defensively: rejects when `claims.is_anonymous === true`, when `role !== 'authenticated'`, or when `sub` is missing.
- `wallet_address` is now lowercased and matched with `^0x[a-f0-9]{40}$` so cooldown comparisons against `faucet_claims.wallet_address` are deterministic.
- 24 h cooldown per `(user_id, token_type)` AND per `(wallet_address, token_type)` unchanged. `emergency_shutdown` authority kill-switch unchanged.

**New: `public/docs/SERVER_INSTALL_REQUIREMENTS.md`** — full Ubuntu 22.04 install recipe for: CloudPanel (frontend), Go 1.22 (node), Postgres 15 (indexer), Docker (RPC/explorer), UFW + Fail2ban + WireGuard, SSL, systemd units, and the bootnode auto-discovery endpoint. Designed to be handed verbatim to a second AI dev (Replit, etc.) or a server admin.

---

## 2026-05-04 — INF-5, MIN-2, BC-7, AI Security Compliance

**INF-5 — Public bootnodes endpoint.** New edge function `bootnodes` (verify_jwt=false) returns a stable JSON document with mainnet/testnet/devnet entries (chain_id + enode list). Reads `admin_config.bootnodes`, falls back to baked-in defaults, validates enode shape, supports `?network=…` filter, 60 s edge cache. Install scripts can now `curl -s https://<project>.functions.supabase.co/bootnodes?network=mainnet` on first boot.

**MIN-2 — Reward distribution audit + tests.** New `src/lib/miningRewards.ts` exposes a single deterministic, integer-only `distributeBlockReward()` that produces one credit per recipient (always sourced from `MINING_POOL_WALLET = 0x…0002`). Pool fee row sweeps integer-division dust so `Σ credits == blockReward` exactly — invariant asserted in code and in tests. Vitest set up (`vitest.config.ts`) and 13 tests pass: solo path, pool 50/50, pool pro-rata 70/20/10, 2 % fee math, dust handling (10/3 split → 1 unit goes to pool), input validation, and a 50-trial property test asserting sum equality.

**BC-7 — Pending → Confirmed via real RPC.** New `src/lib/txConfirmation.ts` provides `submitAndAwaitConfirmation()`: inserts the row with `status='pending'`, polls `eth_getTransactionReceipt` every 2 s on the active network's RPC, then flips the row to `confirmed` (status `0x1`), `failed` (status `0x0`), or `failed` after 60 s timeout. Wired into Wallet → Send and DeFi → Swap (both previously inserted `confirmed` immediately). UI now shows a "⏳ Pending" toast on submit and a follow-up "✅ Confirmed" / "❌ Failed" toast when the receipt arrives. The existing `useTransactionNotifications` realtime listener picks up the row update for free.

**AI Security Compliance.**
- DB: new `ai_security_events` table (severity, category, summary, details JSONB, model, action, subject_user_id, subject_address, source) with founder/admin-only RLS; default policy seeded into `admin_config.ai_security` (`enabled`, `model=google/gemini-3-flash-preview`, `sensitivity=medium`, `block_on_critical=true`, 8 monitored categories, `override_role=founder`).
- Edge fn `ai-security-guard` (verify_jwt=false) calls Lovable AI with a tool-call schema returning `{ decision, severity, reason }`, persists the verdict, and gracefully downgrades to `review` on 429 / 402. Caches policy 30 s.
- UI: `AISecurityCompliance.tsx` mounted as Admin → AI Security tab. Founders/admins can toggle the guard, choose model + sensitivity + monitored categories, run a live test prompt, and watch the realtime events feed with severity badges and action icons. Founder-only override of `override_role` lets founders grant admins edit rights without losing veto.

**Linter notes.** Migration produced the same 10 pre-existing warnings (security-definer view, public bucket listing, anon-callable definer functions, leaked-password protection). None introduced by this turn; deferred to a future security-pass turn.

---

## 2026-05-02 — Authority Registry made real (AUTH-1..AUTH-4)

**Context.** Previous TODO entries claimed AUTH-1..AUTH-9 were complete, but inspection showed:
- No `authorities` table existed in the database.
- `src/hooks/useAuthorities.ts` and `src/components/admin/AuthoritiesManager.tsx` were never created.
- The "wired" gating in BurnMint / Swap / Bridge was not actually present in those files.

**Done this turn.**
- ✅ Migration creates `public.authorities` (id/category/name/description/enabled/required_role/updated_by/updated_at) with RLS:
  - SELECT — any authenticated user
  - UPDATE — founders for any row, admins only for `required_role='admin'` rows
  - INSERT — founders only
- ✅ Seeded **49 authorities** across 9 categories (Consensus & Block Production, Economic / Monetary, Protocol Upgrade, Administrative, Governance, Access / Security, Cross-Chain & Oracles, Contract Lifecycle, Wallet).
- ✅ View `v_authority_summary` for category-level counts.
- ✅ `src/hooks/useAuthorities.ts` — TanStack-free hook with realtime subscription, `isEnabled(id)` (safe-default ON), `byCategory` grouping, `toggle(id, enabled)`.
- ✅ `src/components/admin/AuthoritiesManager.tsx` — grouped switches with search, per-category Enable-all / Disable-all, founder/admin permission checks per row.
- ✅ `src/components/admin/AuthoritiesStatusWidget.tsx` — colored sidebar badge (emerald → yellow → orange → red) showing live count of disabled authorities; deep-links to `/admin?tab=authorities`. Shows "CHAIN HALTED" when `emergency_shutdown` is OFF.
- ✅ `Admin.tsx` upgraded to controlled tabs driven by `?tab=...` so the widget link selects the right tab.

**Honestly out of scope this turn (deferred to subsequent turns).**
- AUTH-5: global chain-status banner mounted in Layout.
- AUTH-6: `<AuthorityGate>` wrapper.
- AUTH-7..AUTH-9: actually gating BurnMint / Swap / Bridge handlers on authority state.
- Server-side `emergency_shutdown` enforcement in `github-sync` and `blockchain-api` edge functions.
- Any authority enforcement on the Go node side.

**Network env switcher.** Verified NET-1..NET-5 are already implemented (`DEVNET_CONFIG`, `useActiveNetwork`, `NetworkSwitcher`, `useRpcHealth`). No new work needed.

**Linter notes.** Migration produced 10 pre-existing warnings (security-definer view, public bucket listing, anon-callable definer functions, leaked-password protection). None caused by this migration; the new `v_authority_summary` is a plain SELECT view, not security-definer. Deferring; can be addressed in a security-pass turn.

---

## Earlier history

See `TODO.md` for the full ledger of completed and pending items.

## 2026-05-05 — SEC-4, FE-12, FE-13, INF-12/13

- **SEC-4**: Created `faucet_claims` table (migration `20260505001429`) + `supabase/functions/faucet-claim/index.ts`. Hard 24 h cooldown per user *and* per wallet, kill-switched by `emergency_shutdown` authority. `Faucet.tsx` now drives state from server response; no more localStorage cooldown.
- **FE-12**: `useOnchainBalance` polls `eth_getBalance` across `ALL_RPC_ENDPOINTS` every 12 s. `WalletConnectBar` prefers on-chain GYDS when reachable, falls back to DB aggregate, surfaces an "On-Chain" badge.
- **FE-13**: closed by SEC-4.
- **INF-12 / INF-13**: artifacts already present (`wireguard-config.template`, `ssl-setup.sh`); added operator recipe `public/docs/SECURE_NODE_DEPLOYMENT.md` covering hub + peer setup, RPC bind, certbot SAN issuance, and traffic flow.

## 2026-05-07 — GPL Go scaffolding + INF-14 smoke test

- **GPL-A1..A5 / B1..B2**: created `public/blockchain-go/internal/programs/` with five modules and a registry:
  - `programs/program.go` — shared `Address`, `Instruction`, `AccountMeta`, `Context` (with `ChargeGas`), `Program`, `Registry`, error set.
  - `programs/registry/` — in-memory `Registry` with `Dispatch` (charges `DefaultGasPerCall=100`), `AllowDeploy/CanDeploy` developer whitelist (default-deny → fixes B1).
  - `programs/system/` (A1) — `OpCreateAccount/Transfer/Assign`, gas-metered, signer/writable enforced.
  - `programs/token/` (A2) — single shared engine for ALL fungible tokens; `Mint{authority,supply,decimals,freeze_authority}` + `TokenAccount{mint,owner,amount,frozen}` records; ops `InitMint/MintTo/Transfer/Burn/Freeze/Thaw/SetAuthority`.
  - `programs/accounts/` (A3) — `DerivePDA(programID, seeds…)` deterministic SHA-256 helper, length-prefixed seeds, version tag.
  - `programs/staking/` (A4) — `StakeAccount` bookkeeping façade over `consensus/pos.go`; ops `InitStake/Delegate/Undelegate/ClaimRewards`.
  - `programs/vm/` (A5 + B2) — sandboxed stack interpreter with hard ceilings: 64 KiB code, 1024-deep stack, 1 M instructions, per-op gas, NO host clock / RNG / syscalls (consensus-replay safe). Opcodes: `Halt/PushU8/PushU64/Pop/Add/Sub/Mul/Div/Eq/Jump/JumpIf/Log`.
  - `programs/programs_test.go` — 7 deterministic tests: registry dispatch + unknown-program error, system create-account flow, token mint+transfer balance math, VM `ErrOutOfGas`, VM halt with correct stack, PDA determinism + seed sensitivity, deploy whitelist default-deny.
- **Compatibility**: zero edits to `internal/blockchain/state.go`, `internal/token/factory.go`, or `internal/consensus/pos.go`. The existing chain keeps working; the new programs are an additive façade ready for the `TxType.ContractCall/ContractDeploy` wiring (GPL-B3, next pass).
- **INF-14**: `public/scripts/deploy-ecosystem-smoke.sh` — non-interactive end-to-end smoke covering tooling, `.env`, container health, indexer Postgres `SELECT 1`, public RPC `eth_blockNumber` per endpoint, `/bootnodes?network=…` JSON shape, frontend `200`. `bash -n` clean. Wires straight into CI / cron with `NETWORK=testnet|devnet` overrides.
- **Build status**: Go toolchain unavailable in the Lovable sandbox (no `go` binary) — code is Go 1.21-compatible and matches the existing module layout. Run `cd public/blockchain-go && go test ./internal/programs/...` on the deploy host (Replit, server, dev box) to validate.
