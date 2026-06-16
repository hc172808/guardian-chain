# GYDS Genesis Node

The origin and bootstrap node for the GYDSchain network. Runs from block 0, archives all state, and acts as the primary P2P bootstrap peer for all other nodes.

**Chain ID:** 13370 | **RPC:** port 8544 | **P2P:** port 30300 | **Binary:** `gyds-genesis`

## Quick Setup

```bash
# Clone both repos side by side
git clone https://github.com/hc172808/fullnode.git
git clone https://github.com/hc172808/genesis.git
cd genesis

# Run setup (copies shared packages from fullnode, fixes imports, builds)
bash setup.sh

# Init genesis.json (replace with your real validator address)
./bin/gyds-genesis init --validators 0xYOUR_FOUNDER_ADDRESS --output genesis.json

# Start the genesis node
./bin/gyds-genesis start
```

## Docker

```bash
# After running setup.sh (to populate core/, consensus/, p2p/, rpc/)
docker compose up -d
```

## CLI Commands

| Command | Description |
|---|---|
| `gyds-genesis start` | Start the genesis node |
| `gyds-genesis init --validators 0xADDR --output genesis.json` | Generate genesis.json |
| `gyds-genesis export-genesis` | Export block 0 from running chain |
| `gyds-genesis version` | Print version |

## Ports

| Port | Protocol | Purpose |
|---|---|---|
| 8544 | TCP | JSON-RPC HTTP |
| 8545 | TCP | WebSocket RPC |
| 30300 | TCP/UDP | P2P networking (bootstrap) |

## After Starting

Once running, give all other nodes your server's P2P address as their bootstrap peer:

```bash
GYDS_BOOTSTRAP_NODES=<GENESIS_SERVER_IP>:30300
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GYDS_CHAIN_ID` | `13370` | Chain ID |
| `GYDS_RPC_PORT` | `8544` | JSON-RPC port |
| `GYDS_P2P_PORT` | `30300` | P2P port |
| `GYDS_DATA_DIR` | `./data` | Chain data directory |
| `GYDS_LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |
| `GYDS_BLOCK_TIME` | `5` | Block time in seconds |
| `GYDS_ARCHIVE_MODE` | `true` | Never prune state (archive node) |
| `GYDS_GENESIS_FILE` | `./genesis.json` | Path to genesis.json |

## Repo Structure

After running `setup.sh`, the repo will contain:

```
genesis/
├── main.go           # Genesis node entry point + CLI commands
├── config/           # Genesis-specific config (ports, archive mode)
├── core/             # Copied from fullnode — block, chain, genesis, tx
├── consensus/        # Copied from fullnode — PoS engine
├── p2p/              # Copied from fullnode — peer management + gossip
├── rpc/              # Copied from fullnode — JSON-RPC server
├── go.mod            # module github.com/gydschain/genesis
├── Dockerfile
├── docker-compose.yml
├── setup.sh          # Bootstrap script (copies packages from fullnode)
└── README.md
```

> `core/`, `consensus/`, `p2p/`, `rpc/` are copied from the fullnode repo by `setup.sh` and are **not committed** to this repo. Add them to `.gitignore` or regenerate with `setup.sh` on a fresh clone.
