---
name: Token creation network
description: Network policy for newly created tokens
---

# Token creation network

New token creation is mainnet-only. Cross-coin pairs unlock at $10,000 market cap using on-chain `totalSupply()` × a 30-minute TWAP; supply is never entered as circulating supply. There is no 30-day age gate, and unlocks persist.

**Why:** The user requires mainnet-only creation, automatic wallet-visible supply from mainnet data, and a market-cap trading unlock rather than a time-based promotion.

**How to apply:** Read supply from the deployed contract, never trust cached/manual supply for the gate or wallet display, and fail closed if mainnet data is unavailable. Price through token/WGYDS and WGYDS/USDT pools; enforce the threshold in the pair swap path without an age gate.