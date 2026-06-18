# GYDS Lite Node (Header-Only Sync)

## What Changed

The lite node is now **header-only — it never produces blocks**. It:

1. Syncs block headers from full nodes via RPC
2. Validates each header's ECDSA signature against the known validator set
3. Verifies the chain links (prevHash matches previous header)
4. Supports SPV (Simple Payment Verification) proofs
5. Exposes a local HTTP API for status and header queries

## Architecture

```
Full Node / Validator
      ↓ (RPC: eth_getBlockByNumber)
Lite Node
  ├── Header Sync Manager (pulls + validates headers)
  ├── Validator Set (known addresses from env or config)
  ├── Local API (GET /status, /headers/latest, /spv/verify)
  └── SPV Prover (merkle path verification)
```

## No Block Production

- Removed `PoS engine` — lite nodes never produce or validate blocks
- Removed `mining` — `EnableMining` is hardcoded to `false` and ignored if set
- Removed `staking` — lite nodes have no stake

## Files to Copy

Copy these files into `github.com/hc172808/litenode`:

- `go.mod` — module `github.com/gydschain/litenode`
- `config/config.go` — LiteNodeConfig (header-only settings)
- `header-sync/sync.go` — SyncManager with ECDSA validation + SPV
- `main.go` — entry point with API server

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LITE_RPC_ENDPOINTS` | `http://localhost:8545` | Comma-separated full-node RPC URLs |
| `LITE_SYNC_INTERVAL` | `5s` | How often to poll for new headers |
| `LITE_VALIDATORS` | *(empty)* | Comma-separated validator addresses (0x...) |
| `LITE_SPV` | `true` | Enable SPV proof verification |
| `LITE_RPC_PORT` | `3000` | Local API port |
| `LITE_DATADIR` | `~/.gyds-litenode` | Data directory |

## Build

```bash
cd litenode
go mod tidy
go build -o bin/gyds-litenode .
```

## Run

```bash
# Sync from a local full node
export LITE_RPC_ENDPOINTS="http://localhost:8545"
export LITE_VALIDATORS="0x0000000000000000000000000000000000000001"
./bin/gyds-litenode

# API output:
# GET http://localhost:3000/status
# {"node": "gyds-litenode", "version": "2.2.0", "mode": "header-only", ...}
```
