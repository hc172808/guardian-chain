---
name: All node types
description: Supported local test-node types and network scope
---

# All node types

The local test-node manager supports seven node types: rpc, lite, fullnode, boostnode, validator, genesis, and bootnode. It supports mainnet (198282), testnet (198281), and devnet (198283), with separate node state and port ranges.

**Why:** Network configuration now explicitly distinguishes all three requested chain IDs, and devnet needs to remain isolated from mainnet/testnet state.

**How to apply:** Keep network unions, API allowlists, node status shapes, wallet configuration, and admin selectors aligned across mainnet/testnet/devnet. Never fall back from testnet or devnet RPC requests to mainnet.