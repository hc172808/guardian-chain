# GYDS / ChainCore — Development Log

Chronological record of changes. Newest entries on top.

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
