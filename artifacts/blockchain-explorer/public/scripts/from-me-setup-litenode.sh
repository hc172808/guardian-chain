#!/bin/bash
# GydsChain Lite Node Installer v1.0

set -e

# ─── CONFIG ─────────────────────────────
INSTALL_DIR="/opt/gydschain"
REPO_DIR="/opt/gydschain-chain"
REPO_URL="https://github.com/hc172808/guardian-chain.git"
SERVICE_NAME="gyds-litenode"
CHAIN_ID=13370
DATA_DIR="/var/lib/gydschain-lite"
LOG_DIR="/var/log/gydschain-lite"
BOOTNODE_ENODE=""   # <- replace with your Bootnode enode
RPC_URL=""          # <- optional, your RPC node URL
LITE_BINARY="$INSTALL_DIR/litenode"

# ─── CHECK ROOT ─────────────────────────
if [[ $EUID -ne 0 ]]; then
   echo "❌ Run as root: sudo bash setup-litenode.sh"
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

# ─── Step 3: Build lite binary ──────────
cd "$REPO_DIR"
if [ -d "blockchain-go" ]; then cd blockchain-go; fi
go build -ldflags="-s -w" -o "$LITE_BINARY" ./cmd/litenode
chmod +x "$LITE_BINARY"

# ─── Step 4: Create directories ──────────
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"

# ─── Step 5: Systemd service ────────────
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=GydsChain Lite Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=${LITE_BINARY} \\
  --datadir=${DATA_DIR} \\
  --chain-id=${CHAIN_ID} \\
  --bootnodes=${BOOTNODE_ENODE} \\
  --rpc=${RPC_URL}
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

# ─── Step 6: Firewall ────────────────────
ufw allow 30303/tcp >/dev/null
ufw allow 30303/udp >/dev/null
ufw reload >/dev/null

echo ""
echo "✅ Lite Node Installed Successfully!"
echo "Commands:"
echo "  systemctl status ${SERVICE_NAME}"
echo "  journalctl -u ${SERVICE_NAME} -f"
