#!/bin/bash
# GydsChain RPC Node Installer v1.0

set -e

# ─── CONFIG ─────────────────────────────
INSTALL_DIR="/opt/gydschain"
REPO_DIR="/opt/gydschain-chain"
REPO_URL="https://github.com/hc172808/guardian-chain.git"
SERVICE_NAME="gyds-rpc"
CHAIN_ID=13370
DATA_DIR="/var/lib/gydschain-rpc"
LOG_DIR="/var/log/gydschain-rpc"
BOOTNODE_ENODE=""  # <- replace with your Bootnode enode
RPC_PORT=8546
FULLNODE_BINARY="$INSTALL_DIR/gydsd"

# ─── CHECK ROOT ─────────────────────────
if [[ $EUID -ne 0 ]]; then
   echo "❌ Run as root: sudo bash setup-rpc.sh"
   exit 1
fi

# ─── Step 1: Install dependencies ───────
echo "[1/7] Installing dependencies..."
apt-get update -qq
apt-get install -y -qq git golang-go build-essential ufw curl jq

# ─── Step 2: Clone repo ──────────────────
echo "[2/7] Cloning repository..."
if [ ! -d "$REPO_DIR" ]; then
    git clone "$REPO_URL" "$REPO_DIR"
else
    echo "⚠️ Repo exists, pulling latest..."
    cd "$REPO_DIR"
    git pull
fi

# ─── Step 3: Build binary ───────────────
echo "[3/7] Building fullnode binary..."
cd "$REPO_DIR"
if [ -d "blockchain-go" ]; then cd blockchain-go; fi
go build -ldflags="-s -w" -o "$FULLNODE_BINARY" ./cmd/fullnode
chmod +x "$FULLNODE_BINARY"

# ─── Step 4: Create directories ──────────
echo "[4/7] Creating data and log directories..."
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"

# ─── Step 5: Initialize genesis ─────────
echo "[5/7] Initializing node with genesis block..."
if [ ! -f "$DATA_DIR"/genesis.json ]; then
    echo "⚠️ Copy your genesis.json to $DATA_DIR/genesis.json first!"
    exit 1
fi
$FULLNODE_BINARY init "$DATA_DIR/genesis.json" --datadir "$DATA_DIR"

# ─── Step 6: Create systemd service ─────
echo "[6/7] Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=GydsChain RPC Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=${FULLNODE_BINARY} \\
  --datadir=${DATA_DIR} \\
  --networkid=${CHAIN_ID} \\
  --port=30303 \\
  --rpc \\
  --rpcaddr 0.0.0.0 \\
  --rpcport=${RPC_PORT} \\
  --bootnodes=${BOOTNODE_ENODE} \\
  --syncmode=full
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/node.log
StandardError=append:${LOG_DIR}/error.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl start ${SERVICE_NAME}

# ─── Step 7: Firewall ────────────────────
ufw allow 30303/tcp >/dev/null
ufw allow 30303/udp >/dev/null
ufw allow $RPC_PORT/tcp >/dev/null
ufw reload >/dev/null

echo ""
echo "========================================="
echo "✅ RPC Node Installed Successfully!"
echo "========================================="
echo "Commands:"
echo "  systemctl status ${SERVICE_NAME}"
echo "  journalctl -u ${SERVICE_NAME} -f"
