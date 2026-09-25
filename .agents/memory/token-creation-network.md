---
name: Token creation network
description: Network policy for newly created tokens
---

# Token creation network

New token creation is mainnet-only. The client sends mainnet explicitly, and the server overwrites any client-supplied network value with mainnet before inserting the token. Legacy testnet tokens remain supported for historical promotion workflows.

**Why:** The product no longer launches new tokens on devnet or testnet.

**How to apply:** Preserve mainnet enforcement in both the token factory UI and `POST /api/tokens`; do not rely only on the database default.