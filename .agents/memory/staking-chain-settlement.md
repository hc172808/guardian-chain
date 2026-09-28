---
name: Staking chain settlement
description: Staking must settle GYD through the chain transfer RPC before the database position is committed.
---

The staking ledger is downstream of the chain transfer: stake debits the user's GYD balance and credits the configured pool through `gyds_sendTransaction` with token `GYD`; unstake reverses that transfer before committing the position update. The local test node accepts the named `staking-pool` account, but production requires `STAKING_POOL_ADDRESS` to be a real deployed staking contract or approved custody address.

**Why:** Database-only staking left the wallet balance unchanged and fabricated transaction hashes, so users could not see funds leave their wallet.

**How to apply:** Never reintroduce a successful staking response without a successful chain transfer. Reconcile pre-existing ledger positions carefully when configuring the production pool so users are not double-debited.