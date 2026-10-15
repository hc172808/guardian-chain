---
name: Fullnode canonical source
description: Node installers use one fullnode repository for all supported runtime modes.
---

Production installers point to `https://github.com/hc172808/fullnode.git`. The workspace copy under `public/blockchain-go` is a different repository and is not authoritative for production.

The latest inspected canonical source describes its GYDS genesis inside the node code; its current installer configuration does not provide a verified runtime supply override. A genesis change changes the genesis hash, so every node on the network must be rebuilt from the same genesis and old state must be backed up before replacement.

The user approved coordinated resets of both mainnet (198282) and persistent testnet (198281) to 3B GYDS, using the app's six-wallet allocation proportions. This supersedes the prior 2B testnet target. The public recipient addresses still need explicit verification; do not use placeholder/precompile addresses for funded wallets.

**Why:** Separate local Go copies have drifted from the canonical source, and an uncoordinated supply change can make nodes disagree about chain state. The user explicitly approved a coordinated reset of both public networks and selected the app's allocation proportions.

**How to apply:** Before Go or installer changes, fetch and verify the canonical repository and inspect its current genesis/CLI support. Confirm real public recipient addresses for all six allocations. Back up each network, update the canonical source, build and verify matching genesis hashes for every peer, then reset only the two approved networks; never include devnet.