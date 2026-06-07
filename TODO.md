# GYDSchain — Project TODO & Roadmap
> Last updated: June 2026  |  Chain ID: 13370  |  Dual coin: GYDS + GYD

---

## Legend
- `[x]` Done  `[ ]` Not started  `[~]` In progress  `[!]` Blocked

---

## PHASE 1 — Foundation (Complete)
- [x] Vite + React 18 + TypeScript + Tailwind + shadcn/ui scaffold
- [x] Supabase Auth (email/password, magic link)
- [x] Three-tier role system: `user` / `admin` / `founder`
- [x] Wallet creation with encrypted seed + PIN
- [x] Node installer scripts (fullnode, litenode, bootnode, localnode)
- [x] WireGuard VPN integration for node security
- [x] Transaction history with RLS
- [x] Admin console (node approval, user management, token control)
- [x] Token factory (freeze/update/mint authorities, LP locking)
- [x] Launchpad with bonding curves (linear, exponential, sigmoid)
- [x] Liquidity pools + DEX swap interface
- [x] Validator dashboard + staking delegation
- [x] Network explorer (blocks, tokens, transactions)
- [x] Faucet with 24h cooldown (GYD + GYDS, per token type independent)
- [x] AI security firewall + DDoS protection
- [x] Firewall rules / fail2ban / IP access list admin panels
- [x] Audit log system
- [x] Documentation CMS
- [x] Feature toggles
- [x] Devnet → Mainnet token promotion flow
- [x] Price oracle (admin-managed, GYDS/USD + GYD/USD feeds)
- [x] Token watchlist + price alerts
- [x] Mining dashboard (RandomX CPU + kHeavyHash GPU)
- [x] WebSocket live feed (block/tx stream)
- [x] Vitest test suite (faucet cooldown, RLS regression, mining holders)
- [x] Comprehensive SQL schema (all current + future tables, idempotent)
- [x] Deploy scripts: fullnode, litenode, localnode, dashboard, remote fullnode

---

## PHASE 2 — DeFi Expansion
- [x] **Cross-chain bridge** — expanded to 25 networks (EVM + non-EVM) with live prices
  - [x] Ethereum ↔ GYDSchain bridge (lock/mint model)
  - [x] BNB Chain bridge + Avalanche, Arbitrum, Optimism, Base, zkSync, Linea, Fantom, Cronos
  - [ ] Bridge fee config in `admin_config`
  - [ ] Bridge status tracker in wallet page
- [x] **Advanced order book DEX** — limit, market, stop-limit orders + live book UI
  - [ ] Limit orders, stop-limit, TWAP, iceberg orders
  - [ ] Order book depth chart
  - [ ] Trade history (public feed)
- [x] **Yield vaults** — 5 vaults with auto-compound, lock-up, APY calculator
  - [ ] Auto-compound strategy for GYDS staking
  - [ ] LP fee compounding vault
  - [ ] Vault APY calculator
- [ ] **Perpetuals & options** (schema TBD)
  - [ ] Long/short positions on GYDS/USD
  - [ ] Funding rate mechanism
- [ ] **Prediction markets** (schema TBD)
  - [ ] Binary outcome markets (yes/no)
  - [ ] Price prediction (higher/lower)
- [ ] Improve liquidity pool analytics (volume chart, fee distribution)
- [ ] Flash loan circuit breaker

---

## PHASE 3 — Governance & DAO
> Tables: `governance_proposals`, `governance_votes`, `governance_treasury`

- [x] **Governance UI page** (`/governance`) — proposals, voting, treasury
  - [ ] Proposal list (active, passed, rejected)
  - [ ] Proposal detail + voting interface
  - [ ] Create proposal form (parameter / treasury / upgrade / grant)
  - [ ] Voting power calculator (based on staked GYDS)
- [x] **DAO treasury panel** — multi-coin balance + spending history
  - [ ] Treasury balance display (multi-coin)
  - [ ] Spending history
  - [ ] Grant application flow
- [ ] On-chain proposal execution (payload dispatch to chain)
- [ ] Delegation of voting power (liquid democracy)
- [ ] Emergency governance (fast-track critical proposals)
- [ ] Quadratic voting option

---

## PHASE 4 — NFT Ecosystem
> Tables: `nft_collections`, `nft_tokens`, `nft_marketplace_listings`

- [x] **NFT marketplace page** (`/nft`) — browse, buy, mint, collections
  - [ ] Collection browser with floor price / volume
  - [ ] Individual NFT detail + buy/offer/list
  - [ ] Rarity ranking display
- [x] **NFT minting interface** — single mint + metadata editor
  - [ ] Single mint + batch mint
  - [ ] Metadata editor (name, description, attributes)
  - [ ] IPFS upload integration (Pinata or NFT.Storage)
- [ ] **NFT creator tools**
  - [ ] Royalty configuration
  - [ ] Whitelist/allowlist minting
  - [ ] Reveal mechanics (delayed reveal)
- [ ] Dynamic NFTs (on-chain metadata that updates with validator performance)
- [ ] NFT staking for yield

---

## PHASE 5 — Identity & Reputation
> Tables: `kyc_records`, `on_chain_identities`, `did_documents`, `sanctions_list`

- [x] **On-chain identity page** (`/identity`) — DID, claims, KYC tiers, reputation
  - [ ] DID creation (`did:gyds:<address>`)
  - [ ] Verified claims display
  - [ ] Reputation score visualization
- [ ] **KYC integration** (UI only, no PII in DB)
  - [ ] Tier 0 → Tier 3 upgrade flow
  - [ ] KYC required gate for RWA + large launches
  - [ ] Plug-in provider interface (Sumsub, Onfido, Persona)
- [ ] Sanctions screening on wallet creation and bridge usage
- [ ] Social link verification (Twitter, Telegram proof-of-ownership)
- [ ] Soulbound tokens for identity verification

---

## PHASE 6 — Real-World Assets (RWA)
> Tables: `rwa_assets`, `rwa_holdings`

- [x] **RWA marketplace page** (`/rwa`) — real estate, bonds, commodities, invoices
  - [ ] Asset listing (real estate, bonds, commodities, invoices)
  - [ ] Investment interface (buy/sell RWA tokens)
  - [ ] Yield tracking dashboard
- [ ] Legal document CID storage (IPFS links)
- [ ] Jurisdiction compliance checker (block restricted countries)
- [ ] Yield distribution automation (periodic payouts to holders)
- [ ] Secondary market for RWA tokens

---

## PHASE 7 — Social & Community
> Tables: `community_posts`, `community_comments`, `referrals`

- [x] **Community forum** (`/community`) — posts, votes, comments, referral system
  - [ ] Post list with filter by type (discussion, showcase, idea)
  - [ ] Rich text post editor
  - [ ] Nested comments
  - [ ] Upvote/downvote system
- [x] **Referral system** — unique codes, reward tracking
  - [ ] Unique referral code per user
  - [ ] Referral tracking dashboard
  - [ ] Reward distribution (% of referred user's fees)
- [ ] Trader profiles (public wallet stats, badges, portfolio)
- [ ] Follow system (follow traders / validators)
- [ ] Token-gated community channels

---

## PHASE 8 — Advanced Analytics
> Tables: `price_history`, `network_snapshots`, `node_metrics_history`

- [x] **Analytics dashboard** (`/analytics`) — OHLCV charts, heatmap, network metrics
  - [ ] GYDS price OHLCV chart (candlestick + volume bars)
  - [ ] Network health time-series (nodes, stake, TPS)
  - [ ] On-chain activity heatmap (daily/hourly tx count)
- [ ] Token analytics page improvements
  - [ ] Holder concentration (whale / retail breakdown)
  - [ ] LP inflow/outflow tracking
- [ ] Mining profitability calculator v2 (electricity cost input)
- [ ] Validator performance history charts
- [ ] Automated network snapshot cron (edge function, every hour)
- [ ] Export to CSV / PDF reports

---

## PHASE 9 — Multi-Sig & Enterprise
> Tables: `multisig_wallets`, `multisig_transactions`, `multisig_signatures`

- [x] **Multi-sig wallet page** (`/multisig`) — create, propose, approve, execute
  - [ ] Create 2-of-3, 3-of-5, etc. wallets
  - [ ] Propose transaction interface
  - [ ] Co-signer approval/rejection UI
  - [ ] Transaction execution on threshold met
- [ ] Hardware wallet support (Ledger, Trezor via WebHID)
- [ ] Enterprise treasury management
- [ ] Multi-sig for DAO treasury spend

---

## PHASE 10 — Notifications & Webhooks
> Tables: `user_notifications`, `webhook_endpoints`, `webhook_deliveries`

- [x] In-app notification bell + notification drawer (desktop header)
- [ ] Email notifications (Supabase SMTP or Resend)
- [ ] Push notifications (Web Push API)
- [ ] **Webhook management page** in user settings
  - [ ] Register endpoint URL + secret
  - [ ] Choose event subscriptions (tx confirmed, price alert hit, etc.)
  - [ ] Delivery log + retry UI
- [ ] Price alert notifications (email + push when target hit)
- [ ] Governance proposal notifications

---

## PHASE 11 — API Access & Developer Portal
> Tables: `api_keys`, `api_usage_logs`

- [x] **Developer portal page** (`/developer`) — API keys, docs, playground, SDKs
  - [ ] API key generation (with scope selection)
  - [ ] Usage dashboard (requests/day, rate limit status)
  - [ ] Interactive API documentation (Swagger/OpenAPI)
- [ ] REST API wrapper over Supabase (Edge Functions)
  - [ ] GET /v1/network/stats
  - [ ] GET /v1/tokens
  - [ ] GET /v1/blocks/:height
  - [ ] GET /v1/address/:address/balance
  - [ ] POST /v1/transactions/submit
- [ ] SDK: JavaScript/TypeScript client (`@gydschain/sdk`)
- [ ] SDK: Python client (`gydschain-py`)
- [ ] GraphQL endpoint (via PostgREST or Hasura)

---

## PHASE 12 — Oracle Network
> Tables: `oracle_feeds`, `oracle_submissions`

- [ ] **Oracle admin panel** (in admin console)
  - [ ] Feed configuration (heartbeat, deviation)
  - [ ] Submission history + aggregation view
- [ ] Decentralized oracle node (Go binary extension)
  - [ ] Fetch price from 3+ external sources
  - [ ] Median aggregation with outlier rejection
  - [ ] Submit to Supabase `oracle_submissions`
- [ ] On-chain oracle contract integration
- [ ] Chainlink Data Feed fallback

---

## PHASE 13 — Insurance Protocol
> Tables: `insurance_pools`, `insurance_policies`

- [ ] Insurance pool UI (`/insurance`)
  - [ ] Pool list (coverage type, premium rate, TVL)
  - [ ] Buy coverage interface
  - [ ] Active policies dashboard
- [ ] Claims process (evidence submission + DAO vote)
- [ ] Underwriter staking (earn premiums by providing capital)
- [ ] Parametric insurance (auto-trigger on oracle data)

---

## PHASE 14 — Gamification
> Tables: `achievements`, `user_achievements`, `user_xp`

- [ ] XP / level system wire-up (award XP on key actions)
  - [ ] First transaction → 50 XP
  - [ ] First node deployed → 200 XP
  - [ ] First delegation → 100 XP
  - [ ] First token created → 300 XP
  - [ ] 30-day streak → 500 XP
- [ ] Achievement badges UI (profile page)
- [x] Global leaderboard (`/leaderboard`) — XP, traders, validators, miners
  - [ ] Top validators, top traders, top node operators
  - [ ] Monthly reset leaderboard
- [ ] Seasonal campaigns (bonus XP events)

---

## PHASE 15 — Mobile App
- [ ] React Native / Expo wrapper
  - [ ] Wallet (send, receive, swap)
  - [ ] Node status monitoring
  - [ ] Notifications (push)
  - [ ] Price alerts
- [ ] Biometric authentication (Face ID / fingerprint)
- [ ] QR code scanner for wallet addresses
- [ ] iOS + Android app store submissions

---

## INFRASTRUCTURE & DEVOPS
- [ ] Supabase Edge Functions
  - [ ] `faucet-claim` — cooldown enforcement + dispense (skeleton exists)
  - [ ] `health-check` — chain RPC health probe (exists)
  - [ ] `network-stats` — aggregate chain stats (exists)
  - [ ] `price-updater` — pull oracle prices, update `token_price`
  - [ ] `snapshot-recorder` — hourly `network_snapshots` insert
  - [ ] `notifications-dispatcher` — fan out price alerts
  - [ ] `webhook-dispatcher` — relay events to user endpoints
  - [ ] `kyc-callback` — receive KYC provider webhooks
- [ ] Automated DB backups (Supabase scheduled backup enabled)
- [ ] Node metrics auto-pruner cron (90-day retention)
- [ ] Multi-region deployment (Supabase + CDN)
- [ ] Load testing (k6 or Vegeta) before mainnet launch
- [ ] Penetration test + security audit
- [ ] Bug bounty program setup

---

## SECURITY HARDENING
- [ ] ZK proof of wallet ownership (no seed exposure on login)
- [ ] Rate limiting on all Supabase RPC calls
- [ ] Encrypted message channel (E2E messaging between wallets)
- [ ] Anti-bot CAPTCHA on faucet (hCaptcha)
- [ ] CSP hardening for dashboard
- [ ] SBOM (software bill of materials) generation
- [ ] Dependency audit CI gate (`npm audit --audit-level=high`)

---

## CONTENT & MARKETING
- [ ] Landing page (`/`) — hero, tokenomics, roadmap, team
- [ ] Press kit (logo assets, brand colors, chain stats)
- [ ] Blog / news section
- [ ] Community airdrop campaigns
- [ ] Validator onboarding guide (video walkthrough)
- [ ] YouTube channel setup (node install walkthroughs)

---

## KNOWN BUGS / TECH DEBT
- [ ] Replace hardcoded `192.168.18.106` IP remaining in `src/config/tokens.ts` with `VITE_RPC_LAN` env var
- [ ] Remove Vite `optimizeDeps.esbuildOptions` deprecation warning (upgrade vite-plugin-react-swc)
- [ ] node_installations `updated_at` trigger fires on every heartbeat — switch to `last_heartbeat` column only
- [ ] Wallet seed storage: consider migrating from `encrypted_seed TEXT` to Supabase Vault for secrets
- [ ] Token price alert trigger: currently polling — convert to Postgres notify + edge function
- [ ] `ip_access_list` vs `ip_address_list` — migration 20260308140818 uses old name; alias or rename

---

## LONG-TERM VISION (5–10 years)
- [ ] Layer-2 rollup on GYDSchain (ZK-rollup for high-throughput)
- [ ] Privacy transactions (Groth16 ZK-SNARK for shielded transfers)
- [ ] Decentralized storage integration (IPFS pinning node bundled)
- [ ] AI trading agent marketplace (permissioned, audited strategies)
- [ ] Cross-chain DEX aggregator (route across 10+ chains)
- [ ] Physical card (GYDS debit card, GYD stablecoin settlement)
- [ ] Enterprise SDK (corporate treasury management on-chain)
- [ ] GYDSchain mobile miner (Termux-based, earns rewards on phone)
- [ ] Tokenized carbon credits (RWA extension)
- [ ] Decentralized DNS (`.gyds` domains mapped to wallet addresses)
