#!/data/data/com.termux/files/usr/bin/bash
# GydsChain Mobile Lite Node Installer v2.0
# For Termux (Android) - PUBLIC ACCESS
# Domain: netlifegy.com | Chain ID: 13370
set -euo pipefail

# Configuration
GYDS_VERSION="2.0.0"
CHAIN_ID=13370
GYDS_HOME="$HOME/.gyds"
BIN="$GYDS_HOME/bin"
DATA="$GYDS_HOME/data"
LOGS="$GYDS_HOME/logs"
WALLET="$GYDS_HOME/wallet"
WG_DIR="$GYDS_HOME/wireguard"

# Network endpoints
RPC_PRIMARY="https://rpc.netlifegy.com"
RPC_FAILOVER="https://rpc2.netlifegy.com,https://rpc3.netlifegy.com"
WS_ENDPOINT="wss://ws.netlifegy.com"
EXPLORER_URL="https://explorer.netlifegy.com"
VPN_ENDPOINT="vpn.netlifegy.com"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       GydsChain Mobile Installer v${GYDS_VERSION}                 ║"
echo "║       Chain ID: ${CHAIN_ID} | netlifegy.com               ║"
echo "║       Platform: Termux (Android)                          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Install dependencies ────────────────────────────
echo "📦 [1/6] Installing dependencies..."
pkg update -y
pkg install -y nodejs git curl jq openssl openssl-tool netcat-openbsd wireguard-tools tmux

for b in node git curl jq nc wg tmux; do
  command -v "$b" >/dev/null || { echo "❌ Missing $b"; exit 1; }
done
echo "✅ Dependencies installed"

# ─── Step 2: Create directories ──────────────────────────────
echo "📂 [2/6] Creating directories..."
mkdir -p "$BIN" "$DATA" "$DATA/blocks" "$LOGS" "$WALLET" "$WG_DIR"
chmod 700 "$GYDS_HOME"

# ─── Step 3: Generate wallet ─────────────────────────────────
echo "🔑 [3/6] Generating wallet..."
KEYFILE="$WALLET/node.json"
if [[ ! -f "$KEYFILE" ]]; then
    PRIV="$(openssl rand -hex 32)"
    ADDR="0x$(printf '%s' "$PRIV" | openssl dgst -sha256 | awk '{print $2}' | cut -c1-40)"
    jq -n --arg address "$ADDR" --arg private_key "$PRIV" \
        '{address:$address, private_key:$private_key}' > "$KEYFILE"
    chmod 600 "$KEYFILE"
fi

RPC_KEY_FILE="$GYDS_HOME/rpc.key"
[[ -f "$RPC_KEY_FILE" ]] || openssl rand -hex 32 > "$RPC_KEY_FILE"
RPC_KEY="$(cat "$RPC_KEY_FILE")"
NODE_ADDRESS="$(jq -r '.address' "$KEYFILE")"
echo "✅ Wallet ready: $NODE_ADDRESS"

# ─── Step 4: Create node configuration ───────────────────────
echo "⚙️  [4/6] Creating configuration..."
cat > "$GYDS_HOME/node.env" << EOF
# GydsChain Mobile Node Configuration v${GYDS_VERSION}
CHAIN_ID=$CHAIN_ID
DATA_DIR=$DATA
WALLET_FILE=$KEYFILE
RPC_BIND=0.0.0.0
RPC_PORT=9545
RPC_KEY=$RPC_KEY
COINS=GYD,GYDS

# Network endpoints
RPC_PRIMARY=$RPC_PRIMARY
RPC_FAILOVER=$RPC_FAILOVER
WS_ENDPOINT=$WS_ENDPOINT
EXPLORER_URL=$EXPLORER_URL
VPN_ENDPOINT=$VPN_ENDPOINT

# WireGuard
WG_DIR=$WG_DIR
FULLNODES_RPC=(
    "https://rpc.netlifegy.com"
    "https://rpc2.netlifegy.com"
    "https://rpc3.netlifegy.com"
)
EOF

# ─── Step 5: Create start/stop scripts ───────────────────────
echo "🚀 [5/6] Creating scripts..."

# Start script
cat > "$HOME/start-gyds.sh" << EOF
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
mkdir -p $LOGS

# Start Lite Node
export RPC_PRIMARY="$RPC_PRIMARY"
export RPC_FAILOVER="$RPC_FAILOVER"
export WS_ENDPOINT="$WS_ENDPOINT"

if [[ -f "$BIN/gyds-litenode" ]]; then
    nohup $BIN/gyds-litenode \\
        --rpc="$RPC_PRIMARY" \\
        --rpc-failover="$RPC_FAILOVER" \\
        --ws="$WS_ENDPOINT" \\
        --datadir="$DATA" \\
        --chain-id=$CHAIN_ID \\
        > $LOGS/node.log 2>&1 &
    echo \$! > $GYDS_HOME/pid.node
    echo "✅ GydsChain Lite Node started (PID: \$(cat $GYDS_HOME/pid.node))"
else
    echo "❌ Lite node binary not found at $BIN/gyds-litenode"
fi
EOF
chmod +x "$HOME/start-gyds.sh"

# Stop script
cat > "$HOME/stop-gyds.sh" << EOF
#!/data/data/com.termux/files/usr/bin/bash
[[ -f $GYDS_HOME/pid.node ]] && kill \$(cat $GYDS_HOME/pid.node) 2>/dev/null && echo "✅ Node stopped"
rm -f $GYDS_HOME/pid.node
EOF
chmod +x "$HOME/stop-gyds.sh"

# ─── Step 6: Setup Termux:Boot auto-start ────────────────────
echo "🔄 [6/6] Setting up auto-start..."
BOOT_DIR="$HOME/.termux/boot"
mkdir -p "$BOOT_DIR"

cat > "$BOOT_DIR/start-gyds.sh" << EOF
#!/data/data/com.termux/files/usr/bin/bash
sleep 5
bash $HOME/start-gyds.sh
EOF
chmod +x "$BOOT_DIR/start-gyds.sh"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✅ GydsChain Mobile Node v${GYDS_VERSION} installed!            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Configuration:"
echo "  Data:       $DATA"
echo "  Wallet:     $NODE_ADDRESS"
echo "  Chain ID:   $CHAIN_ID"
echo ""
echo "Service Endpoints:"
echo "  rpc.netlifegy.com          - Main RPC"
echo "  rpc2.netlifegy.com         - Backup RPC #1"
echo "  rpc3.netlifegy.com         - Backup RPC #2"
echo "  ws.netlifegy.com           - WebSocket"
echo "  explorer.netlifegy.com     - Block Explorer"
echo "  vpn.netlifegy.com          - WireGuard VPN"
echo "  testnet-rpc.netlifegy.com  - Testnet RPC"
echo ""
echo "Commands:"
echo "  Start:  bash ~/start-gyds.sh"
echo "  Stop:   bash ~/stop-gyds.sh"
echo "  Logs:   tail -f $LOGS/node.log"
echo ""
echo "⚠️  IMPORTANT: Save your wallet key securely!"
echo "   Location: $KEYFILE"
