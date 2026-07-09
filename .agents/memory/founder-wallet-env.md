---
name: Founder wallet env var mismatch
description: FOUNDER_WALLET_ADDRESS vs FOUNDER_WALLET env var naming trap for privileged wallet detection
---
Founder-role/privileged-wallet checks in server/auth.ts, server/seed.ts, server/security.ts must read
`process.env.FOUNDER_WALLET_ADDRESS ?? process.env.FOUNDER_WALLET ?? <hardcoded default>` — never just one name.

**Why:** the .env/.env.template in this project use `FOUNDER_WALLET`/`ADMIN_WALLET`, but the original
seed/auth code only checked `FOUNDER_WALLET_ADDRESS`. A user setting their real wallet via `FOUNDER_WALLET`
silently never got founder role or firewall self-recovery — looked like "Web3 login is broken" but was a
naming mismatch, not a signature/nonce bug.

**How to apply:** whenever adding new privileged-wallet/env-based checks, always support both var names (or
better, standardize on one and update .env.template), and grep all three files together since they must stay
in sync.
