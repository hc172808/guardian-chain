---
name: netlifegy chain RPC endpoint behavior
description: Findings about which GYDS chain RPC endpoints actually respond, and a serious caveat about app.netlifegy.com/api/rpc's balance/transfer semantics.
---

**Reachability (as of 2026-07-13):** `rpc.netlifegy.com`, `rpc2.netlifegy.com`, `rpc3.netlifegy.com` all timeout on every JSON-RPC POST (TCP connects, TLS starts, then hangs ~6-15s) — this is what breaks wallets calling `wallet_addEthereumChain` → `eth_chainId` with "Could not fetch chain ID". Root cause looked server-side (Cloudflare Tunnel / node not responding), not a sandbox restriction.

**Working endpoint found:** `https://app.netlifegy.com/api/rpc` responds quickly and correctly to `eth_chainId` (0x3068a / 198282), `eth_blockNumber`, `net_version`.

**Caveat — treat this endpoint's balance/value semantics as untrustworthy:** `eth_getBalance` on this endpoint returns the exact same hardcoded value (`0xde0b6b3a7640000` = 1 GYDS) for every address queried, including freshly-generated addresses never funded and unrelated random addresses. A test transfer of 50 GYDS from an account "showing" only 1 GYDS balance was still accepted and returned a receipt with `status: 0x1`. This means the endpoint answers chain-ID/connectivity questions fine (good enough to fix wallet-add errors) but does **not** appear to enforce or reflect real per-account balances or reject overdrafts — it behaves like a mock/gateway layer, not a full validating node. Any real treasury-funded minting/burning built against it should not be trusted as financially authoritative until confirmed with the project owner or replaced with a genuine full/validator node RPC.
