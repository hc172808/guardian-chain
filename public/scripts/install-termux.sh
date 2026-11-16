#!/data/data/com.termux/files/usr/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Mobile (Termux/Android) Lite Node Installer
#  Builds the bundled local node-fixes/litenode source.
#  Run inside Termux on Android:  bash install-termux.sh
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GYDS_VERSION="2.1.0"
CHAIN_ID="${CHAIN_ID:-198282}"
RPC_PORT="${GYDS_RPC_PORT:-8545}"
P2P_PORT="${GYDS_P2P_PORT:-30303}"
DASHBOARD_PORT="${GYDS_DASHBOARD_PORT:-5000}"
BOOTSTRAP_NODES="${GYDS_BOOTSTRAP_NODES:-}"
GYDS_HOME="${GYDS_HOME:-$HOME/.gyds}"
BIN="$GYDS_HOME/bin"
DATA="${GYDS_DATA_DIR:-$GYDS_HOME/data-fullnode}"
LOGS="$GYDS_HOME/logs"
WALLET="$GYDS_HOME/wallet"

EXPLORER_URL="https://explorer.netlifegy.com"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-}"
if [[ -z "$PROJECT_ROOT" ]]; then
  if [[ -f "$SCRIPT_DIR/../../node-fixes/litenode/go.mod" ]]; then
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  else
    PROJECT_ROOT="/var/www/gydschain"
  fi
fi
SRC_DIR="${SRC_DIR:-${PROJECT_ROOT}/node-fixes/litenode}"

case "$CHAIN_ID" in
  198282) NETWORK="mainnet" ;;
  198281) NETWORK="testnet" ;;
  *)
    echo "❌ Unsupported CHAIN_ID '$CHAIN_ID'. Use 198282 (mainnet) or 198281 (testnet)." >&2
    exit 1
    ;;
esac

if [[ -n "$BOOTSTRAP_NODES" && ! "$BOOTSTRAP_NODES" =~ ^[A-Za-z0-9:./,_-]+$ ]]; then
  echo "❌ GYDS_BOOTSTRAP_NODES may contain only host:port entries separated by commas." >&2
  exit 1
fi

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   GYDSchain MOBILE Installer v${GYDS_VERSION}                    ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Termux (Android)             ║"
echo "╚═══════════════════════════════════════════════════════════╝"

# ─── 1. Termux packages ────────────────────────────────────────────
echo "📦 [1/6] Installing Termux packages..."
pkg update -y
pkg install -y golang curl jq openssl openssl-tool nodejs tmux build-essential
for b in go curl jq openssl tmux; do
  command -v "$b" >/dev/null || { echo "❌ Missing $b after install"; exit 1; }
done
echo "    $(go version)"

# ─── 2. Directories ────────────────────────────────────────────────
echo "📂 [2/6] Creating directories..."
mkdir -p "$BIN" "$DATA" "$DATA/blocks" "$LOGS" "$WALLET"
chmod 700 "$GYDS_HOME"
if [[ -d "$GYDS_HOME/data" && "$DATA" != "$GYDS_HOME/data" ]]; then
  echo "⚠️  Legacy data at $GYDS_HOME/data is untouched; canonical node data will sync in $DATA."
fi

# ─── 3. Local source ───────────────────────────────────────────────
echo "📁 [3/6] Using bundled local source: $SRC_DIR"
if [[ ! -f "$SRC_DIR/go.mod" ]] || ! grep -Fqx 'module github.com/gydschain/litenode' "$SRC_DIR/go.mod"; then
  echo "❌ Expected bundled module github.com/gydschain/litenode at $SRC_DIR" >&2
  exit 1
fi

# ─── 4. Build local lite node binary ────────────────────────────────
echo "🔨 [4/6] Building the local lite node (this can take a few minutes on phone)..."
BUILD_TMP="$(mktemp -d)"
trap 'rm -rf "${BUILD_TMP:-}"' EXIT
( cd "$SRC_DIR" && GOTOOLCHAIN=auto go mod download && \
  GOTOOLCHAIN=auto go build -ldflags "-s -w -X main.version=${GYDS_VERSION}" \
    -o "$BUILD_TMP/gyds-litenode" . )
install -m 0755 "$BUILD_TMP/gyds-litenode" "$BIN/gyds-litenode"
rm -rf "$BUILD_TMP"
trap - EXIT
echo "    Built: $BIN/gyds-litenode"

# ─── 5. Wallet ─────────────────────────────────────────────────────
echo "🔑 [5/6] Generating wallet..."
KEYFILE="$WALLET/node.json"
if [[ ! -f "$KEYFILE" ]]; then
    PRIV="$(openssl rand -hex 32)"
    ADDR="0x$(printf '%s' "$PRIV" | openssl dgst -sha256 | awk '{print $2}' | cut -c1-40)"
    jq -n --arg address "$ADDR" --arg private_key "$PRIV" \
        '{address:$address, private_key:$private_key}' > "$KEYFILE"
    chmod 600 "$KEYFILE"
fi
NODE_ADDRESS="$(jq -r '.address' "$KEYFILE")"
echo "    Wallet: $NODE_ADDRESS"

# ─── 6. Start/stop scripts + auto-boot ─────────────────────────────
echo "🚀 [6/6] Creating scripts..."
cat > "$GYDS_HOME/node.env" <<EOF
CHAIN_ID=$CHAIN_ID
NETWORK=$NETWORK
DATA_DIR=$DATA
GYDS_NODE_MODE=lite
GYDS_NETWORK=$NETWORK
GYDS_CHAIN_ID=$CHAIN_ID
GYDS_DATA_DIR=$DATA
GYDS_RPC_HOST=127.0.0.1
GYDS_RPC_PORT=$RPC_PORT
GYDS_P2P_PORT=$P2P_PORT
GYDS_DASHBOARD_PORT=$DASHBOARD_PORT
GYDS_BOOTSTRAP_NODES=$BOOTSTRAP_NODES
GYDS_LOG_FORMAT=json
WALLET_FILE=$KEYFILE
EXPLORER_URL=$EXPLORER_URL
LITE_DATADIR=$DATA
LITE_RPC_PORT=$RPC_PORT
LITE_RPC_ENDPOINTS=${GYDS_LITE_RPC_ENDPOINTS:-https://rpc.netlifegy.com}
LITE_LOG_LEVEL=info
EOF

cat > "$HOME/start-gyds.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
set -a
source "$GYDS_HOME/node.env"
set +a
if [[ -z "\${GYDS_BOOTSTRAP_NODES:-}" ]]; then
    echo "❌ Set GYDS_BOOTSTRAP_NODES in $GYDS_HOME/node.env before starting; otherwise the lite node cannot sync."
    exit 1
fi
mkdir -p "$LOGS"
nohup "$BIN/gyds-litenode" \\
    > "$LOGS/node.log" 2>&1 &
echo \$! > "$GYDS_HOME/pid.node"
echo "✅ Lite node started (PID: \$(cat "$GYDS_HOME/pid.node"))"
EOF
chmod +x "$HOME/start-gyds.sh"

cat > "$HOME/stop-gyds.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
[[ -f "$GYDS_HOME/pid.node" ]] && kill \$(cat "$GYDS_HOME/pid.node") 2>/dev/null && echo "✅ Stopped"
rm -f "$GYDS_HOME/pid.node"
EOF
chmod +x "$HOME/stop-gyds.sh"

# Termux:Boot autostart (only if Termux:Boot is installed)
BOOT_DIR="$HOME/.termux/boot"
mkdir -p "$BOOT_DIR"
cat > "$BOOT_DIR/start-gyds.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
sleep 5
bash "$HOME/start-gyds.sh"
EOF
chmod +x "$BOOT_DIR/start-gyds.sh"

cat <<EOF

╔═══════════════════════════════════════════════════════════╗
║  ✅ GYDSchain Mobile Lite Node v${GYDS_VERSION} installed       ║
╚═══════════════════════════════════════════════════════════╝
  Wallet:    $NODE_ADDRESS
  Key file:  $KEYFILE   ⚠️  BACK THIS UP
  Data:      $DATA
  Logs:      $LOGS/node.log
  Chain ID:  $CHAIN_ID
  RPC:       http://127.0.0.1:$RPC_PORT
  WebSocket: ws://127.0.0.1:$RPC_PORT/api/ws
  Bootstrap: ${BOOTSTRAP_NODES:-not configured}

  Start:  bash ~/start-gyds.sh
  Stop:   bash ~/stop-gyds.sh
  Logs:   tail -f $LOGS/node.log
EOF
