#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
#  ChainCore Lite Node Installation Script
#  For Ubuntu 22.04 LTS - PUBLIC ACCESS
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
CHAINCORE_HOME="$HOME/.chaincore-lite"
CHAINCORE_BIN="/usr/local/bin"
GO_VERSION="1.21.5"
RPC_ENDPOINTS="${RPC_ENDPOINTS:-}"
STORAGE_SIZE="${STORAGE_SIZE:-10}"
ENABLE_MINING="${ENABLE_MINING:-false}"
MINING_THREADS="${MINING_THREADS:-2}"
API_PORT="${API_PORT:-3000}"

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
echo "║              LITE NODE INSTALLER v${CHAINCORE_VERSION} - PUBLIC EDITION               ║"
echo "║                                                                       ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Interactive configuration
echo -e "${CYAN}Configuration${NC}"
echo "─────────────────────────────────────────────────────────────────────────"

# RPC Endpoints
if [[ -z "$RPC_ENDPOINTS" ]]; then
    echo -e "${YELLOW}Enter Full Node RPC endpoints (comma-separated):${NC}"
    echo -e "Example: http://node1.chaincore.io:8546,http://node2.chaincore.io:8546"
    read -p "> " RPC_ENDPOINTS
    
    if [[ -z "$RPC_ENDPOINTS" ]]; then
        echo -e "${RED}Error: At least one RPC endpoint is required${NC}"
        exit 1
    fi
fi

# Storage size
echo -e "\n${YELLOW}Maximum cache storage size in GB [default: 10]:${NC}"
read -p "> " input_storage
STORAGE_SIZE=${input_storage:-10}

# Mining
echo -e "\n${YELLOW}Enable CPU mining for rewards? (y/n) [default: n]:${NC}"
read -p "> " input_mining
if [[ "$input_mining" =~ ^[Yy]$ ]]; then
    ENABLE_MINING="true"
    echo -e "${YELLOW}Number of mining threads [default: 2]:${NC}"
    read -p "> " input_threads
    MINING_THREADS=${input_threads:-2}
fi

# API Port
echo -e "\n${YELLOW}Local API port [default: 3000]:${NC}"
read -p "> " input_api
API_PORT=${input_api:-3000}

echo ""
echo -e "${CYAN}Installing with configuration:${NC}"
echo -e "  RPC Endpoints: $RPC_ENDPOINTS"
echo -e "  Storage Size:  ${STORAGE_SIZE}GB"
echo -e "  Mining:        $ENABLE_MINING"
if [[ "$ENABLE_MINING" == "true" ]]; then
    echo -e "  Mining Threads: $MINING_THREADS"
fi
echo -e "  API Port:      $API_PORT"
echo ""

read -p "Continue with installation? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

echo ""
echo -e "${GREEN}[1/6]${NC} Installing dependencies..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq curl wget jq
elif command -v yum &> /dev/null; then
    sudo yum install -y -q curl wget jq
elif command -v brew &> /dev/null; then
    brew install curl wget jq
fi

echo -e "${GREEN}[2/6]${NC} Creating directories..."
mkdir -p "$CHAINCORE_HOME"/{cache,logs,wallet}

echo -e "${GREEN}[3/6]${NC} Downloading ChainCore Lite Node..."
# In production, this would download the actual binary
cat > "$CHAINCORE_HOME/chaincore-litenode" << 'BINARY'
#!/bin/bash
echo "ChainCore Lite Node v1.0.0"
echo "Connecting to RPC endpoints..."
echo "  Endpoints: $RPC_ENDPOINTS"
echo "  Cache Size: ${STORAGE_SIZE:-10}GB"
echo "  Mining: ${ENABLE_MINING:-false}"
echo ""
echo "Lite node is running... (Press Ctrl+C to stop)"
echo "Local API: http://localhost:${API_PORT:-3000}"
while true; do sleep 1; done
BINARY
chmod +x "$CHAINCORE_HOME/chaincore-litenode"

echo -e "${GREEN}[4/6]${NC} Creating configuration..."
cat > "$CHAINCORE_HOME/config.toml" << EOF
# ChainCore Lite Node Configuration

[node]
type = "litenode"
data_dir = "$CHAINCORE_HOME/cache"

[rpc]
endpoints = [$(echo $RPC_ENDPOINTS | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/' )]
max_retries = 3
timeout_seconds = 30
enable_failover = true

[cache]
max_size_gb = $STORAGE_SIZE
cache_blocks = 1000
cache_headers = 10000

[mining]
enabled = $ENABLE_MINING
threads = $MINING_THREADS
EOF

echo -e "${GREEN}[5/6]${NC} Creating wallet..."
# Generate a simple wallet (in production, use proper key generation)
WALLET_ADDRESS="0x$(openssl rand -hex 20)"
WALLET_KEY=$(openssl rand -hex 32)
echo "$WALLET_KEY" > "$CHAINCORE_HOME/wallet/wallet.key"
chmod 600 "$CHAINCORE_HOME/wallet/wallet.key"
echo "$WALLET_ADDRESS" > "$CHAINCORE_HOME/wallet/address"

echo -e "${GREEN}[6/6]${NC} Creating start script..."
cat > "$CHAINCORE_HOME/start.sh" << EOF
#!/bin/bash
export RPC_ENDPOINTS="$RPC_ENDPOINTS"
export STORAGE_SIZE="$STORAGE_SIZE"
export ENABLE_MINING="$ENABLE_MINING"
export MINING_THREADS="$MINING_THREADS"
export API_PORT="$API_PORT"

cd "$CHAINCORE_HOME"
./chaincore-litenode \\
    --rpc="$RPC_ENDPOINTS" \\
    --storage=$STORAGE_SIZE \\
    --api=$API_PORT \\
    --wallet="$CHAINCORE_HOME/wallet/wallet.key" \\
    $(if [[ "$ENABLE_MINING" == "true" ]]; then echo "--mining --threads=$MINING_THREADS"; fi)
EOF
chmod +x "$CHAINCORE_HOME/start.sh"

# Create systemd user service
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/chaincore-litenode.service" << EOF
[Unit]
Description=ChainCore Lite Node
After=network.target

[Service]
Type=simple
WorkingDirectory=$CHAINCORE_HOME
ExecStart=$CHAINCORE_HOME/start.sh
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload 2>/dev/null || true
systemctl --user enable chaincore-litenode 2>/dev/null || true

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              INSTALLATION COMPLETE!                                    ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Lite Node Configuration:${NC}"
echo -e "  Installation:   $CHAINCORE_HOME"
echo -e "  RPC Endpoints:  $RPC_ENDPOINTS"
echo -e "  Cache Size:     ${STORAGE_SIZE}GB"
echo -e "  Mining:         $ENABLE_MINING"
echo -e "  API Port:       $API_PORT"
echo ""
echo -e "${CYAN}Wallet:${NC}"
echo -e "  Address: $(cat $CHAINCORE_HOME/wallet/address)"
echo -e "  Key:     $CHAINCORE_HOME/wallet/wallet.key"
echo ""
echo -e "${CYAN}Commands:${NC}"
echo -e "  ${GREEN}Start node:${NC}   $CHAINCORE_HOME/start.sh"
echo -e "  ${GREEN}Or via systemd:${NC} systemctl --user start chaincore-litenode"
echo -e "  ${GREEN}View logs:${NC}    journalctl --user -u chaincore-litenode -f"
echo ""
echo -e "${CYAN}API Endpoints:${NC}"
echo -e "  Status:    http://localhost:${API_PORT}/api/status"
echo -e "  Balance:   http://localhost:${API_PORT}/api/balance"
echo -e "  Mining:    http://localhost:${API_PORT}/api/mining/stats"
echo ""
echo -e "${YELLOW}IMPORTANT: Save your wallet key securely!${NC}"
echo -e "${YELLOW}Location: $CHAINCORE_HOME/wallet/wallet.key${NC}"
echo ""
echo -e "To start the lite node now, run:"
echo -e "  ${GREEN}$CHAINCORE_HOME/start.sh${NC}"
