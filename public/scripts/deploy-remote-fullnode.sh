#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
#  ChainCore Remote Full Node Deployment Script
#  Deploy full nodes to remote Ubuntu 22.04 servers worldwide
#  FOUNDER ONLY
#═══════════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║        ChainCore Remote Full Node Deployment                          ║"
echo "║                    FOUNDER EDITION                                    ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check for required tools
command -v ssh >/dev/null 2>&1 || { echo -e "${RED}Error: ssh is required${NC}"; exit 1; }
command -v scp >/dev/null 2>&1 || { echo -e "${RED}Error: scp is required${NC}"; exit 1; }

# Configuration
echo -e "${CYAN}Remote Server Configuration${NC}"
echo "─────────────────────────────────────────────────────────────────────────"

read -p "Remote server IP or hostname: " REMOTE_HOST
read -p "SSH username [root]: " SSH_USER
SSH_USER=${SSH_USER:-root}
read -p "SSH port [22]: " SSH_PORT
SSH_PORT=${SSH_PORT:-22}
read -p "SSH key path [~/.ssh/id_rsa]: " SSH_KEY
SSH_KEY=${SSH_KEY:-~/.ssh/id_rsa}
read -p "RPC port for lite nodes [8546]: " RPC_PORT
RPC_PORT=${RPC_PORT:-8546}
read -p "P2P port [8545]: " P2P_PORT
P2P_PORT=${P2P_PORT:-8545}
read -p "Storage size in GB [100]: " STORAGE_SIZE
STORAGE_SIZE=${STORAGE_SIZE:-100}

echo ""
echo -e "${CYAN}Deployment Summary:${NC}"
echo -e "  Server:       $SSH_USER@$REMOTE_HOST:$SSH_PORT"
echo -e "  SSH Key:      $SSH_KEY"
echo -e "  RPC Port:     $RPC_PORT"
echo -e "  P2P Port:     $P2P_PORT"
echo -e "  Storage:      ${STORAGE_SIZE}GB"
echo ""

read -p "Deploy full node to this server? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

echo ""
echo -e "${GREEN}[1/4]${NC} Testing SSH connection..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" -o ConnectTimeout=10 "$SSH_USER@$REMOTE_HOST" "echo 'SSH connection successful'" || {
    echo -e "${RED}Failed to connect to remote server${NC}"
    exit 1
}

echo -e "${GREEN}[2/4]${NC} Copying installation script..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scp -i "$SSH_KEY" -P "$SSH_PORT" "$SCRIPT_DIR/install-fullnode.sh" "$SSH_USER@$REMOTE_HOST:/tmp/"

echo -e "${GREEN}[3/4]${NC} Running installation on remote server..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$REMOTE_HOST" << EOF
export RPC_PORT=$RPC_PORT
export P2P_PORT=$P2P_PORT
export STORAGE_SIZE=$STORAGE_SIZE
chmod +x /tmp/install-fullnode.sh
sudo /tmp/install-fullnode.sh
EOF

echo -e "${GREEN}[4/4]${NC} Starting full node..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$REMOTE_HOST" "sudo systemctl start chaincore-fullnode"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              REMOTE DEPLOYMENT COMPLETE!                               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Full Node Details:${NC}"
echo -e "  Server:       $REMOTE_HOST"
echo -e "  RPC Endpoint: http://$REMOTE_HOST:$RPC_PORT"
echo -e "  P2P Port:     $P2P_PORT"
echo ""
echo -e "${CYAN}Lite nodes can connect using:${NC}"
echo -e "  RPC_ENDPOINTS=http://$REMOTE_HOST:$RPC_PORT bash install-litenode.sh"
echo ""
echo -e "${CYAN}Monitor logs:${NC}"
echo -e "  ssh -i $SSH_KEY -p $SSH_PORT $SSH_USER@$REMOTE_HOST 'journalctl -u chaincore-fullnode -f'"
