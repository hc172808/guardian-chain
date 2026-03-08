#!/bin/bash
# GydsChain Ecosystem Deployment
# Deploys: Explorer, Indexer, Staking Dashboard
set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       GydsChain Ecosystem Deployment                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    sudo apt-get install -y docker-compose-plugin
fi

COMPOSE_CMD="docker compose"
if ! $COMPOSE_CMD version &> /dev/null; then
    COMPOSE_CMD="docker-compose"
fi

cd "$(dirname "$0")/../docker"

echo "🚀 Starting ecosystem services..."
$COMPOSE_CMD up -d explorer indexer

echo ""
echo "✅ Ecosystem deployed!"
echo "   Explorer:  http://localhost:3000"
echo "   Indexer DB: localhost:5432"
