# GYDS / ChainCore — Development Log

Chronological record of changes. Newest entries on top.

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
