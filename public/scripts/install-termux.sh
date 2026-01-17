#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

echo "🚀 Starting FULL GYDS Mobile Setup (Complete Version with node.env)..."

# -----------------------------
# 1️⃣ Install dependencies
# -----------------------------
pkg update -y
pkg install -y nodejs git curl jq openssl openssl-tool netcat-openbsd wireguard-tools util-linux tmux

for b in node git curl jq nc wg wg-quick tmux; do
  command -v "$b" >/dev/null || { echo "[FATAL] Missing $b"; exit 1; }
done
echo "✅ Dependencies installed"

# -----------------------------
# 2️⃣ Setup GYDS directories
# -----------------------------
GYDS_HOME="$HOME/.gyds"
BIN="$GYDS_HOME/bin"
DATA="$GYDS_HOME/data"
BLOCKS="$DATA/blocks"
LOGS="$GYDS_HOME/logs"
WALLET="$GYDS_HOME/wallet"
WG_DIR="$GYDS_HOME/wireguard"

mkdir -p "$BIN" "$DATA" "$BLOCKS" "$LOGS" "$WALLET" "$WG_DIR"
chmod 700 "$GYDS_HOME"

# -----------------------------
# 3️⃣ Install lite node if missing
# -----------------------------
if [[ ! -f "$BIN/gyds-litenode" ]]; then
  echo "[!] Lite node not found, installing..."
  if [[ ! -f "$HOME/install-termux-gyds.sh" ]]; then
    curl -o "$HOME/install-termux-gyds.sh" https://raw.githubusercontent.com/hc172808/gydschain-litenode/main/install-termux-gyds.sh
  fi
  bash "$HOME/install-termux-gyds.sh"
fi
echo "✅ Lite node installed"

# -----------------------------
# 4️⃣ Generate wallet + RPC key
# -----------------------------
KEYFILE="$WALLET/node.json"
if [[ ! -f "$KEYFILE" ]]; then
  PRIV="$(openssl rand -hex 32)"
  ADDR="0x$(printf '%s' "$PRIV" | openssl dgst -sha256 | awk '{print $2}' | cut -c1-40)"
  jq -n --arg address "$ADDR" --arg private_key "$PRIV" '{address:$address, private_key:$private_key}' > "$KEYFILE"
  chmod 600 "$KEYFILE"
fi

RPC_KEY_FILE="$GYDS_HOME/rpc.key"
[[ -f "$RPC_KEY_FILE" ]] || openssl rand -hex 32 > "$RPC_KEY_FILE"
RPC_KEY="$(cat "$RPC_KEY_FILE")"
NODE_ADDRESS="$(jq -r '.address' "$KEYFILE")"
echo "✅ Wallet & RPC key ready: $NODE_ADDRESS"

# -----------------------------
# 5️⃣ Create node.env automatically
# -----------------------------
NODE_ENV="$GYDS_HOME/node.env"
cat > "$NODE_ENV" <<EOF
CHAIN_ID=13370
DATA_DIR=$DATA
BLOCKS_DIR=$BLOCKS
WALLET_FILE=$KEYFILE
RPC_BIND=0.0.0.0
RPC_PORT=9545
RPC_KEY=$RPC_KEY
COINS=GYD,GYDS
WG_DIR=$WG_DIR

FULLNODES_WG=(
  "<FULLNODE1_PUBLIC_KEY>|<FULLNODE1_HOST>:51820"
  "<FULLNODE2_PUBLIC_KEY>|<FULLNODE2_HOST>:51820"
)

FULLNODES_RPC=(
  "http://10.0.0.1:9545"
  "http://10.0.0.2:9545"
)
EOF
echo "✅ node.env created with CHAIN_ID=13370"

# -----------------------------
# 6️⃣ Clone React dashboard
# -----------------------------
DASH_HOME="$HOME/gyds-dashboard"
if [[ ! -d "$DASH_HOME" ]]; then
  git clone https://github.com/hc172808/gydschain-hybrid-l1.git "$DASH_HOME"
fi
mkdir -p "$DASH_HOME/logs"

# -----------------------------
# 7️⃣ Fix package.json and install react-scripts
# -----------------------------
cat > "$DASH_HOME/package.json" <<'EOF'
{
  "name": "gyds-dashboard",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "^5.0.1",
    "web-vitals": "^2.1.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": ["react-app","react-app/jest"]
  },
  "browserslist": {
    "production": [">0.2%","not dead","not op_mini all"],
    "development": ["last 1 chrome version","last 1 firefox version","last 1 safari version"]
  }
}
EOF

cd "$DASH_HOME"
npm install
echo "✅ Dashboard fixed and dependencies installed"

# -----------------------------
# 8️⃣ Inject RPC & WS config
# -----------------------------
cat > "$DASH_HOME/.env" <<EOF
REACT_APP_RPC=http://localhost:9545
REACT_APP_WS=ws://localhost:9546
EOF

# -----------------------------
# 9️⃣ Setup Termux:Boot auto-start
# -----------------------------
BOOT_DIR="$HOME/storage/shared/TermuxBoot"
mkdir -p "$BOOT_DIR"

AUTO_START="$BOOT_DIR/start-gyds.sh"
cat > "$AUTO_START" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
sleep 5

mkdir -p $LOGS
mkdir -p $DASH_HOME/logs

# Start Lite Node
nohup $BIN/gyds-litenode > $LOGS/node.log 2>&1 &
echo \$! > $GYDS_HOME/pid.node

# Start React Dashboard
cd $DASH_HOME
nohup npm start -- --host 0.0.0.0 > $DASH_HOME/logs/react.log 2>&1 &
echo \$! > $DASH_HOME/pid.react

echo "[AUTO-START] GYDS Lite Node + Dashboard started"
EOF
chmod +x "$AUTO_START"

# -----------------------------
# 10️⃣ Create manual start script
# -----------------------------
START_SCRIPT="$HOME/start-gyds-mobile.sh"
cat > "$START_SCRIPT" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

mkdir -p $LOGS
mkdir -p $DASH_HOME/logs

# Lite Node
nohup $BIN/gyds-litenode > $LOGS/node.log 2>&1 &
echo \$! > $GYDS_HOME/pid.node

# React Dashboard
cd $DASH_HOME
nohup npm start -- --host 0.0.0.0 > $DASH_HOME/logs/react.log 2>&1 &
echo \$! > $DASH_HOME/pid.react

echo "✅ GYDS Lite Node + Dashboard started manually"
EOF
chmod +x "$START_SCRIPT"

# -----------------------------
# 11️⃣ Finish
# -----------------------------
echo ""
echo "🎉 Full mobile setup complete!"
echo "- Manual start: bash $START_SCRIPT"
echo "- Auto-start on boot: Termux:Boot enabled ($AUTO_START)"
echo "- Open dashboard: http://127.0.0.1:3000"
echo "- Lite node logs: $LOGS/node.log"
echo "- Dashboard logs: $DASH_HOME/logs/react.log"
