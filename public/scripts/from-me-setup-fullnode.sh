#!/bin/bash
# GydsChain Full Node Installer v1.0

set -e

# ─── CONFIG ─────────────────────────────
INSTALL_DIR="/opt/gydschain"
REPO_DIR="/opt/gydschain-chain"
REPO_URL="https://github.com/hc172808/guardian-chain.git"
SERVICE_NAME="gyds-fullnode"
CHAIN_ID=13370
DATA_DIR="/var/lib/gydschain-full"
LOG_DIR="/var/log/gydschain-full"
BOOTNODE_ENODE=""  # <- replace with your Bootnode enode
FULLNODE_BINARY="$INSTALL_DIR/gydsd"
RPC_PORT=8546

# ─── CHECK ROOT ─────────────────────────
if [[ $EUID -ne 0 ]]; then
   echo "❌ Run as root: sudo bash setup-fullnode.sh"
   exit 1
fi

# ─── Step 1: Install dependencies ───────
apt-get update -qq
apt-get install -y -qq git golang-go build-essential ufw curl jq

# ─── Step 2: Clone repo ──────────────────
if [ ! -d "$REPO_DIR" ]; then
    git clone "$REPO_URL" "$REPO_DIR"
else
    cd "$REPO_DIR"
    git pull
fi

# ─── Step 3: Build binary ───────────────
cd "$REPO_DIR"
if [ -d "blockchain-go" ]; then cd blockchain-go; fi
go build -ldflags="-s -w" -o "$FULLNODE_BINARY" ./cmd/fullnode
chmod +x "$FULLNODE_BINARY"

# ─── Step 4: Create directories ──────────
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"

# ─── Step 5: Initialize genesis ─────────
if [ ! -f "$DATA_DIR"/genesis.json ]; then
    echo "⚠️ Copy genesis.json to $DATA_DIR first!"
    exit 1
fi
$FULLNODE_BINARY init "$DATA_DIR/genesis.json" --datadir "$DATA_DIR"

# ─── Step 6: Systemd service ────────────
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=GydsChain Full Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=${FULLNODE_BINARY} \\
  --datadir=${DATA_DIR} \\
  --networkid=${CHAIN_ID} \\
  --bootnodes=${BOOTNODE_ENODE} \\
  --port=30303 \\
  --rpc \\
  --rpcaddr 0.0.0.0 \\
  --rpcport=${RPC_PORT} \\
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
echo "✅ Full Node Installed Successfully!"
echo "Commands:"
echo "  systemctl status ${SERVICE_NAME}"
echo "  journalctl -u ${SERVICE_NAME} -f"
