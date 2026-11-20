---
name: Live RPC wiring
description: How the app connects to localhost blockchain nodes instead of mock data or netlifegy.com
---

# Live RPC wiring

## Decision
`GYDS_RPC_URL=http://localhost:8545` in both `.env` and `gyds-config.env`. Live data and transaction methods must not use mock fallbacks. `/api/rpc` may return the configured chain identity for `eth_chainId` and `net_version` while nodes are offline; all other methods still require a live matching RPC.

## Key facts
- `server/chainRpc.ts` `getRpcEndpoints()` returns: GYDS_RPC_URL first, then all mainnet local ports (8545, 8565, 8555, 8575, 8585, 8590, 8595) as fallbacks.
- Managed test nodes: mainnet RPC simulator uses 8547 so it does not collide with the installed RPC service on 8545; other node ports are unchanged. State persists in `test_node_state`; devnet is retired.
- `/api/rpc` verifies and briefly caches each endpoint's chain ID, skips mismatched endpoints, and returns canonical hex for `eth_chainId`. If no node is reachable, only `eth_chainId`/`net_version` fall back to configured network metadata; live data and transaction methods still fail explicitly.
- Wallet network-add requests advertise only the network-specific app `/api/rpc?network=...` endpoint and verify its `eth_chainId` first. EIP-3085 wallets can reject a chain if any advertised RPC URL is unavailable or reports a different chain ID.
- `/api/rpc/balance` tries managed nodes, then GYDS_RPC_URL, then DB-registered online nodes.
- `/api/network-stats`: probeRpc() helper queries managed test node → GYDS_RPC_URL → local port scan; removed fake `tps=1250` and `tokenPrice=0.0847` fallbacks; returns `null` for posFinality/avgBlockTime when chain is offline.
- Price-feed cron: reads `token_prices` table; skips alerts when no price in DB (no longer uses `Math.random()`).
- Perps markets `GET /api/perps/markets`: reads `token_prices` + live `perp_positions` OI at request time.
- Network-snapshot cron: queries live RPC directly; writes real block height + TPS; returns early without writing if RPC offline.
- Health-check cron: pings GYDS_RPC_URL via eth_blockNumber, shows real block number in result.

## Why
The old netlifegy.com endpoints all timeout. The in-process test nodes on localhost are the authoritative chain for development. All consumers should lazy-read `process.env.GYDS_RPC_URL` (never cache at module level) so admin config changes take effect without restart.
The reported Trust Wallet rejection was consistent with the legacy backup URLs being unhealthy: the app proxy returned the configured ID, `rpc.netlifegy.com` returned 502, and `rpc2`/`rpc3` timed out. Each URL in an EIP-3085 request must validate against the requested chain ID.
Wallets need a valid chain identity to add a network even when its node is down. Returning only configured identity metadata allows setup; returning fake balances, blocks, or transaction results would misrepresent network availability.

## How to apply
- When adding new routes that need chain data: use `chainRpc.ts` helpers (`getChainBlockNumber`, `getChainBalance`, etc.) — never hardcode netlifegy.com URLs.
- When adding a chain to an EVM wallet, send one RPC URL for that network and require canonical hex chain IDs from matching nodes. Offline identity metadata does not mean the network can serve data or transactions.
- When admin changes GYDS_RPC_URL via Server Config panel: `process.env.GYDS_RPC_URL` is updated in-place; all lazy readers pick it up immediately.
- To start/stop node networks: POST `/api/admin/test-nodes/:type/start` (requires admin session) or update `test_node_state` table directly + restart.
