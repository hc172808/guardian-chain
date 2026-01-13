#!/data/data/com.termux/files/usr/bin/bash
#
# GYDSchain Litenode Installation Script for Termux (Android)
# Runs a lightweight node on your Android device
#
# Usage: bash install-termux.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       GYDSchain Litenode Installer for Termux              ║"
echo "║                 Android Mobile Node                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Termux-specific home directory
GYDS_HOME="$HOME/.gydschain"
CONFIG_FILE="$GYDS_HOME/config.env"
WG_CONFIG="$GYDS_HOME/wireguard/wg0.conf"

# Check if running in Termux
if [ ! -d "/data/data/com.termux" ]; then
    echo -e "${RED}Error: This script is designed for Termux on Android${NC}"
    echo "Please install Termux from F-Droid and run this script inside Termux"
    exit 1
fi

echo -e "${YELLOW}Updating Termux packages...${NC}"
pkg update -y && pkg upgrade -y

echo -e "${YELLOW}Installing required packages...${NC}"
pkg install -y curl wget jq openssl termux-api wireguard-tools

# Create directory structure
echo -e "${YELLOW}Creating GYDSchain directories...${NC}"
mkdir -p "$GYDS_HOME"/{data,logs,wallet,wireguard}

# Generate wallet if not exists
if [ ! -f "$GYDS_HOME/wallet/keyfile.json" ]; then
    echo -e "${YELLOW}Generating new wallet...${NC}"
    PRIVATE_KEY=$(openssl rand -hex 32)
    # Simple address derivation (in production, use proper crypto)
    ADDRESS="0x$(echo -n "$PRIVATE_KEY" | openssl dgst -sha256 | cut -d' ' -f2 | cut -c1-40)"
    
    cat > "$GYDS_HOME/wallet/keyfile.json" << EOF
{
    "address": "$ADDRESS",
    "privateKey": "$PRIVATE_KEY",
    "createdAt": "$(date -Iseconds)"
}
EOF
    chmod 600 "$GYDS_HOME/wallet/keyfile.json"
    echo -e "${GREEN}Wallet created: $ADDRESS${NC}"
fi

# Configuration prompts
echo ""
echo -e "${CYAN}=== Node Configuration ===${NC}"
echo ""

# RPC Endpoint
read -p "RPC Endpoint [http://rpc.gydschain.io:8545]: " RPC_ENDPOINT
RPC_ENDPOINT=${RPC_ENDPOINT:-"http://rpc.gydschain.io:8545"}

# WebSocket Endpoint
read -p "WebSocket Endpoint [ws://rpc.gydschain.io:8546]: " WS_ENDPOINT
WS_ENDPOINT=${WS_ENDPOINT:-"ws://rpc.gydschain.io:8546"}

# Storage size (limited on mobile)
read -p "Storage Size in GB (2-20) [5]: " STORAGE_SIZE
STORAGE_SIZE=${STORAGE_SIZE:-5}

# Mining (usually disabled on mobile due to battery)
read -p "Enable Mining? (not recommended for mobile) [n]: " ENABLE_MINING
ENABLE_MINING=${ENABLE_MINING:-"n"}
if [[ "$ENABLE_MINING" =~ ^[Yy]$ ]]; then
    MINING_ENABLED="true"
    read -p "Mining Threads (1-2 recommended) [1]: " MINING_THREADS
    MINING_THREADS=${MINING_THREADS:-1}
else
    MINING_ENABLED="false"
    MINING_THREADS=0
fi

# API Port
read -p "Local API Port [3030]: " API_PORT
API_PORT=${API_PORT:-3030}

# WireGuard Configuration
echo ""
echo -e "${CYAN}=== WireGuard VPN Configuration ===${NC}"
echo -e "${YELLOW}WireGuard provides secure connection to GYDSchain fullnodes${NC}"
echo ""

read -p "Configure WireGuard? [y]: " SETUP_WG
SETUP_WG=${SETUP_WG:-"y"}

if [[ "$SETUP_WG" =~ ^[Yy]$ ]]; then
    # Generate WireGuard keys
    WG_PRIVATE=$(wg genkey)
    WG_PUBLIC=$(echo "$WG_PRIVATE" | wg pubkey)
    
    read -p "WireGuard Server Endpoint [vpn.gydschain.io]: " WG_SERVER
    WG_SERVER=${WG_SERVER:-"vpn.gydschain.io"}
    
    read -p "WireGuard Server Port [51820]: " WG_PORT
    WG_PORT=${WG_PORT:-51820}
    
    read -p "WireGuard Server Public Key: " WG_SERVER_PUBKEY
    
    read -p "Your Assigned IP (e.g., 10.0.0.x/32): " WG_CLIENT_IP
    WG_CLIENT_IP=${WG_CLIENT_IP:-"10.0.0.100/32"}
    
    # Create WireGuard config
    mkdir -p "$GYDS_HOME/wireguard"
    cat > "$WG_CONFIG" << EOF
# GYDSchain WireGuard Configuration
# Generated: $(date)
# 
# IMPORTANT: Keep this file secure!
# Your public key to share with admin: $WG_PUBLIC

[Interface]
PrivateKey = $WG_PRIVATE
Address = $WG_CLIENT_IP
DNS = 1.1.1.1

[Peer]
PublicKey = $WG_SERVER_PUBKEY
Endpoint = $WG_SERVER:$WG_PORT
AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25
EOF
    chmod 600 "$WG_CONFIG"
    
    echo -e "${GREEN}WireGuard configuration created!${NC}"
    echo -e "${YELLOW}Your public key: $WG_PUBLIC${NC}"
    echo -e "${YELLOW}Share this with the admin for approval${NC}"
fi

# Create main configuration file
echo -e "${YELLOW}Creating configuration file...${NC}"
cat > "$CONFIG_FILE" << EOF
# GYDSchain Litenode Configuration
# Generated: $(date)
# Platform: Termux (Android)

# === RPC Configuration ===
GYDS_RPC_ENDPOINT="$RPC_ENDPOINT"
GYDS_WS_ENDPOINT="$WS_ENDPOINT"

# === Node Configuration ===
GYDS_NODE_TYPE="litenode"
GYDS_DATA_DIR="$GYDS_HOME/data"
GYDS_STORAGE_SIZE_GB="$STORAGE_SIZE"
GYDS_MAX_PEERS="25"

# === Mining Configuration ===
GYDS_MINING_ENABLED="$MINING_ENABLED"
GYDS_MINING_THREADS="$MINING_THREADS"
GYDS_MINING_WALLET="$(cat $GYDS_HOME/wallet/keyfile.json | jq -r '.address')"

# === API Configuration ===
GYDS_API_PORT="$API_PORT"

# === WireGuard Configuration ===
GYDS_WG_CONFIG="$WG_CONFIG"
GYDS_WG_ENABLED="${SETUP_WG:-n}"

# === Token Configuration ===
# These are fetched from the network, but can be overridden
GYDS_GYD_PEGGED="true"
GYDS_GYD_PRICE="1.0"

# === Chain Configuration ===
GYDS_CHAIN_ID="13370"
GYDS_CHAIN_NAME="GYDSchain Mainnet"
EOF

# Create start script
echo -e "${YELLOW}Creating startup script...${NC}"
cat > "$GYDS_HOME/start.sh" << 'STARTSCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
# GYDSchain Litenode Startup Script for Termux

GYDS_HOME="$HOME/.gydschain"
source "$GYDS_HOME/config.env"

echo "Starting GYDSchain Litenode..."
echo "Chain ID: $GYDS_CHAIN_ID"
echo "RPC: $GYDS_RPC_ENDPOINT"
echo "Mining: $GYDS_MINING_ENABLED"

# Start WireGuard if configured
if [[ "$GYDS_WG_ENABLED" =~ ^[Yy]$ ]] && [ -f "$GYDS_WG_CONFIG" ]; then
    echo "Starting WireGuard..."
    # Note: WireGuard on Termux requires root or special setup
    # wg-quick up "$GYDS_WG_CONFIG" 2>/dev/null || echo "WireGuard requires root access"
fi

# Keep alive and poll RPC
while true; do
    # Get latest block
    RESPONSE=$(curl -s -X POST "$GYDS_RPC_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null)
    
    if [ -n "$RESPONSE" ]; then
        BLOCK_HEX=$(echo "$RESPONSE" | jq -r '.result // "0x0"')
        BLOCK_NUM=$((BLOCK_HEX))
        echo "[$(date '+%H:%M:%S')] Connected - Block #$BLOCK_NUM"
    else
        echo "[$(date '+%H:%M:%S')] Connecting to $GYDS_RPC_ENDPOINT..."
    fi
    
    # Update heartbeat
    echo "$BLOCK_NUM" > "$GYDS_HOME/data/last_block"
    echo "$(date -Iseconds)" > "$GYDS_HOME/data/last_heartbeat"
    
    sleep 12  # Target block time
done
STARTSCRIPT
chmod +x "$GYDS_HOME/start.sh"

# Create stop script
cat > "$GYDS_HOME/stop.sh" << 'STOPSCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
pkill -f "gydschain" 2>/dev/null
echo "GYDSchain node stopped"
STOPSCRIPT
chmod +x "$GYDS_HOME/stop.sh"

# Create status script
cat > "$GYDS_HOME/status.sh" << 'STATUSSCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
GYDS_HOME="$HOME/.gydschain"
source "$GYDS_HOME/config.env"

echo "=== GYDSchain Litenode Status ==="
echo ""
echo "Wallet: $(cat $GYDS_HOME/wallet/keyfile.json | jq -r '.address')"
echo "RPC: $GYDS_RPC_ENDPOINT"
echo "Mining: $GYDS_MINING_ENABLED"

if [ -f "$GYDS_HOME/data/last_block" ]; then
    echo "Last Block: $(cat $GYDS_HOME/data/last_block)"
fi
if [ -f "$GYDS_HOME/data/last_heartbeat" ]; then
    echo "Last Heartbeat: $(cat $GYDS_HOME/data/last_heartbeat)"
fi

# Check connection
RESPONSE=$(curl -s -X POST "$GYDS_RPC_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' 2>/dev/null)

if [ -n "$RESPONSE" ]; then
    CHAIN_ID=$(echo "$RESPONSE" | jq -r '.result')
    echo "Connected: Yes (Chain ID: $CHAIN_ID)"
else
    echo "Connected: No"
fi
STATUSSCRIPT
chmod +x "$GYDS_HOME/status.sh"

# Installation complete
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Installation Complete!                           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Configuration:${NC}"
echo "  Home Directory: $GYDS_HOME"
echo "  Config File:    $CONFIG_FILE"
echo "  Wallet:         $(cat $GYDS_HOME/wallet/keyfile.json | jq -r '.address')"
echo ""
echo -e "${CYAN}Commands:${NC}"
echo "  Start node:     bash $GYDS_HOME/start.sh"
echo "  Stop node:      bash $GYDS_HOME/stop.sh"
echo "  Check status:   bash $GYDS_HOME/status.sh"
echo ""
if [[ "$SETUP_WG" =~ ^[Yy]$ ]]; then
    echo -e "${CYAN}WireGuard:${NC}"
    echo "  Config:      $WG_CONFIG"
    echo "  Public Key:  $WG_PUBLIC"
    echo ""
    echo -e "${YELLOW}⚠ Share your public key with admin for network access${NC}"
fi
echo ""
echo -e "${GREEN}Run 'bash $GYDS_HOME/start.sh' to start your node!${NC}"
