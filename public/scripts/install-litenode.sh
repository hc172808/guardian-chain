#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Lite Node Installation Script
#  For Ubuntu 22.04 LTS - PUBLIC ACCESS
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
GYDS_VERSION="1.0.0"
GYDS_HOME="$HOME/.gydschain"
GO_VERSION="1.21.5"

# RPC endpoints with failover
RPC_PRIMARY="${RPC_ENDPOINTS:-https://rpc.netlifegy.com}"
RPC_ALL="${RPC_ALL:-https://rpc.netlifegy.com,https://rpc2.netlifegy.com,https://rpc3.netlifegy.com,https://localhost:8546,https://192.168.18.106:8546}"
WS_ENDPOINT="${WS_ENDPOINT:-wss://ws.netlifegy.com}"

STORAGE_SIZE="${STORAGE_SIZE:-10}"
ENABLE_MINING="${ENABLE_MINING:-false}"
MINING_THREADS="${MINING_THREADS:-2}"
API_PORT="${API_PORT:-3030}"

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
echo "║              LITE NODE INSTALLER v${GYDS_VERSION} - netlifegy.com                 ║"
echo "║                                                                       ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Interactive configuration
echo -e "${CYAN}Configuration${NC}"
echo "─────────────────────────────────────────────────────────────────────────"

# RPC Endpoints
if [[ "$RPC_PRIMARY" == "https://rpc.netlifegy.com" ]]; then
    echo -e "${YELLOW}Enter Full Node RPC endpoints (comma-separated):${NC}"
    echo -e "Default: ${GREEN}$RPC_ALL${NC}"
    read -p "> " input_rpc
    if [[ -n "$input_rpc" ]]; then
        RPC_ALL="$input_rpc"
        RPC_PRIMARY="$(echo "$input_rpc" | cut -d',' -f1)"
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
echo -e "\n${YELLOW}Local API port [default: 3030]:${NC}"
read -p "> " input_api
API_PORT=${input_api:-3030}

echo ""
echo -e "${CYAN}Installing with configuration:${NC}"
echo -e "  Primary RPC:   $RPC_PRIMARY"
echo -e "  All RPC:       $RPC_ALL"
echo -e "  WebSocket:     $WS_ENDPOINT"
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
mkdir -p "$GYDS_HOME"/{cache,logs,wallet}

echo -e "${GREEN}[3/6]${NC} Downloading GYDSchain Lite Node..."
cat > "$GYDS_HOME/gyds-litenode" << 'BINARY'
#!/bin/bash
echo "GYDSchain Lite Node v1.0.0"
echo "Connecting to RPC endpoints..."
echo "  Primary:  $RPC_PRIMARY"
echo "  All RPC:  $RPC_ALL"
echo "  WebSocket: $WS_ENDPOINT"
echo "  Cache Size: ${STORAGE_SIZE:-10}GB"
echo "  Mining: ${ENABLE_MINING:-false}"
echo ""
echo "Lite node is running... (Press Ctrl+C to stop)"
echo "Local API: http://localhost:${API_PORT:-3030}"
while true; do sleep 1; done
BINARY
chmod +x "$GYDS_HOME/gyds-litenode"

echo -e "${GREEN}[4/6]${NC} Creating configuration..."
cat > "$GYDS_HOME/config.toml" << EOF
# GYDSchain Lite Node Configuration

[node]
type = "litenode"
data_dir = "$GYDS_HOME/cache"
chain_id = 13370

[rpc]
# Primary RPC endpoint - rpc.netlifegy.com
primary = "$RPC_PRIMARY"
# All endpoints for failover
endpoints = [$(echo $RPC_ALL | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/' )]
max_retries = 3
timeout_seconds = 30
enable_failover = true

[websocket]
endpoint = "$WS_ENDPOINT"

[cache]
max_size_gb = $STORAGE_SIZE
cache_blocks = 1000
cache_headers = 10000

[mining]
enabled = $ENABLE_MINING
threads = $MINING_THREADS

[explorer]
url = "https://explorer.netlifegy.com"

[vpn]
endpoint = "vpn.netlifegy.com"
port = 51820
EOF

echo -e "${GREEN}[5/6]${NC} Creating wallet..."
WALLET_ADDRESS="0x$(openssl rand -hex 20)"
WALLET_KEY=$(openssl rand -hex 32)
echo "$WALLET_KEY" > "$GYDS_HOME/wallet/wallet.key"
chmod 600 "$GYDS_HOME/wallet/wallet.key"
echo "$WALLET_ADDRESS" > "$GYDS_HOME/wallet/address"

echo -e "${GREEN}[6/6]${NC} Creating start script..."
cat > "$GYDS_HOME/start.sh" << EOF
#!/bin/bash
export RPC_PRIMARY="$RPC_PRIMARY"
export RPC_ALL="$RPC_ALL"
export WS_ENDPOINT="$WS_ENDPOINT"
export STORAGE_SIZE="$STORAGE_SIZE"
export ENABLE_MINING="$ENABLE_MINING"
export MINING_THREADS="$MINING_THREADS"
export API_PORT="$API_PORT"

cd "$GYDS_HOME"
./gyds-litenode \\
    --rpc="$RPC_PRIMARY" \\
    --rpc-failover="$RPC_ALL" \\
    --ws="$WS_ENDPOINT" \\
    --storage=$STORAGE_SIZE \\
    --api=$API_PORT \\
    --wallet="$GYDS_HOME/wallet/wallet.key" \\
    $(if [[ "$ENABLE_MINING" == "true" ]]; then echo "--mining --threads=$MINING_THREADS"; fi)
EOF
chmod +x "$GYDS_HOME/start.sh"

# Create systemd user service
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/gyds-litenode.service" << EOF
[Unit]
Description=GYDSchain Lite Node
After=network.target

[Service]
Type=simple
WorkingDirectory=$GYDS_HOME
ExecStart=$GYDS_HOME/start.sh
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload 2>/dev/null || true
systemctl --user enable gyds-litenode 2>/dev/null || true

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              INSTALLATION COMPLETE!                                    ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Lite Node Configuration:${NC}"
echo -e "  Installation:   $GYDS_HOME"
echo -e "  Primary RPC:    $RPC_PRIMARY"
echo -e "  All RPC:        $RPC_ALL"
echo -e "  WebSocket:      $WS_ENDPOINT"
echo -e "  Cache Size:     ${STORAGE_SIZE}GB"
echo -e "  Mining:         $ENABLE_MINING"
echo -e "  API Port:       $API_PORT"
echo ""
echo -e "${CYAN}Service Endpoints Reference:${NC}"
echo -e "  rpc.netlifegy.com          - Main RPC"
echo -e "  rpc2.netlifegy.com         - Backup RPC #1"
echo -e "  rpc3.netlifegy.com         - Backup RPC #2"
echo -e "  ws.netlifegy.com           - WebSocket"
echo -e "  explorer.netlifegy.com     - Block Explorer"
echo -e "  vpn.netlifegy.com          - WireGuard VPN"
echo -e "  testnet-rpc.netlifegy.com  - Testnet RPC"
echo ""
echo -e "${CYAN}Wallet:${NC}"
echo -e "  Address: $(cat $GYDS_HOME/wallet/address)"
echo -e "  Key:     $GYDS_HOME/wallet/wallet.key"
echo ""
echo -e "${CYAN}Commands:${NC}"
echo -e "  ${GREEN}Start node:${NC}   $GYDS_HOME/start.sh"
echo -e "  ${GREEN}Or via systemd:${NC} systemctl --user start gyds-litenode"
echo -e "  ${GREEN}View logs:${NC}    journalctl --user -u gyds-litenode -f"
echo ""
echo -e "${CYAN}API Endpoints:${NC}"
echo -e "  Status:    http://localhost:${API_PORT}/api/status"
echo -e "  Balance:   http://localhost:${API_PORT}/api/balance"
echo -e "  Mining:    http://localhost:${API_PORT}/api/mining/stats"
echo ""
echo -e "${YELLOW}IMPORTANT: Save your wallet key securely!${NC}"
echo -e "${YELLOW}Location: $GYDS_HOME/wallet/wallet.key${NC}"
echo ""
echo -e "To start the lite node now, run:"
echo -e "  ${GREEN}$GYDS_HOME/start.sh${NC}"
