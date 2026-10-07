#!/usr/bin/env bash
# GydsChain Remote Full Node Deployment v2.0
# Deploy full nodes to remote Ubuntu servers
# Domain: netlifegy.com | Chain ID: 198282 | FOUNDER ONLY
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     GydsChain Remote Full Node Deployment v2.0            ║"
echo "║     FOUNDER EDITION | netlifegy.com                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check requirements
command -v ssh >/dev/null 2>&1 || { echo -e "${RED}Error: ssh is required${NC}"; exit 1; }
command -v scp >/dev/null 2>&1 || { echo -e "${RED}Error: scp is required${NC}"; exit 1; }

# ─── Server Configuration ────────────────────────────────────
echo -e "${CYAN}Remote Server Configuration${NC}"
echo "───────────────────────────────────────────────────────────"

read -r -p "Remote server IPv4 address or hostname: " REMOTE_HOST
read -r -p "SSH username [root]: " SSH_USER
SSH_USER=${SSH_USER:-root}
read -r -p "SSH port [22]: " SSH_PORT
SSH_PORT=${SSH_PORT:-22}
read -r -p "SSH key path [~/.ssh/id_rsa]: " SSH_KEY
SSH_KEY="${SSH_KEY:-~/.ssh/id_rsa}"
SSH_KEY="${SSH_KEY/#\~/$HOME}"
read -r -p "Node type (validator/fullnode/rpc) [fullnode]: " NODE_TYPE
NODE_TYPE=${NODE_TYPE:-fullnode}
read -r -p "RPC port [8546]: " RPC_PORT
RPC_PORT=${RPC_PORT:-8546}
read -r -p "P2P port [30303]: " P2P_PORT
P2P_PORT=${P2P_PORT:-30303}
read -r -p "Storage size in GB [100]: " STORAGE_SIZE
STORAGE_SIZE=${STORAGE_SIZE:-100}

invalid_input() {
    echo -e "${RED}Invalid configuration: $*${NC}" >&2
    exit 2
}

valid_port() {
    [[ "$1" =~ ^[0-9]{1,5}$ ]] || return 1
    (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

[[ "$REMOTE_HOST" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ && "$REMOTE_HOST" != *..* ]] \
    || invalid_input "enter an IPv4 address or DNS hostname"
[[ "$SSH_USER" =~ ^[A-Za-z_][A-Za-z0-9_.-]*$ ]] \
    || invalid_input "SSH username contains unsupported characters"
valid_port "$SSH_PORT" || invalid_input "SSH port must be 1–65535"
valid_port "$RPC_PORT" || invalid_input "RPC port must be 1–65535"
valid_port "$P2P_PORT" || invalid_input "P2P port must be 1–65535"
[[ "$RPC_PORT" != "$P2P_PORT" ]] || invalid_input "RPC and P2P ports must differ"
[[ "$STORAGE_SIZE" =~ ^[1-9][0-9]{0,5}$ ]] \
    || invalid_input "storage size must be a positive whole number of GB"
[[ "$NODE_TYPE" =~ ^(validator|fullnode|rpc)$ ]] \
    || invalid_input "node type must be validator, fullnode, or rpc"
[[ -f "$SSH_KEY" && -r "$SSH_KEY" ]] || invalid_input "SSH key is not a readable file: $SSH_KEY"

echo ""
echo -e "${CYAN}Deployment Summary:${NC}"
echo -e "  Server:     $SSH_USER@$REMOTE_HOST:$SSH_PORT"
echo -e "  SSH Key:    $SSH_KEY"
echo -e "  Node Type:  $NODE_TYPE"
echo -e "  RPC Port:   $RPC_PORT"
echo -e "  P2P Port:   $P2P_PORT"
echo -e "  Storage:    ${STORAGE_SIZE}GB"
echo -e "  Chain ID:   198282"
echo ""

read -p "Deploy to this server? (y/n) " -n 1 -r
echo
[[ $REPLY =~ ^[Yy]$ ]] || exit 0

echo ""
echo -e "${GREEN}[1/5]${NC} Testing SSH connection..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" -o ConnectTimeout=10 "$SSH_USER@$REMOTE_HOST" "echo 'SSH OK'" || {
    echo -e "${RED}Failed to connect${NC}"
    exit 1
}

echo -e "${GREEN}[2/5]${NC} Copying installation script..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scp -i "$SSH_KEY" -P "$SSH_PORT" "$SCRIPT_DIR/install-node.sh" "$SSH_USER@$REMOTE_HOST:/tmp/"

echo -e "${GREEN}[3/5]${NC} Running installation on remote server..."
printf -v REMOTE_COMMAND \
    'export RPC_PORT=%s P2P_PORT=%s STORAGE_SIZE=%s; chmod +x /tmp/install-node.sh; sudo bash /tmp/install-node.sh %s' \
    "$RPC_PORT" "$P2P_PORT" "$STORAGE_SIZE" "$NODE_TYPE"
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$REMOTE_HOST" "$REMOTE_COMMAND"

echo -e "${GREEN}[4/5]${NC} Starting node service..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$REMOTE_HOST" "sudo systemctl start gydschain-${NODE_TYPE}"

echo -e "${GREEN}[5/5]${NC} Verifying node status..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_USER@$REMOTE_HOST" "sudo systemctl status gydschain-${NODE_TYPE} --no-pager -l" || true

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Remote deployment complete!                            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Node Details:${NC}"
echo -e "  Server:       $REMOTE_HOST"
echo -e "  Node Type:    $NODE_TYPE"
echo -e "  RPC Endpoint: http://$REMOTE_HOST:$RPC_PORT"
echo -e "  P2P Port:     $P2P_PORT"
echo -e "  Chain ID:     198282"
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
echo -e "${CYAN}Monitor:${NC}"
echo -e "  ssh -i $SSH_KEY -p $SSH_PORT $SSH_USER@$REMOTE_HOST 'journalctl -u gydschain-${NODE_TYPE} -f'"
echo -e "  ssh -i $SSH_KEY -p $SSH_PORT $SSH_USER@$REMOTE_HOST 'systemctl status gydschain-${NODE_TYPE}'"
