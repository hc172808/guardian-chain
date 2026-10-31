---
name: Token creation network
description: Network policy for newly created tokens
---

# Token creation network

New token creation is mainnet-only. The user wants tokens to be tradable against any coin once market cap reaches $10,000, measured as circulating supply × live price; there should be no 30-day age requirement for that trading unlock. Legacy testnet tokens remain supported for historical workflows.

**Why:** The user explicitly requires mainnet-only creation and a market-cap-based trading unlock rather than a time-based promotion.

**How to apply:** Preserve mainnet enforcement in both the token factory UI and `POST /api/tokens`; do not rely only on the database default. Calculate the $10,000 threshold from circulating supply × live price and do not add an age gate.