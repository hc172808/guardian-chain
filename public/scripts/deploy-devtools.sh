#!/bin/bash
# GydsChain Developer Tools Deployment
# Deploys: Testnet, Faucet
set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       GydsChain DevTools Deployment                      ║"
echo "╚═══════════════════════════════════════════════════════════╝"

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

COMPOSE_CMD="docker compose"
if ! $COMPOSE_CMD version &> /dev/null; then
    COMPOSE_CMD="docker-compose"
fi

cd "$(dirname "$0")/../docker"

echo "🚀 Starting testnet and dev services..."
$COMPOSE_CMD up -d testnet-validator

echo ""
echo "✅ DevTools deployed!"
echo "   Testnet RPC:  http://localhost:9546"
echo "   Testnet Chain ID: 13371"
