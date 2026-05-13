# ChainCore / GYDS Explorer — Migration TODO

## Status key: [ ] todo · [x] done · [~] partial / stubbed by design

---

## P0 — Correctness blockers (migration parity)

- [x] DB schema: uuid PKs fixed across all 27 tables
- [x] Supabase shim: `.from()` chain API proxies to Express
- [x] Supabase shim: `.or()` filter support
- [x] Supabase shim: `functions.invoke()` stub
- [x] Supabase shim: storage upload → presigned GCS PUT
- [x] Storage ACL: `set-acl` endpoint called after upload; `visibility=public` for token/logo buckets
- [x] Storage ACL: GET /storage/objects/* allows public-visibility objects without auth
- [x] Table write auth: tokens, token_launches, token_operations, liquidity_pools → ADMIN_WRITE_TABLES
- [x] Clerk auth: AuthContext exposes same { user, session, roles, signIn, signOut, isAdmin, isFounder } shape
- [x] USER_OWNED_TABLES: per-user read/write scoping on wallets, transactions, smart_contracts, etc.
- [x] Upsert: uses onConflictDoUpdate when _on_conflict param is present

---

## P1 — Live features

- [x] **SSE real-time feed**: GET /api/blockchain/stream emits newBlock + newTransaction events every 5 s; frontend hook `useBlockchainSSE` (same interface as old WebSocket hook) consumes it; Explorer.tsx + LiveNetworkStats.tsx both wired up
- [x] **Network stats from DB**: /blockchain/network/stats reads real counts from `network_validators`, `wallets`, `transactions` tables (falls back to stubs if DB empty)
- [x] **Faucet claim enforcement**: POST to faucet_claims now returns 429 with `next_available_at` if same user_id **or** same wallet_address has claimed within 24 h
- [x] **Token search**: Explorer.tsx search already uses `supabase.from('tokens').or(...)` via shim → works against DB
- [x] **Wallet lookup**: GET /blockchain/wallet/:address queries `wallets` table by address

---

## P2 — Polish / quick wins

- [x] **index.html titles**: `<title>` and og:title updated to "ChainCore — GYDS Blockchain Explorer"
- [x] **Price sparkline**: PriceSparkline.tsx now tries `/api/blockchain/token-price/history` for native GYDS tokens; deterministic fallback (no more random flicker); CoinGecko still used for ETH/BNB/MATIC/SOL
- [x] **Token price history endpoint**: GET /api/blockchain/token-price/history returns 7-day synthetic price series derived from current `token_price` DB row (falls back to 0.042 GYDS baseline when table empty)
- [ ] **Validator leaderboard pagination**: GET /api/table/network_validators — add default `_order=stake&_asc=false` to the frontend Validators page query (minor UX, not blocking)

---

## P3 — Security hardening

- [x] **Rate-limit faucet claims**: 1 claim per user_id + 1 per wallet_address per 24 h — enforced in table router INSERT handler
- [x] **Admin role enforcement**: ADMIN_WRITE_TABLES requires `isAdmin()` check in table router write path; role read from Clerk sessionClaims.publicMetadata.role
- [ ] **Audit log on writes**: INSERT to `audit_logs` on any ADMIN_WRITE_TABLES mutation (P3 — not blocking)
- [ ] **walletCrypto.ts**: PIN hash stored in localStorage — document as "dev-only" or move to server-side session (P3)

---

## P4 — Out of scope (no Go RPC node in this env)

- [~] All `/blockchain/*` routes return structured stubs with incrementing block heights — acceptable until a real GYDS RPC node is connected
- [~] `miningClient.ts` WebAssembly mining engine — placeholder SHA-256 hash; real RandomX/kHeavyHash not available in browser
- [~] `eth_handlers.go` in public/blockchain-go — Go source for the real node; TODOs inside are node-level, not explorer-level

---

## Completed this session

1. Fixed DB schema UUIDs (all 27 tables)
2. Object storage: presigned upload + ACL set-acl endpoint
3. Table write authorization: ADMIN_WRITE_TABLES extended (tokens, liquidity_pools, token_launches, token_operations)
4. Storage GET: public-visibility objects bypass auth requirement
5. Supabase shim: post-upload ACL set call
6. SSE real-time stream: /api/blockchain/stream + useBlockchainSSE hook
7. Network stats: DB-backed validator/wallet/tx counts
8. Faucet 24h enforcement: user_id + wallet_address deduplication
9. index.html: title + og:title → "ChainCore — GYDS Blockchain Explorer"
10. Price sparkline: deterministic fallback + native GYDS endpoint
11. Token price history endpoint: /api/blockchain/token-price/history
