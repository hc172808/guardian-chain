# GYDS Validator Node

The GYDS Chain PoS validator node. Participates in block proposal and consensus, earns staking rewards, and enforces slashing conditions.

## Requirements

- Go 1.22+
- 1000 GYDS staked
- Ubuntu 22.04+ (recommended)
- Open ports: 8543 (RPC), 30302 (P2P)

## Quick Install

```bash
GYDS_VALIDATOR_ADDRESS=0xYOUR_ADDRESS bash <(curl -s https://raw.githubusercontent.com/hc172808/validatornode/main/setup.sh)
```

## Manual Build

```bash
git clone https://github.com/hc172808/validatornode.git
cd validatornode
go mod tidy
go build -o gyds-validatornode .
```

## Run

```bash
# With environment variables
export GYDS_VALIDATOR_ADDRESS=0xYOUR_ADDRESS
export GYDS_VALIDATOR_KEY=0xYOUR_PRIVATE_KEY
export GYDS_BOOTSTRAP_NODES=tcp://genesis.netlifegy.com:30300

./gyds-validatornode start
```

## Docker

```bash
GYDS_VALIDATOR_ADDRESS=0xYOUR_ADDRESS docker-compose up -d
```

## Subcommands

| Command | Description |
|---|---|
| `start` | Start the validator node |
| `validator list` | Show all validators in the active set |
| `register --address 0x... --stake 1000` | Register as a validator |
| `status` | Print config and status |
| `version` | Print version |

## Validator JSON-RPC Methods

All standard Ethereum JSON-RPC methods (`eth_blockNumber`, `eth_getBalance`, etc.) plus:

| Method | Description |
|---|---|
| `validator_info` | Active set info, epoch, block time |
| `validator_set` | Full list of validators with stake/commission |
| `validator_getRewards` | Reward accrual for this validator |
| `validator_register` | Register a new validator address |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GYDS_CHAIN_ID` | `198282` | Network chain ID |
| `GYDS_RPC_PORT` | `8543` | JSON-RPC port |
| `GYDS_P2P_PORT` | `30302` | P2P port |
| `GYDS_BLOCK_TIME` | `120` | Block time in seconds |
| `GYDS_VALIDATOR_ADDRESS` | — | Your validator address |
| `GYDS_VALIDATOR_KEY` | — | Private key for signing |
| `GYDS_STAKE_REQUIRED` | `1000` | Minimum stake (GYDS) |
| `GYDS_COMMISSION_RATE` | `0.05` | Commission rate (5%) |
| `GYDS_BOOTSTRAP_NODES` | — | Bootstrap peer addresses |
| `GYDS_DATA_DIR` | `./data` | Blockchain data directory |
| `GYDS_LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |
