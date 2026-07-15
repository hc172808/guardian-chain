#!/usr/bin/env bash
# GydsChain Geth node entrypoint
# Downloads genesis.json from dashboard if not present, then runs Geth.
set -e

GENESIS="$DATA_DIR/genesis.json"
GETH_DATA="$DATA_DIR/geth"
KEYSTORE="$DATA_DIR/keystore"

echo "[gyds] GydsChain Geth node starting…"
echo "[gyds] Chain ID: $CHAIN_ID | Data dir: $DATA_DIR"

# ── Step 1: Get genesis.json ──────────────────────────────────────────────────
if [ ! -f "$GENESIS" ]; then
  if [ -n "$GENESIS_URL" ]; then
    echo "[gyds] Downloading genesis.json from $GENESIS_URL …"
    curl -fsSL "$GENESIS_URL" -o "$GENESIS" || {
      echo "[gyds] ERROR: Failed to download genesis.json from $GENESIS_URL"
      exit 1
    }
    echo "[gyds] genesis.json downloaded."
  elif [ -f "/etc/gyds/genesis.json" ]; then
    cp /etc/gyds/genesis.json "$GENESIS"
    echo "[gyds] genesis.json copied from /etc/gyds/."
  else
    echo "[gyds] ERROR: No genesis.json found."
    echo "[gyds]   Mount one at /etc/gyds/genesis.json  OR"
    echo "[gyds]   Set GENESIS_URL=https://your-dashboard.com/api/chain/genesis.json"
    exit 1
  fi
fi

# ── Step 2: Initialize chain if not already done ──────────────────────────────
if [ ! -d "$GETH_DATA/chaindata" ]; then
  echo "[gyds] Initializing chain with genesis.json …"
  geth --datadir "$DATA_DIR" init "$GENESIS"
  echo "[gyds] Chain initialized."
fi

# ── Step 3: Build flags ────────────────────────────────────────────────────────
BOOTNODE_FLAGS=""
if [ -n "$BOOTNODE_ENODE" ]; then
  BOOTNODE_FLAGS="--bootnodes $BOOTNODE_ENODE"
fi

UNLOCK_FLAGS=""
if [ -n "$SIGNER_ADDRESS" ] && [ -n "$SIGNER_PASSWORD_FILE" ]; then
  UNLOCK_FLAGS="--unlock $SIGNER_ADDRESS --password $SIGNER_PASSWORD_FILE --mine"
  echo "[gyds] Validator mode: unlocking signer $SIGNER_ADDRESS"
fi

# ── Step 4: Start Geth ─────────────────────────────────────────────────────────
echo "[gyds] Starting Geth RPC on :$RPC_PORT …"
exec geth \
  --datadir "$DATA_DIR" \
  --networkid "$CHAIN_ID" \
  --http \
  --http.addr "0.0.0.0" \
  --http.port "$RPC_PORT" \
  --http.corsdomain "*" \
  --http.api "eth,net,web3,txpool,debug" \
  --http.vhosts "*" \
  --ws \
  --ws.addr "0.0.0.0" \
  --ws.port "$WS_PORT" \
  --ws.origins "*" \
  --ws.api "eth,net,web3" \
  --port "$P2P_PORT" \
  --maxpeers 50 \
  --syncmode "full" \
  --gcmode "archive" \
  --allow-insecure-unlock \
  --nat "any" \
  $BOOTNODE_FLAGS \
  $UNLOCK_FLAGS \
  2>&1
