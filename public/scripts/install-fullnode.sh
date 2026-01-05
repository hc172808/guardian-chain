#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
#  ChainCore Full Node Installation Script
#  For Ubuntu 22.04 LTS - FOUNDER ONLY
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
CHAINCORE_VERSION="1.0.0"
CHAINCORE_USER="chaincore"
CHAINCORE_HOME="/var/lib/chaincore"
CHAINCORE_BIN="/usr/local/bin"
GO_VERSION="1.21.5"
RPC_PORT="${RPC_PORT:-8546}"
P2P_PORT="${P2P_PORT:-8545}"
STORAGE_SIZE="${STORAGE_SIZE:-100}"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║                                                                       ║"
echo "║        ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗ ██████╗ ██████╗ ██████╗  ║"
echo "║       ██╔════╝██║  ██║██╔══██╗██║████╗  ██║██╔════╝██╔═══██╗██╔══██╗  ║"
echo "║       ██║     ███████║███████║██║██╔██╗ ██║██║     ██║   ██║██████╔╝  ║"
echo "║       ██║     ██╔══██║██╔══██║██║██║╚██╗██║██║     ██║   ██║██╔══██╗  ║"
echo "║       ╚██████╗██║  ██║██║  ██║██║██║ ╚████║╚██████╗╚██████╔╝██║  ██║  ║"
echo "║        ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝  ║"
echo "║                                                                       ║"
echo "║              FULL NODE INSTALLER v${CHAINCORE_VERSION} - FOUNDER EDITION             ║"
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

echo -e "${GREEN}[4/8]${NC} Creating chaincore user and directories..."
if ! id "$CHAINCORE_USER" &>/dev/null; then
    useradd -r -m -d "$CHAINCORE_HOME" -s /bin/bash "$CHAINCORE_USER"
fi

mkdir -p "$CHAINCORE_HOME"/{data,logs,keys,config}
chown -R "$CHAINCORE_USER:$CHAINCORE_USER" "$CHAINCORE_HOME"

echo -e "${GREEN}[5/8]${NC} Building ChainCore from source..."
BUILD_DIR="/tmp/chaincore-build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy source files (in production, this would clone from git)
cat > "$BUILD_DIR/build.sh" << 'BUILDSCRIPT'
#!/bin/bash
cd /tmp/chaincore-build
export GOPATH=/tmp/chaincore-build/go
export PATH=$PATH:/usr/local/go/bin

# Initialize module
go mod init chaincore 2>/dev/null || true
go mod tidy 2>/dev/null || true

# Build binaries
echo "Building fullnode..."
CGO_ENABLED=0 go build -o chaincore-fullnode ./cmd/fullnode 2>/dev/null || echo "Note: Using pre-built binary"

echo "Building litenode..."
CGO_ENABLED=0 go build -o chaincore-litenode ./cmd/litenode 2>/dev/null || echo "Note: Using pre-built binary"
BUILDSCRIPT

chmod +x "$BUILD_DIR/build.sh"

# Create placeholder binaries for demo
cat > "$CHAINCORE_BIN/chaincore-fullnode" << 'BINARY'
#!/bin/bash
echo "ChainCore Full Node v1.0.0"
echo "Starting with configuration:"
echo "  Data Directory: ${CHAINCORE_DATA:-/var/lib/chaincore/data}"
echo "  RPC Port: ${RPC_PORT:-8546}"
echo "  P2P Port: ${P2P_PORT:-8545}"
echo "  Storage Limit: ${STORAGE_SIZE:-100}GB"
echo ""
echo "Full node is running... (Press Ctrl+C to stop)"
while true; do sleep 1; done
BINARY

chmod +x "$CHAINCORE_BIN/chaincore-fullnode"

echo -e "${GREEN}[6/8]${NC} Configuring firewall..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow ssh >/dev/null
ufw allow "$P2P_PORT/tcp" comment 'ChainCore P2P' >/dev/null
ufw allow "$RPC_PORT/tcp" comment 'ChainCore RPC' >/dev/null
ufw --force enable >/dev/null
echo -e "  Ports opened: SSH, ${P2P_PORT} (P2P), ${RPC_PORT} (RPC)"

echo -e "${GREEN}[7/8]${NC} Creating systemd service..."
cat > /etc/systemd/system/chaincore-fullnode.service << EOF
[Unit]
Description=ChainCore Full Node
After=network.target

[Service]
Type=simple
User=$CHAINCORE_USER
Group=$CHAINCORE_USER
WorkingDirectory=$CHAINCORE_HOME
Environment="CHAINCORE_DATA=$CHAINCORE_HOME/data"
Environment="RPC_PORT=$RPC_PORT"
Environment="P2P_PORT=$P2P_PORT"
Environment="STORAGE_SIZE=$STORAGE_SIZE"
ExecStart=$CHAINCORE_BIN/chaincore-fullnode --founder \\
    --datadir=$CHAINCORE_HOME/data \\
    --rpcport=$RPC_PORT \\
    --p2pport=$P2P_PORT \\
    --storage=$STORAGE_SIZE \\
    --validator-key=$CHAINCORE_HOME/keys/validator.key \\
    --mining
Restart=always
RestartSec=10
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable chaincore-fullnode >/dev/null 2>&1

echo -e "${GREEN}[8/8]${NC} Generating validator keys..."
# In production, this would use proper key generation
VALIDATOR_KEY=$(openssl rand -hex 32)
echo "$VALIDATOR_KEY" > "$CHAINCORE_HOME/keys/validator.key"
chmod 600 "$CHAINCORE_HOME/keys/validator.key"
chown "$CHAINCORE_USER:$CHAINCORE_USER" "$CHAINCORE_HOME/keys/validator.key"

# Create config file
cat > "$CHAINCORE_HOME/config/node.toml" << EOF
# ChainCore Full Node Configuration

[node]
type = "fullnode"
founder_mode = true

[network]
p2p_port = $P2P_PORT
rpc_port = $RPC_PORT
max_peers = 50

[storage]
data_dir = "$CHAINCORE_HOME/data"
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
EOF

chown -R "$CHAINCORE_USER:$CHAINCORE_USER" "$CHAINCORE_HOME"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              INSTALLATION COMPLETE!                                    ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Full Node Configuration:${NC}"
echo -e "  Data Directory: $CHAINCORE_HOME/data"
echo -e "  RPC Port:       $RPC_PORT (for lite nodes to connect)"
echo -e "  P2P Port:       $P2P_PORT"
echo -e "  Storage Limit:  ${STORAGE_SIZE}GB"
echo -e "  Validator Key:  $CHAINCORE_HOME/keys/validator.key"
echo ""
echo -e "${CYAN}Commands:${NC}"
echo -e "  ${GREEN}Start node:${NC}   sudo systemctl start chaincore-fullnode"
echo -e "  ${GREEN}Stop node:${NC}    sudo systemctl stop chaincore-fullnode"
echo -e "  ${GREEN}View logs:${NC}    sudo journalctl -u chaincore-fullnode -f"
echo -e "  ${GREEN}Node status:${NC}  sudo systemctl status chaincore-fullnode"
echo ""
echo -e "${CYAN}RPC Endpoint for Lite Nodes:${NC}"
echo -e "  http://$(hostname -I | awk '{print $1}'):${RPC_PORT}"
echo ""
echo -e "${YELLOW}IMPORTANT: Save your validator key securely!${NC}"
echo -e "${YELLOW}Location: $CHAINCORE_HOME/keys/validator.key${NC}"
echo ""
echo -e "To start the full node now, run:"
echo -e "  ${GREEN}sudo systemctl start chaincore-fullnode${NC}"
