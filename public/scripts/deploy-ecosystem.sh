#!/bin/bash
# GydsChain Ecosystem Deployment v2.0
# Deploys: Explorer, Indexer, Staking Dashboard
# Domain: netlifegy.com | Chain ID: 13370
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       GydsChain Ecosystem Deployment v2.0                 ║"
echo "║       netlifegy.com                                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${GREEN}📦 Installing Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

COMPOSE_CMD="docker compose"
if ! $COMPOSE_CMD version &> /dev/null 2>&1; then
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        echo -e "${GREEN}📦 Installing Docker Compose plugin...${NC}"
        apt-get install -y docker-compose-plugin
    fi
fi

cd "$(dirname "$0")/../docker"

# Set secure indexer password if not set
if [ -z "$INDEXER_DB_PASSWORD" ]; then
    export INDEXER_DB_PASSWORD=$(openssl rand -hex 16)
    echo -e "${GREEN}Generated indexer DB password: $INDEXER_DB_PASSWORD${NC}"
    echo "INDEXER_DB_PASSWORD=$INDEXER_DB_PASSWORD" >> .env 2>/dev/null || true
fi

echo -e "${GREEN}🚀 Building and starting ecosystem services...${NC}"
$COMPOSE_CMD build explorer indexer
$COMPOSE_CMD up -d explorer indexer

echo ""
echo -e "${GREEN}✅ Ecosystem deployed!${NC}"
echo ""
echo -e "${CYAN}Services:${NC}"
echo -e "  Explorer:    http://localhost:3000"
echo -e "  Indexer DB:  localhost:5432"
echo ""
echo -e "${CYAN}Public Endpoints:${NC}"
echo -e "  explorer.netlifegy.com     - Block Explorer"
echo -e "  rpc.netlifegy.com          - Main RPC"
echo -e "  ws.netlifegy.com           - WebSocket"
echo ""
echo -e "${CYAN}Manage:${NC}"
echo -e "  $COMPOSE_CMD logs -f explorer"
echo -e "  $COMPOSE_CMD restart explorer"
echo -e "  $COMPOSE_CMD ps"