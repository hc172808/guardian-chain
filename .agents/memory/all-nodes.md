---
name: All node types
description: Supported local test-node types and network scope
---

# All node types

The local test-node manager supports seven node types: rpc, lite, fullnode, boostnode, validator, genesis, and bootnode. It supports mainnet and testnet only; devnet is retired. Mainnet uses chain ID 198282 and testnet uses chain ID 198281.

**Why:** The project now operates only mainnet and testnet, and retaining devnet in node state or UI would allow unsupported network requests to return misleading results.

**How to apply:** Keep network unions, API allowlists, node status shapes, wallet configuration, and admin selectors limited to mainnet/testnet. Reject devnet requests and ignore stale persisted devnet node state.