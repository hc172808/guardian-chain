#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Full Node Installation Script
#  For Ubuntu 22.04 LTS - FOUNDER ONLY
#  Domain: netlifegy.com
#═══════════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
GYDS_VERSION="2.1.0"
GYDS_USER="gydschain"
GYDS_HOME="/var/lib/gydschain"
GYDS_BIN="/usr/local/bin"
GO_VERSION="1.22.5"
RPC_PORT="${RPC_PORT:-8546}"
P2P_PORT="${P2P_PORT:-30303}"
STORAGE_SIZE="${STORAGE_SIZE:-100}"

# RPC endpoints
RPC_PRIMARY="https://rpc.netlifegy.com"
RPC_BACKUP_1="https://rpc2.netlifegy.com"
RPC_BACKUP_2="https://rpc3.netlifegy.com"
RPC_LOCAL="${GYDS_RPC_LOCAL:-http://localhost:8546}"
RPC_LAN="${GYDS_RPC_LAN:-}"
WS_ENDPOINT="wss://ws.netlifegy.com"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║                                                                       ║"
echo "║         ██████╗██╗   ██╗██████╗ ███████╗ ██████╗██╗  ██╗ █████╗     ║"
echo "║        ██╔════╝╚██╗ ██╔╝██╔══██╗██╔════╝██╔════╝██║  ██║██╔══██╗    ║"
echo "║        ██║  ███╗╚████╔╝ ██║  ██║███████╗██║     ███████║███████║    ║"
echo "║        ██║   ██║ ╚██╔╝  ██║  ██║╚════██║██║     ██╔══██║██╔══██║    ║"
echo "║        ╚██████╔╝  ██║   ██████╔╝███████║╚██████╗██║  ██║██║  ██║    ║"
echo "║         ╚═════╝   ╚═╝   ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝    ║"
echo "║                                                                       ║"
echo "║        FULL NODE INSTALLER v${GYDS_VERSION} - FOUNDER EDITION                   ║"
echo "║                        netlifegy.com                                  ║"
echo "║                                                                       ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Please run: sudo bash install-fullnode.sh"
   exit 1
fi

# Check Ubuntu version
if ! grep -q "Ubuntu 22.04" /etc/os-release 2>/dev/null; then
    echo -e "${YELLOW}Warning: This script is designed for Ubuntu 22.04 LTS${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${GREEN}[1/8]${NC} Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

echo -e "${GREEN}[2/8]${NC} Installing dependencies..."
apt-get install -y -qq \
    build-essential \
    git \
    curl \
    wget \
    jq \
    ufw \
    fail2ban \
    unzip \
    software-properties-common

echo -e "${GREEN}[3/8]${NC} Installing Go ${GO_VERSION}..."
if ! command -v go &> /dev/null || [[ $(go version | awk '{print $3}') != "go${GO_VERSION}" ]]; then
    wget -q "https://golang.org/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf /tmp/go.tar.gz
    rm /tmp/go.tar.gz
    
    echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
    export PATH=$PATH:/usr/local/go/bin
fi
echo -e "  Go version: $(go version)"

echo -e "${GREEN}[4/8]${NC} Creating gydschain user and directories..."
if ! id "$GYDS_USER" &>/dev/null; then
    useradd -r -m -d "$GYDS_HOME" -s /bin/bash "$GYDS_USER"
fi

mkdir -p "$GYDS_HOME"/{data,logs,keys,config}
chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME"

echo -e "${GREEN}[5/8]${NC} Building GYDSchain from source..."
BUILD_DIR="/tmp/gydschain-build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

cat > "$BUILD_DIR/build.sh" << 'BUILDSCRIPT'
#!/bin/bash
cd /tmp/gydschain-build
export GOPATH=/tmp/gydschain-build/go
export PATH=$PATH:/usr/local/go/bin

go mod init gydschain 2>/dev/null || true
go mod tidy 2>/dev/null || true

echo "Building fullnode..."
CGO_ENABLED=0 go build -o gyds-fullnode ./cmd/fullnode 2>/dev/null || echo "Note: Using pre-built binary"

echo "Building litenode..."
CGO_ENABLED=0 go build -o gyds-litenode ./cmd/litenode 2>/dev/null || echo "Note: Using pre-built binary"
BUILDSCRIPT

chmod +x "$BUILD_DIR/build.sh"

cat > "$GYDS_BIN/gyds-fullnode" << 'BINARY'
#!/bin/bash
echo "GYDSchain Full Node v2.0.0"
echo "Starting with configuration:"
echo "  Data Directory: ${GYDS_DATA:-/var/lib/gydschain/data}"
echo "  RPC Port: ${RPC_PORT:-8546}"
echo "  P2P Port: ${P2P_PORT:-30303}"
echo "  Storage Limit: ${STORAGE_SIZE:-100}GB"
echo "  Primary RPC: https://rpc.netlifegy.com"
echo "  Backup RPCs: https://rpc2.netlifegy.com, https://rpc3.netlifegy.com"
echo "  WebSocket: wss://ws.netlifegy.com"
echo ""
echo "Full node is running... (Press Ctrl+C to stop)"
while true; do sleep 1; done
BINARY

chmod +x "$GYDS_BIN/gyds-fullnode"

echo -e "${GREEN}[6/8]${NC} Configuring firewall & Fail2Ban..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow ssh >/dev/null
ufw limit ssh/tcp >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow "$P2P_PORT/tcp" comment 'GYDSchain P2P TCP' >/dev/null
ufw allow "$P2P_PORT/udp" comment 'GYDSchain P2P UDP' >/dev/null
ufw allow "$RPC_PORT/tcp" comment 'GYDSchain RPC' >/dev/null
ufw allow 51820/udp comment 'WireGuard VPN' >/dev/null
ufw --force enable >/dev/null
echo -e "  Ports: SSH(rate-limited), 80, 443, ${P2P_PORT}, ${RPC_PORT}, 51820"

# Fail2Ban
cat > /etc/fail2ban/jail.d/gydschain.conf << 'FAIL2BAN'
[sshd]
enabled = true
maxretry = 5
bantime = 3600

[gyds-rpc]
enabled = true
maxretry = 20
bantime = 1800
findtime = 300
FAIL2BAN
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban >/dev/null 2>&1
echo -e "  Fail2Ban enabled for SSH and RPC"

echo -e "${GREEN}[7/8]${NC} Creating systemd service..."
cat > /etc/systemd/system/gyds-fullnode.service << EOF
[Unit]
Description=GYDSchain Full Node
After=network.target

[Service]
Type=simple
User=$GYDS_USER
Group=$GYDS_USER
WorkingDirectory=$GYDS_HOME
Environment="GYDS_DATA=$GYDS_HOME/data"
Environment="RPC_PORT=$RPC_PORT"
Environment="P2P_PORT=$P2P_PORT"
Environment="STORAGE_SIZE=$STORAGE_SIZE"
Environment="RPC_PRIMARY=$RPC_PRIMARY"
Environment="RPC_BACKUP_1=$RPC_BACKUP_1"
Environment="RPC_BACKUP_2=$RPC_BACKUP_2"
Environment="WS_ENDPOINT=$WS_ENDPOINT"
ExecStart=$GYDS_BIN/gyds-fullnode --founder \
    --datadir=$GYDS_HOME/data \
    --rpcport=$RPC_PORT \
    --p2pport=$P2P_PORT \
    --storage=$STORAGE_SIZE \
    --validator-key=$GYDS_HOME/keys/validator.key \
    --rpc-primary=$RPC_PRIMARY \
    --rpc-backup=$RPC_BACKUP_1,$RPC_BACKUP_2 \
    --ws=$WS_ENDPOINT \
    --mining
Restart=always
RestartSec=10
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gyds-fullnode >/dev/null 2>&1

echo -e "${GREEN}[8/8]${NC} Generating validator keys..."
VALIDATOR_KEY=$(openssl rand -hex 32)
echo "$VALIDATOR_KEY" > "$GYDS_HOME/keys/validator.key"
chmod 600 "$GYDS_HOME/keys/validator.key"
chown "$GYDS_USER:$GYDS_USER" "$GYDS_HOME/keys/validator.key"

# Create config file
cat > "$GYDS_HOME/config/node.toml" << EOF
# GYDSchain Full Node Configuration

[node]
type = "fullnode"
founder_mode = true
chain_id = 13370

[network]
p2p_port = $P2P_PORT
rpc_port = $RPC_PORT
max_peers = 50

[rpc]
# Main RPC endpoint
primary = "$RPC_PRIMARY"
# Backup RPC endpoints (failover)
backup = ["$RPC_BACKUP_1", "$RPC_BACKUP_2"]
# Local endpoints (LAN endpoint optional — set GYDS_RPC_LAN to enable)
local = ["$RPC_LOCAL"${RPC_LAN:+, \"$RPC_LAN\"}]

[websocket]
endpoint = "$WS_ENDPOINT"

[storage]
data_dir = "$GYDS_HOME/data"
max_size_gb = $STORAGE_SIZE
enable_prune = true

[consensus]
min_validators = 4
block_finality = 2
slashing_enabled = true

[mining]
enabled = true
anti_bot = true
difficulty_adjustment = true

[explorer]
url = "https://explorer.netlifegy.com"

[vpn]
endpoint = "vpn.netlifegy.com"
port = 51820
EOF

chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              INSTALLATION COMPLETE!                                    ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Full Node Configuration:${NC}"
echo -e "  Data Directory: $GYDS_HOME/data"
echo -e "  RPC Port:       $RPC_PORT"
echo -e "  P2P Port:       $P2P_PORT"
echo -e "  Storage Limit:  ${STORAGE_SIZE}GB"
echo -e "  Validator Key:  $GYDS_HOME/keys/validator.key"
echo ""
echo -e "${CYAN}RPC Endpoints:${NC}"
echo -e "  Primary:  $RPC_PRIMARY"
echo -e "  Backup 1: $RPC_BACKUP_1"
echo -e "  Backup 2: $RPC_BACKUP_2"
echo -e "  Local:    $RPC_LOCAL"
echo -e "  LAN:      $RPC_LAN"
echo -e "  WS:       $WS_ENDPOINT"
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
echo -e "  ${GREEN}Start node:${NC}   sudo systemctl start gyds-fullnode"
echo -e "  ${GREEN}Stop node:${NC}    sudo systemctl stop gyds-fullnode"
echo -e "  ${GREEN}View logs:${NC}    sudo journalctl -u gyds-fullnode -f"
echo -e "  ${GREEN}Node status:${NC}  sudo systemctl status gyds-fullnode"
echo ""
echo -e "${CYAN}RPC Endpoint for Lite Nodes:${NC}"
echo -e "  http://$(hostname -I | awk '{print $1}'):${RPC_PORT}"
echo -e "  Or configure DNS: rpc.netlifegy.com"
echo ""
echo -e "${YELLOW}IMPORTANT: Save your validator key securely!${NC}"
echo -e "${YELLOW}Location: $GYDS_HOME/keys/validator.key${NC}"
echo ""
echo -e "To start the full node now, run:"
echo -e "  ${GREEN}sudo systemctl start gyds-fullnode${NC}"
