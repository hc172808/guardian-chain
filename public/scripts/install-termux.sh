#!/data/data/com.termux/files/usr/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Mobile (Termux/Android) Lite Node Installer
#  Builds the REAL gyds-litenode binary from public/blockchain-go/ source.
#  Run inside Termux on Android:  bash install-termux.sh
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GYDS_VERSION="2.1.0"
CHAIN_ID="${CHAIN_ID:-13370}"
GYDS_HOME="${GYDS_HOME:-$HOME/.gyds}"
BIN="$GYDS_HOME/bin"
DATA="$GYDS_HOME/data"
LOGS="$GYDS_HOME/logs"
WALLET="$GYDS_HOME/wallet"

RPC_PRIMARY="https://rpc.netlifegy.com"
RPC_FAILOVER="https://rpc2.netlifegy.com,https://rpc3.netlifegy.com"
WS_ENDPOINT="wss://ws.netlifegy.com"
EXPLORER_URL="https://explorer.netlifegy.com"

SRC_DIR="${SRC_DIR:-$(cd "$(dirname "$0")/../blockchain-go" 2>/dev/null && pwd || echo "")}"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   GYDSchain MOBILE Installer v${GYDS_VERSION}                    ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Termux (Android)             ║"
echo "╚═══════════════════════════════════════════════════════════╝"

# ─── 1. Termux packages ────────────────────────────────────────────
echo "📦 [1/6] Installing Termux packages..."
pkg update -y
pkg install -y golang git curl jq openssl openssl-tool nodejs tmux build-essential
for b in go git curl jq openssl tmux; do
  command -v "$b" >/dev/null || { echo "❌ Missing $b after install"; exit 1; }
done
echo "    $(go version)"

# ─── 2. Directories ────────────────────────────────────────────────
echo "📂 [2/6] Creating directories..."
mkdir -p "$BIN" "$DATA" "$DATA/blocks" "$LOGS" "$WALLET"
chmod 700 "$GYDS_HOME"

# ─── 3. Source ─────────────────────────────────────────────────────
if [[ -z "$SRC_DIR" || ! -d "$SRC_DIR/cmd/litenode" ]]; then
  echo "🌐 [3/6] Source not provided locally — cloning from GitHub..."
  REPO_URL="${REPO_URL:-https://github.com/hc172808/guardian-chain.git}"
  REPO_DIR="$GYDS_HOME/repo"
  if [[ -d "$REPO_DIR/.git" ]]; then
    ( cd "$REPO_DIR" && git pull --ff-only )
  else
    git clone --depth=1 "$REPO_URL" "$REPO_DIR"
  fi
  SRC_DIR="$REPO_DIR/public/blockchain-go"
  [[ -d "$SRC_DIR/cmd/litenode" ]] || { echo "❌ Source missing in repo"; exit 1; }
else
  echo "📁 [3/6] Using local source: $SRC_DIR"
fi

# ─── 4. Build litenode ─────────────────────────────────────────────
echo "🔨 [4/6] Building gyds-litenode (this can take a few minutes on phone)..."
BUILD_TMP="$(mktemp -d)"
cp -r "$SRC_DIR" "$BUILD_TMP/blockchain-go"
( cd "$BUILD_TMP/blockchain-go" && go mod download && go build -ldflags "-s -w" -o "$BIN/gyds-litenode" ./cmd/litenode )
rm -rf "$BUILD_TMP"
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
DATA_DIR=$DATA
WALLET_FILE=$KEYFILE
RPC_PRIMARY=$RPC_PRIMARY
RPC_FAILOVER=$RPC_FAILOVER
WS_ENDPOINT=$WS_ENDPOINT
EXPLORER_URL=$EXPLORER_URL
EOF

cat > "$HOME/start-gyds.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
mkdir -p "$LOGS"
nohup "$BIN/gyds-litenode" \\
    --rpc="$RPC_PRIMARY" \\
    --rpc-failover="$RPC_FAILOVER" \\
    --ws="$WS_ENDPOINT" \\
    --datadir="$DATA" \\
    --chain-id=$CHAIN_ID \\
    --wallet="$KEYFILE" \\
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

  Start:  bash ~/start-gyds.sh
  Stop:   bash ~/stop-gyds.sh
  Logs:   tail -f $LOGS/node.log
EOF
