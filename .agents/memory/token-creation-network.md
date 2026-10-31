---
name: Token creation network
description: Network policy for newly created tokens
---

# Token creation network

New token creation is mainnet-only. Cross-coin pairs unlock when a launch token reaches $10,000 market cap using circulating supply × a 30-minute on-chain TWAP; there is no 30-day age gate. WGYDS pairs remain available for price discovery, and a recorded unlock is permanent.

**Why:** The user explicitly requires mainnet-only creation and a market-cap-based trading unlock rather than a time-based promotion.

**How to apply:** Preserve mainnet enforcement in both the token factory UI and `POST /api/tokens`; do not rely only on the database default. Price launches through token/WGYDS and WGYDS/USDT pools, enforce the threshold in the pair swap path, and do not add an age gate.