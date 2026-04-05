#!/bin/bash
# GydsChain Node Installer v2.1.0
# Usage: bash install-node.sh [validator|fullnode|rpc|litenode]
# Domain: netlifegy.com | Chain ID: 13370
set -e

NODE_TYPE="${1:-fullnode}"
INSTALL_DIR="/opt/gydschain"
DATA_DIR="/var/lib/gydschain"
LOG_DIR="/var/log/gydschain"
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

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         GydsChain Node Installer v2.0                    ║"
echo "║         Node Type: ${NODE_TYPE}                          ║"
echo "║         Chain ID:  ${CHAIN_ID}                           ║"
echo "║         Domain:    netlifegy.com                         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check OS
if ! grep -q "Ubuntu\|Debian" /etc/os-release 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Warning: Designed for Ubuntu/Debian. Proceeding anyway...${NC}"
fi

# Check root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: Run as root (sudo bash install-node.sh)${NC}"
   exit 1
fi

# ─── Step 1: Install dependencies ────────────────────────────
echo -e "${GREEN}[1/8]${NC} Installing dependencies..."
apt-get update -qq
apt-get install -y -qq \
    golang-go git build-essential libleveldb-dev \
    wireguard-tools curl jq \
    ufw fail2ban iptables \
    logrotate

# ─── Step 2: Create directories ──────────────────────────────
echo -e "${GREEN}[2/8]${NC} Creating directories..."
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR" "$INSTALL_DIR/keys"

# ─── Step 3: Build from source ───────────────────────────────
echo -e "${GREEN}[3/8]${NC} Building GydsChain node..."
cd /tmp
if [ -d "gydschain-build" ]; then rm -rf gydschain-build; fi
mkdir gydschain-build && cd gydschain-build

if [ -d "/opt/gydschain-chain/blockchain-go" ]; then
    cp -r /opt/gydschain-chain/blockchain-go/* .
else
    echo -e "${YELLOW}⚠️  Source not found. Clone repo first:${NC}"
    echo "    git clone https://github.com/hc172808/guardian-chain.git /opt/gydschain-chain"
    exit 1
fi

go build -ldflags="-s -w" -o "$INSTALL_DIR/gydsd" ./cmd/fullnode/main.go
go build -ldflags="-s -w" -o "$INSTALL_DIR/litenode" ./cmd/litenode/main.go

# ─── Step 4: Configure firewall (UFW) ────────────────────────
echo -e "${GREEN}[4/8]${NC} Configuring firewall..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow ssh comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow 30303/tcp comment 'P2P TCP' >/dev/null
ufw allow 30303/udp comment 'P2P UDP' >/dev/null
ufw allow 8546/tcp comment 'RPC' >/dev/null
ufw allow 8545/tcp comment 'RPC Alt' >/dev/null
ufw allow 51820/udp comment 'WireGuard' >/dev/null
# Rate limit SSH
ufw limit ssh/tcp >/dev/null
ufw --force enable >/dev/null
echo -e "  UFW enabled with SSH rate limiting"

# ─── Step 5: Configure Fail2Ban ──────────────────────────────
echo -e "${GREEN}[5/8]${NC} Configuring Fail2Ban..."
cat > /etc/fail2ban/jail.d/gydschain.conf << 'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 3600
findtime = 600

[gyds-rpc]
enabled = true
port = 8545,8546
maxretry = 20
bantime = 1800
findtime = 300
logpath = /var/log/gydschain/rpc.log
filter = gyds-rpc

[gyds-p2p]
enabled = true
port = 30303
maxretry = 50
bantime = 600
findtime = 60
logpath = /var/log/gydschain/p2p.log
filter = gyds-p2p
EOF

# Create fail2ban filters
mkdir -p /etc/fail2ban/filter.d
cat > /etc/fail2ban/filter.d/gyds-rpc.conf << 'EOF'
[Definition]
failregex = ^.*RPC rate limit exceeded from <HOST>.*$
ignoreregex =
EOF

cat > /etc/fail2ban/filter.d/gyds-p2p.conf << 'EOF'
[Definition]
failregex = ^.*P2P connection rejected from <HOST>.*$
ignoreregex =
EOF

systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban >/dev/null 2>&1
echo -e "  Fail2Ban enabled for SSH, RPC, and P2P"

# ─── Step 6: Create environment file ─────────────────────────
echo -e "${GREEN}[6/8]${NC} Creating configuration..."
cat > "$INSTALL_DIR/node.env" << EOF
# GydsChain Node Configuration v2.0
NODE_TYPE=${NODE_TYPE}
CHAIN_ID=${CHAIN_ID}
DATA_DIR=${DATA_DIR}
LOG_DIR=${LOG_DIR}

# RPC Endpoints (failover order)
PRIMARY_RPC=${PRIMARY_RPC}
BACKUP_RPC_1=${BACKUP_RPC_1}
BACKUP_RPC_2=${BACKUP_RPC_2}
WS_ENDPOINT=${WS_ENDPOINT}

# Local Node
LOCAL_RPC=${LOCAL_RPC}
LOCAL_LAN=${LOCAL_LAN}

# Network
P2P_PORT=30303
RPC_PORT=8546
MAX_PEERS=50
STORAGE_GB=100

# Security
RATE_LIMIT_RPC=100
RATE_LIMIT_WINDOW=60
MAX_CONNECTIONS=200

# VPN
VPN_SERVER=${VPN_SERVER}

# Logging
LOG_LEVEL=info
EOF

# ─── Step 7: Create systemd service ──────────────────────────
echo -e "${GREEN}[7/8]${NC} Creating systemd service..."
case "$NODE_TYPE" in
    validator|fullnode)
        EXEC_CMD="$INSTALL_DIR/gydsd --founder --datadir=$DATA_DIR --rpcport=8546 --p2pport=30303 --maxpeers=50 --storage=100 --chain-id=$CHAIN_ID --log-level=info"
        ;;
    rpc)
        EXEC_CMD="$INSTALL_DIR/gydsd --founder --datadir=$DATA_DIR --rpcport=8546 --p2pport=30303 --maxpeers=100 --storage=50 --chain-id=$CHAIN_ID --log-level=info"
        ;;
    litenode)
        EXEC_CMD="$INSTALL_DIR/litenode --rpc=$PRIMARY_RPC --rpc-failover=$BACKUP_RPC_1,$BACKUP_RPC_2 --ws=$WS_ENDPOINT --datadir=$DATA_DIR --chain-id=$CHAIN_ID"
        ;;
esac

cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
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
StandardOutput=append:${LOG_DIR}/node.log
StandardError=append:${LOG_DIR}/error.log

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${DATA_DIR} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF

# ─── Step 8: Configure log rotation ─────────────────────────
echo -e "${GREEN}[8/8]${NC} Configuring log rotation..."
cat > /etc/logrotate.d/gydschain << EOF
${LOG_DIR}/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    postrotate
        systemctl reload ${SERVICE_NAME} 2>/dev/null || true
    endscript
}
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl start ${SERVICE_NAME}

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ GydsChain ${NODE_TYPE} installed successfully!       ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Configuration:${NC}"
echo -e "  Service:    ${SERVICE_NAME}"
echo -e "  Data:       ${DATA_DIR}"
echo -e "  Logs:       ${LOG_DIR}"
echo -e "  Config:     ${INSTALL_DIR}/node.env"
echo -e "  Chain ID:   ${CHAIN_ID}"
echo ""
echo -e "${CYAN}Security:${NC}"
echo -e "  UFW:        Enabled (SSH rate-limited)"
echo -e "  Fail2Ban:   Active for SSH, RPC, P2P"
echo -e "  Ports:      22, 80, 443, 8545, 8546, 30303, 51820"
echo ""
echo -e "${CYAN}Service Endpoints:${NC}"
echo -e "  rpc.netlifegy.com          - Main RPC"
echo -e "  rpc2.netlifegy.com         - Backup RPC #1"
echo -e "  rpc3.netlifegy.com         - Backup RPC #2"
echo -e "  ws.netlifegy.com           - WebSocket"
echo -e "  explorer.netlifegy.com     - Block Explorer"
echo -e "  vpn.netlifegy.com          - WireGuard VPN"
echo -e "  testnet-rpc.netlifegy.com  - Testnet RPC"
echo ""
echo -e "${CYAN}Commands:${NC}"
echo -e "  systemctl status ${SERVICE_NAME}"
echo -e "  journalctl -u ${SERVICE_NAME} -f"
echo -e "  fail2ban-client status"
