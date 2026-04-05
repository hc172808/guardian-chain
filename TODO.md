# GYDS Chain — TODO / Known Issues

## Architecture — Self-Hosted Blockchain Integration
- [x] Edge function `blockchain-api` proxying to Go RPC at `rpc.netlifegy.com:8545`
- [x] Frontend API client (`src/lib/blockchainApi.ts`) routing through edge functions
- [x] Explorer, Dashboard, RecentBlocks wired to blockchain API
- [ ] Add SSL (HTTPS) to Go RPC endpoint for direct browser calls
- [ ] Migrate wallet creation to use Go RPC `personal_newAccount`
- [ ] Wire Wallet page balance display to `eth_getBalance` via blockchain API
- [ ] Wire send transaction to `eth_sendTransaction` via blockchain API
- [ ] Remove remaining Supabase-only data paths once Go RPC is stable
- [ ] Add transaction receipt polling for pending tx status updates

## Balance & Financial Logic
- [ ] **Audit balance overflow for large operations** — Ensure `numeric` DB type handles extreme values
- [ ] **Add unit tests for balance calculation** — Test edge cases
- [ ] **Implement server-side balance validation** — Currently client-side only
- [ ] **Handle Supabase 1000-row query limit** — Paginate or use DB aggregation

## Token Holders
- [ ] **Move holder calculation to DB function** — Client-side aggregation is slow
- [ ] **Track per-token holders separately**
- [ ] **Add holder count to token list page**

## Security & Integrity
- [ ] **Server-side transaction signing** — Never expose private keys in frontend
- [ ] **Input validation on all edge function endpoints** (zod schemas)
- [ ] **Rate limiting on wallet creation and tx send**
- [ ] **Prevent double-spend on bridge** — Add idempotency keys
- [ ] **Validate operation_type values at DB level**

## UX Improvements
- [ ] **Show loading state while balance is being calculated**
- [ ] **Add transaction receipt/confirmation modal**
- [ ] **Improve error messages**
- [ ] **Add balance refresh button**

## Infrastructure
- [ ] **Database indexing on blocks/transactions tables** (Go node PostgreSQL)
- [ ] **Pagination for blocks/transactions** (cursor-based)
- [ ] **Create DB index on token_operations(status, wallet_address)**
- [ ] **Create DB index on transactions(user_id, status)**
- [ ] **WebSocket reconnection improvements**
