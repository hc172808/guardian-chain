#!/usr/bin/env bash
# ============================================================
# GYDS Chain — Genesis Block Initialisation
# Creates the genesis.json, initialises chain state, and
# optionally starts a bootstrap validator node.
# Usage: bash genesis-init.sh [--datadir /data/gyds] [--validators N]
# ============================================================
set -euo pipefail

GYDS_CHAIN_ID="${GYDS_CHAIN_ID:-1337}"
GYDS_NETWORK_NAME="${GYDS_NETWORK_NAME:-GYDS Chain}"
GYDS_DATADIR="${GYDS_DATADIR:-./data/genesis}"
NUM_VALIDATORS="${NUM_VALIDATORS:-3}"
GENESIS_SUPPLY="${GENESIS_SUPPLY:-1000000000}"
GYDS_TOKEN_SYMBOL="${GYDS_TOKEN_SYMBOL:-GYD}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --datadir)     GYDS_DATADIR="$2";     shift 2 ;;
    --chain-id)    GYDS_CHAIN_ID="$2";    shift 2 ;;
    --validators)  NUM_VALIDATORS="$2";   shift 2 ;;
    --supply)      GENESIS_SUPPLY="$2";   shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[GENESIS]${NC} $*"; }
info() { echo -e "${CYAN}  →${NC} $*"; }

TIMESTAMP=$(date -u +%s)
TIMESTAMP_HEX=$(printf '0x%x' "$TIMESTAMP")

log "Initialising GYDS genesis block..."
log "Chain ID    : ${GYDS_CHAIN_ID}"
log "Network     : ${GYDS_NETWORK_NAME}"
log "Validators  : ${NUM_VALIDATORS}"
log "Total Supply: ${GENESIS_SUPPLY} ${GYDS_TOKEN_SYMBOL}"
log "Data Dir    : ${GYDS_DATADIR}"

mkdir -p "${GYDS_DATADIR}"/{keystore,chaindata}

SUPPLY_WEI=$(python3 -c "print(${GENESIS_SUPPLY} * 10**18)" 2>/dev/null || \
  node -e "console.log((BigInt(${GENESIS_SUPPLY}) * BigInt(10)**BigInt(18)).toString())" 2>/dev/null || \
  echo "${GENESIS_SUPPLY}000000000000000000")

declare -a VALIDATORS
VALIDATOR_ALLOC=""
for i in $(seq 1 "${NUM_VALIDATORS}"); do
  ADDR=$(printf "0x%040d" "$i")
  VALIDATORS+=("$ADDR")
  ALLOC_SHARE=$(python3 -c "print(int(${GENESIS_SUPPLY}/${NUM_VALIDATORS} * 10**18))" 2>/dev/null || \
    echo "333333333333333333333333333")
  VALIDATOR_ALLOC="${VALIDATOR_ALLOC}    \"${ADDR}\": { \"balance\": \"${ALLOC_SHARE}\", \"nonce\": 0 }"
  if [[ $i -lt $NUM_VALIDATORS ]]; then
    VALIDATOR_ALLOC="${VALIDATOR_ALLOC},"
  fi
  VALIDATOR_ALLOC="${VALIDATOR_ALLOC}
"
  info "Validator $i: ${ADDR}"
done

VALIDATORS_JSON=$(printf '"%s"' "${VALIDATORS[0]}")
for v in "${VALIDATORS[@]:1}"; do
  VALIDATORS_JSON="${VALIDATORS_JSON}, \"${v}\""
done

cat > "${GYDS_DATADIR}/genesis.json" <<GENESIS
{
  "chainId": ${GYDS_CHAIN_ID},
  "networkName": "${GYDS_NETWORK_NAME}",
  "token": {
    "symbol": "${GYDS_TOKEN_SYMBOL}",
    "name": "GYDS Token",
    "decimals": 18,
    "totalSupply": "${GENESIS_SUPPLY}"
  },
  "timestamp": "${TIMESTAMP_HEX}",
  "timestampUnix": ${TIMESTAMP},
  "gasLimit": "0x1C9C380",
  "gasPrice": "0x3B9ACA00",
  "difficulty": "0x1",
  "mixHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "extraData": "0x$(echo -n "${GYDS_NETWORK_NAME}" | xxd -p | tr -d '\n')",
  "consensus": "pos",
  "validators": [${VALIDATORS_JSON}],
  "validatorStakeMin": "1000000000000000000000",
  "epochLength": 100,
  "blockTime": 5,
  "alloc": {
${VALIDATOR_ALLOC}  }
}
GENESIS

log "Genesis block file written: ${GYDS_DATADIR}/genesis.json"

cat > "${GYDS_DATADIR}/network.env" <<ENV
GYDS_CHAIN_ID=${GYDS_CHAIN_ID}
GYDS_NETWORK_NAME=${GYDS_NETWORK_NAME}
GYDS_TOKEN_SYMBOL=${GYDS_TOKEN_SYMBOL}
GYDS_GENESIS_TIMESTAMP=${TIMESTAMP}
GYDS_VALIDATOR_COUNT=${NUM_VALIDATORS}
ENV

log "Network environment file written: ${GYDS_DATADIR}/network.env"

cat > "${GYDS_DATADIR}/README.md" <<README
# GYDS Chain Genesis

- Chain ID: ${GYDS_CHAIN_ID}
- Network: ${GYDS_NETWORK_NAME}
- Created: $(date -u)
- Validators: ${NUM_VALIDATORS}
- Supply: ${GENESIS_SUPPLY} ${GYDS_TOKEN_SYMBOL}

## Files
- \`genesis.json\` — genesis block configuration
- \`network.env\`  — environment variables for node scripts
- \`keystore/\`    — validator key files (add your keys here)
- \`chaindata/\`   — blockchain state (populated on first run)

## Bootstrap a node with this genesis
\`\`\`bash
source network.env
GYDS_DATADIR=${GYDS_DATADIR} bash setup-litenode.sh
\`\`\`
README

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Genesis Block Initialised!              ${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "  Genesis file: ${GYDS_DATADIR}/genesis.json"
echo "  Chain ID    : ${GYDS_CHAIN_ID}"
echo "  Validators  : ${NUM_VALIDATORS}"
echo "  Supply      : ${GENESIS_SUPPLY} ${GYDS_TOKEN_SYMBOL}"
echo ""
echo "  Next steps:"
echo "    1. Distribute genesis.json to all node operators"
echo "    2. Source network.env before running node scripts"
echo "    3. Run: bash setup-litenode.sh --datadir ${GYDS_DATADIR}"
