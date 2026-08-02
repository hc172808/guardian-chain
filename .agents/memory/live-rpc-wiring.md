---
name: Live RPC wiring
description: How the app connects to localhost blockchain nodes instead of mock data or netlifegy.com
---

# Live RPC wiring

## Decision
`GYDS_RPC_URL=http://localhost:8545` in both `.env` and `gyds-config.env`. All mock/hardcoded fallbacks removed from the server.

## Key facts
- `server/chainRpc.ts` `getRpcEndpoints()` returns: GYDS_RPC_URL first, then all mainnet local ports (8545, 8565, 8555, 8575, 8585, 8590, 8595) as fallbacks.
- Managed test nodes: mainnet (8545–8595), testnet (8600–8606), devnet (8650–8656). State persisted in `test_node_state` DB table (`should_run` column). Mainnet nodes were disabled — enabled via: `UPDATE test_node_state SET should_run=true WHERE id LIKE 'mainnet:%'`.
- `/api/rpc` proxy now tries managed nodes first, then GYDS_RPC_URL, then all local mainnet ports — never returns 503 if any port is up.
- `/api/rpc/balance` tries managed nodes, then GYDS_RPC_URL, then DB-registered online nodes.
- `/api/network-stats`: probeRpc() helper queries managed test node → GYDS_RPC_URL → local port scan; removed fake `tps=1250` and `tokenPrice=0.0847` fallbacks; returns `null` for posFinality/avgBlockTime when chain is offline.
- Price-feed cron: reads `token_prices` table; skips alerts when no price in DB (no longer uses `Math.random()`).
- Perps markets `GET /api/perps/markets`: reads `token_prices` + live `perp_positions` OI at request time.
- Network-snapshot cron: queries live RPC directly; writes real block height + TPS; returns early without writing if RPC offline.
- Health-check cron: pings GYDS_RPC_URL via eth_blockNumber, shows real block number in result.

## Why
The old netlifegy.com endpoints all timeout. The in-process test nodes on localhost are the authoritative chain for development. All consumers should lazy-read `process.env.GYDS_RPC_URL` (never cache at module level) so admin config changes take effect without restart.

## How to apply
- When adding new routes that need chain data: use `chainRpc.ts` helpers (`getChainBlockNumber`, `getChainBalance`, etc.) — never hardcode netlifegy.com URLs.
- When admin changes GYDS_RPC_URL via Server Config panel: `process.env.GYDS_RPC_URL` is updated in-place; all lazy readers pick it up immediately.
- To start/stop node networks: POST `/api/admin/test-nodes/:type/start` (requires admin session) or update `test_node_state` table directly + restart.
