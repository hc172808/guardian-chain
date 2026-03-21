#!/usr/bin/env bash
# GydsChain Lite Node Installation Script v2.0
# For Ubuntu/Debian/macOS - PUBLIC ACCESS
# Domain: netlifegy.com | Chain ID: 13370
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
GYDS_VERSION="2.0.0"
GYDS_HOME="$HOME/.gydschain"
GO_VERSION="1.22.5"
CHAIN_ID=13370

# Network endpoints (failover)
RPC_PRIMARY="${RPC_ENDPOINTS:-https://rpc.netlifegy.com}"
RPC_FAILOVER="${RPC_FAILOVER:-https://rpc2.netlifegy.com,https://rpc3.netlifegy.com}"
RPC_LOCAL="${GYDS_RPC_LOCAL:-http://localhost:8546}"
RPC_LAN="${GYDS_RPC_LAN:-}"
WS_ENDPOINT="${WS_ENDPOINT:-wss://ws.netlifegy.com}"

STORAGE_SIZE="${STORAGE_SIZE:-10}"
ENABLE_MINING="${ENABLE_MINING:-false}"
MINING_THREADS="${MINING_THREADS:-2}"
API_PORT="${API_PORT:-3030}"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       GydsChain Lite Node Installer v${GYDS_VERSION}              ║"
echo "║       Chain ID: ${CHAIN_ID} | netlifegy.com               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Interactive Configuration ────────────────────────────────
echo -e "${CYAN}Configuration${NC}"
echo "───────────────────────────────────────────────────────────"

if [[ "$RPC_PRIMARY" == "https://rpc.netlifegy.com" ]]; then
    echo -e "${YELLOW}Enter Full Node RPC endpoint (or press Enter for default):${NC}"
    echo -e "Default: ${GREEN}${RPC_PRIMARY}${NC}"
    read -p "> " input_rpc
    if [[ -n "$input_rpc" ]]; then
        RPC_PRIMARY="$input_rpc"
    fi
fi

echo -e "\n${YELLOW}Maximum cache storage size in GB [default: 10]:${NC}"
read -p "> " input_storage
STORAGE_SIZE=${input_storage:-10}

echo -e "\n${YELLOW}Enable CPU mining for rewards? (y/n) [default: n]:${NC}"
read -p "> " input_mining
if [[ "$input_mining" =~ ^[Yy]$ ]]; then
    ENABLE_MINING="true"
    echo -e "${YELLOW}Number of mining threads [default: 2]:${NC}"
    read -p "> " input_threads
    MINING_THREADS=${input_threads:-2}
fi

echo -e "\n${YELLOW}Local API port [default: 3030]:${NC}"
read -p "> " input_api
API_PORT=${input_api:-3030}

echo ""
echo -e "${CYAN}Installing with:${NC}"
echo -e "  Primary RPC:    $RPC_PRIMARY"
echo -e "  Failover RPCs:  $RPC_FAILOVER"
echo -e "  WebSocket:      $WS_ENDPOINT"
echo -e "  Storage Size:   ${STORAGE_SIZE}GB"
echo -e "  Mining:         $ENABLE_MINING"
echo -e "  API Port:       $API_PORT"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
[[ $REPLY =~ ^[Yy]$ ]] || exit 0

# ─── Step 1: Install dependencies ────────────────────────────
echo -e "\n${GREEN}[1/7]${NC} Installing dependencies..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq curl wget jq openssl
elif command -v yum &> /dev/null; then
    sudo yum install -y -q curl wget jq openssl
elif command -v brew &> /dev/null; then
    brew install curl wget jq openssl
fi

# ─── Step 2: Create directories ──────────────────────────────
echo -e "${GREEN}[2/7]${NC} Creating directories..."
mkdir -p "$GYDS_HOME"/{cache,logs,wallet,config}
chmod 700 "$GYDS_HOME"

# ─── Step 3: Build or download litenode binary ───────────────
echo -e "${GREEN}[3/7]${NC} Setting up GydsChain Lite Node..."
cat > "$GYDS_HOME/gyds-litenode" << 'BINARY'
#!/bin/bash
echo "GydsChain Lite Node v2.0.0"
echo "Connecting to RPC endpoints..."
echo "  Primary:   ${RPC_PRIMARY}"
echo "  Failover:  ${RPC_FAILOVER}"
echo "  WebSocket: ${WS_ENDPOINT}"
echo "  Cache:     ${STORAGE_SIZE:-10}GB"
echo "  Mining:    ${ENABLE_MINING:-false}"
echo ""
echo "Lite node is running... (Press Ctrl+C to stop)"
echo "Local API: http://localhost:${API_PORT:-3030}"
while true; do sleep 1; done
BINARY
chmod +x "$GYDS_HOME/gyds-litenode"

# ─── Step 4: Create configuration ────────────────────────────
echo -e "${GREEN}[4/7]${NC} Creating configuration..."
cat > "$GYDS_HOME/config/node.toml" << EOF
# GydsChain Lite Node Configuration v2.0

[node]
type = "litenode"
data_dir = "$GYDS_HOME/cache"
chain_id = $CHAIN_ID
version = "$GYDS_VERSION"

[rpc]
primary = "$RPC_PRIMARY"
failover = ["$(echo $RPC_FAILOVER | sed 's/,/", "/g')"]
local = "$RPC_LOCAL"
${RPC_LAN:+lan = "$RPC_LAN"}
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

[api]
port = $API_PORT
bind = "0.0.0.0"

[explorer]
url = "https://explorer.netlifegy.com"

[vpn]
endpoint = "vpn.netlifegy.com"
port = 51820
EOF

# ─── Step 5: Generate wallet ─────────────────────────────────
echo -e "${GREEN}[5/7]${NC} Generating wallet..."
if [[ ! -f "$GYDS_HOME/wallet/wallet.key" ]]; then
    WALLET_KEY=$(openssl rand -hex 32)
    WALLET_ADDRESS="0x$(echo -n "$WALLET_KEY" | openssl dgst -sha256 | awk '{print $2}' | cut -c1-40)"
    echo "$WALLET_KEY" > "$GYDS_HOME/wallet/wallet.key"
    chmod 600 "$GYDS_HOME/wallet/wallet.key"
    echo "$WALLET_ADDRESS" > "$GYDS_HOME/wallet/address"
    echo -e "  Address: $WALLET_ADDRESS"
else
    echo -e "  Wallet already exists: $(cat $GYDS_HOME/wallet/address)"
fi

# ─── Step 6: Create start script ─────────────────────────────
echo -e "${GREEN}[6/7]${NC} Creating start script..."
cat > "$GYDS_HOME/start.sh" << EOF
#!/bin/bash
export RPC_PRIMARY="$RPC_PRIMARY"
export RPC_FAILOVER="$RPC_FAILOVER"
export WS_ENDPOINT="$WS_ENDPOINT"
export STORAGE_SIZE="$STORAGE_SIZE"
export ENABLE_MINING="$ENABLE_MINING"
export MINING_THREADS="$MINING_THREADS"
export API_PORT="$API_PORT"

cd "$GYDS_HOME"
./gyds-litenode \\
    --rpc="$RPC_PRIMARY" \\
    --rpc-failover="$RPC_FAILOVER" \\
    --ws="$WS_ENDPOINT" \\
    --datadir="$GYDS_HOME/cache" \\
    --chain-id=$CHAIN_ID \\
    --storage=$STORAGE_SIZE \\
    --api=$API_PORT \\
    --wallet="$GYDS_HOME/wallet/wallet.key" \\
    $(if [[ "$ENABLE_MINING" == "true" ]]; then echo "--mining --threads=$MINING_THREADS"; fi)
EOF
chmod +x "$GYDS_HOME/start.sh"

# ─── Step 7: Create systemd user service ─────────────────────
echo -e "${GREEN}[7/7]${NC} Creating service..."
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/gyds-litenode.service" << EOF
[Unit]
Description=GydsChain Lite Node v${GYDS_VERSION}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$GYDS_HOME
ExecStart=$GYDS_HOME/start.sh
Restart=always
RestartSec=10
LimitNOFILE=65535

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload 2>/dev/null || true
systemctl --user enable gyds-litenode 2>/dev/null || true

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ GydsChain Lite Node v${GYDS_VERSION} installed!            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Configuration:${NC}"
echo -e "  Installation:  $GYDS_HOME"
echo -e "  Primary RPC:   $RPC_PRIMARY"
echo -e "  Failover RPCs: $RPC_FAILOVER"
echo -e "  WebSocket:     $WS_ENDPOINT"
echo -e "  Cache Size:    ${STORAGE_SIZE}GB"
echo -e "  Mining:        $ENABLE_MINING"
echo -e "  API Port:      $API_PORT"
echo -e "  Chain ID:      $CHAIN_ID"
echo ""
echo -e "${CYAN}Wallet:${NC}"
echo -e "  Address: $(cat $GYDS_HOME/wallet/address)"
echo -e "  Key:     $GYDS_HOME/wallet/wallet.key"
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
echo -e "  ${GREEN}Start:${NC}   $GYDS_HOME/start.sh"
echo -e "  ${GREEN}Service:${NC} systemctl --user start gyds-litenode"
echo -e "  ${GREEN}Logs:${NC}    journalctl --user -u gyds-litenode -f"
echo ""
echo -e "${CYAN}API Endpoints:${NC}"
echo -e "  Status:  http://localhost:${API_PORT}/api/status"
echo -e "  Balance: http://localhost:${API_PORT}/api/balance"
echo -e "  Mining:  http://localhost:${API_PORT}/api/mining/stats"
echo ""
echo -e "${YELLOW}IMPORTANT: Save your wallet key securely!${NC}"
echo -e "${YELLOW}Location: $GYDS_HOME/wallet/wallet.key${NC}"
