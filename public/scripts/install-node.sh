#!/bin/bash
# GydsChain Node Installer
# Usage: bash install-node.sh [validator|fullnode|rpc|litenode]
set -e

NODE_TYPE="${1:-fullnode}"
INSTALL_DIR="/opt/gydschain"
DATA_DIR="/var/lib/gydschain"
SERVICE_NAME="gydschain-${NODE_TYPE}"

# ─── Network Configuration ───────────────────────────────────
PRIMARY_RPC="https://rpc.netlifegy.com"
BACKUP_RPC_1="https://rpc2.netlifegy.com"
BACKUP_RPC_2="https://rpc3.netlifegy.com"
WS_ENDPOINT="wss://ws.netlifegy.com"
VPN_SERVER="vpn.netlifegy.com"
LOCAL_RPC="http://localhost:8546"
LOCAL_LAN="http://192.168.18.106:8546"
CHAIN_ID=13370

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         GydsChain Node Installer v1.0                    ║"
echo "║         Node Type: ${NODE_TYPE}                          ║"
echo "╚═══════════════════════════════════════════════════════════╝"

# Check OS
if ! grep -q "Ubuntu\|Debian" /etc/os-release 2>/dev/null; then
    echo "⚠️  Warning: This script is designed for Ubuntu/Debian. Proceeding anyway..."
fi

# Install dependencies
echo "📦 Installing dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq golang-go git build-essential libleveldb-dev wireguard-tools curl jq

# Create directories
sudo mkdir -p "$INSTALL_DIR" "$DATA_DIR"

# Build from source
echo "🔨 Building GydsChain node..."
cd /tmp
if [ -d "gydschain-build" ]; then rm -rf gydschain-build; fi
mkdir gydschain-build && cd gydschain-build

# Copy source (assumes repo is cloned)
if [ -d "/opt/gydschain-repo/blockchain-go" ]; then
    cp -r /opt/gydschain-repo/blockchain-go/* .
else
    echo "⚠️  Source not found. Please clone the repo to /opt/gydschain-repo first."
    echo "    git clone https://github.com/gydschain/gydschain-complete.git /opt/gydschain-repo"
    exit 1
fi

go build -o "$INSTALL_DIR/gydsd" ./cmd/fullnode/main.go
go build -o "$INSTALL_DIR/litenode" ./cmd/litenode/main.go

# Create environment file
cat > "$INSTALL_DIR/node.env" << EOF
# GydsChain Node Configuration
NODE_TYPE=${NODE_TYPE}
CHAIN_ID=${CHAIN_ID}
DATA_DIR=${DATA_DIR}

# RPC Endpoints (failover order)
PRIMARY_RPC=${PRIMARY_RPC}
BACKUP_RPC_1=${BACKUP_RPC_1}
BACKUP_RPC_2=${BACKUP_RPC_2}
WS_ENDPOINT=${WS_ENDPOINT}

# Local Node
LOCAL_RPC=${LOCAL_RPC}
LOCAL_LAN=${LOCAL_LAN}

# Network
P2P_PORT=8545
RPC_PORT=8546
MAX_PEERS=50
STORAGE_GB=100

# VPN
VPN_SERVER=${VPN_SERVER}
EOF

# Create systemd service
case "$NODE_TYPE" in
    validator|fullnode)
        EXEC_CMD="$INSTALL_DIR/gydsd --founder --datadir=$DATA_DIR --rpcport=8546 --p2pport=8545 --maxpeers=50 --storage=100"
        ;;
    rpc)
        EXEC_CMD="$INSTALL_DIR/gydsd --founder --datadir=$DATA_DIR --rpcport=8546 --p2pport=8545 --maxpeers=100 --storage=50"
        ;;
    litenode)
        EXEC_CMD="$INSTALL_DIR/litenode --rpc=$PRIMARY_RPC --datadir=$DATA_DIR"
        ;;
esac

sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=GydsChain ${NODE_TYPE} Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
EnvironmentFile=${INSTALL_DIR}/node.env
ExecStart=${EXEC_CMD}
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl start ${SERVICE_NAME}

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✅ GydsChain ${NODE_TYPE} installed successfully!       ║"
echo "║                                                          ║"
echo "║  Service: ${SERVICE_NAME}                                ║"
echo "║  Data:    ${DATA_DIR}                                    ║"
echo "║  Config:  ${INSTALL_DIR}/node.env                        ║"
echo "║                                                          ║"
echo "║  Commands:                                                ║"
echo "║    systemctl status ${SERVICE_NAME}                      ║"
echo "║    journalctl -u ${SERVICE_NAME} -f                      ║"
echo "╚═══════════════════════════════════════════════════════════╝"
