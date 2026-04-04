# GYDS Chain — TODO / Known Issues

## Balance & Financial Logic
- [ ] **Audit balance overflow for large operations** — Ensure `numeric` DB type handles extreme values; add server-side validation in edge functions
- [ ] **Add unit tests for balance calculation** — Test edge cases: zero balance, many operations, mixed mint/burn, concurrent bridge operations
- [ ] **Implement server-side balance validation** — Currently balance checks are client-side only; malicious users could bypass via direct API calls
- [ ] **Investigate stale balance caching** — Realtime subscriptions may miss events; add periodic polling fallback
- [ ] **Handle Supabase 1000-row query limit** — Users with >1000 token_operations will have incorrect balances; paginate or use DB aggregation function

## Token Holders
- [ ] **Move holder calculation to DB function** — Client-side aggregation is slow and inaccurate; create a materialized view or SQL function
- [ ] **Track per-token holders separately** — Currently aggregating all operation types together; need token-specific holder tracking
- [ ] **Add holder count to token list page** — Show holder count on browse tokens cards

## Security & Integrity
- [ ] **Prevent double-spend on bridge** — Add idempotency keys to bridge operations
- [ ] **Rate-limit bridge/swap operations** — Prevent abuse via rapid successive transactions
- [ ] **Add transaction signing** — Currently no cryptographic proof; transactions are just DB inserts
- [ ] **Validate operation_type values at DB level** — Keep CHECK constraint updated when adding new operation types

## UX Improvements
- [ ] **Show loading state while balance is being calculated** — Prevent actions while balance is unknown
- [ ] **Add transaction receipt/confirmation modal** — Show detailed breakdown after swap/bridge
- [ ] **Improve error messages** — Map DB constraint errors to user-friendly messages
- [ ] **Add balance refresh button** — Manual refresh for users who suspect stale data

## Infrastructure
- [ ] **Create DB index on token_operations(status, wallet_address)** — Speed up balance queries
- [ ] **Create DB index on transactions(user_id, status)** — Speed up transaction lookups
- [ ] **Add monitoring/alerts for negative balance occurrences** — Log when balance calculation would go negative
- [ ] **WebSocket reconnection improvements** — Current WebSocket errors in console need graceful handling
