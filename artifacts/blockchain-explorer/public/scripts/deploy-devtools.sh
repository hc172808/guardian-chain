#!/bin/bash
# GydsChain Developer Tools Deployment v2.0
# Deploys: Testnet validator, development environment
# Domain: testnet-rpc.netlifegy.com | Testnet Chain ID: 13371
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     GydsChain DevTools Deployment v2.0                    ║"
echo "║     testnet-rpc.netlifegy.com | Chain ID: 13371           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker first.${NC}"
    exit 1
fi

COMPOSE_CMD="docker compose"
if ! $COMPOSE_CMD version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
fi

cd "$(dirname "$0")/../docker"

echo -e "${GREEN}🚀 Building and starting testnet...${NC}"
$COMPOSE_CMD build testnet-validator
$COMPOSE_CMD up -d testnet-validator

echo ""
echo -e "${GREEN}✅ DevTools deployed!${NC}"
echo ""
echo -e "${CYAN}Services:${NC}"
echo -e "  Testnet RPC:     http://localhost:9546"
echo -e "  Testnet Chain ID: 13371"
echo ""
echo -e "${CYAN}Public Endpoint:${NC}"
echo -e "  testnet-rpc.netlifegy.com"
echo ""
echo -e "${CYAN}Connect wallet:${NC}"
echo -e "  Network:   GydsChain Testnet"
echo -e "  RPC URL:   https://testnet-rpc.netlifegy.com"
echo -e "  Chain ID:  13371"
echo -e "  Symbol:    GYDS"
echo ""
echo -e "${CYAN}Manage:${NC}"
echo -e "  $COMPOSE_CMD logs -f testnet-validator"
echo -e "  $COMPOSE_CMD restart testnet-validator"
