---
name: Fullnode canonical source
description: Node installers use one fullnode repository for all supported runtime modes.
---

Production installers point to `https://github.com/hc172808/fullnode.git`. The workspace copy under `public/blockchain-go` is a different repository and is not authoritative for production.

The canonical source describes GYDS genesis inside the node code; installer supply flags are not a verified runtime override. Never assume a balance change alters the peer genesis hash—verify this explicitly. The prior header used a constant zero state root, so different allocations could advertise the same genesis hash.

The user approved coordinated resets of both mainnet (198282) and persistent testnet (198281) to 3B GYDS, using the app's six-wallet allocation proportions. This supersedes the prior 2B testnet target. The six public recipients have now been supplied and format-checked; keep the actual addresses in the genesis configuration, not in memory, and never substitute placeholder/precompile addresses.

**Why:** Separate local Go copies have drifted from the canonical source, and a genesis hash that omits allocations cannot protect peers from divergent initial balances. The user explicitly approved a coordinated reset of both public networks and selected the app's allocation proportions.

**How to apply:** Before Go or installer changes, fetch and verify the canonical repository and inspect its current genesis/CLI support. Test that changing any initial allocation changes the genesis hash and that allocation ordering is deterministic. Back up each network, build the same canonical revision for every peer, verify matching chain IDs/hashes and exact 3B totals, then reset only the two approved networks; never include devnet.