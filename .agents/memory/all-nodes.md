---
name: All node types
description: Supported local test-node types and network scope
---

# All node types

The local test-node manager supports seven node types: rpc, lite, fullnode, boostnode, validator, genesis, and bootnode. It supports mainnet (198282), testnet (198281), and devnet (198283), with separate node state and port ranges.

**Why:** Network configuration now explicitly distinguishes all three requested chain IDs, and devnet needs to remain isolated from mainnet/testnet state.

**How to apply:** Keep network unions, API allowlists, node status shapes, wallet configuration, and admin selectors aligned across mainnet/testnet/devnet. Never fall back from testnet or devnet RPC requests to mainnet.

## Guest network selection

Visitors must be able to choose Mainnet, Testnet, or Devnet before signing in.

**Why:** The user asked to let signed-out visitors change from the Testnet default to any supported network.

**How to apply:** Keep network selection available on the sign-in screen and the guest mobile experience; do not gate it behind authentication.