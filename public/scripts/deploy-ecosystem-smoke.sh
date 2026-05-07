#!/usr/bin/env bash
# INF-14 — End-to-end smoke test for the GydsChain ecosystem.
#
# Verifies a freshly deployed stack is healthy across every layer:
#   1. Docker daemon + compose available
#   2. Required env vars (or auto-generate) and .env present
#   3. Indexer Postgres responds to a trivial query
#   4. Explorer container is healthy
#   5. Public RPC endpoints respond to eth_blockNumber
#   6. Bootnodes endpoint returns valid JSON for the active network
#   7. Frontend (CloudPanel / nginx) returns 200 on /
#
# Exit code: 0 = all green, 1 = any check failed. Non-interactive — safe
# to wire into CI / cron / a post-deploy hook.
#
# Usage:
#   ./public/scripts/deploy-ecosystem-smoke.sh           # default: mainnet
#   NETWORK=testnet ./public/scripts/deploy-ecosystem-smoke.sh
#   FRONTEND_URL=https://netlifegy.com ./...

set -u

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0
NETWORK="${NETWORK:-mainnet}"
FRONTEND_URL="${FRONTEND_URL:-https://netlifegy.com}"
BOOTNODES_URL="${BOOTNODES_URL:-https://rmwldjwkyhhaoqehdrbr.functions.supabase.co/bootnodes}"

case "$NETWORK" in
  mainnet) RPC_URLS=("https://rpc.netlifegy.com" "https://rpc2.netlifegy.com" "https://rpc3.netlifegy.com") ;;
  testnet) RPC_URLS=("https://testnet-rpc.netlifegy.com") ;;
  devnet)  RPC_URLS=("https://devnet-rpc.netlifegy.com" "http://127.0.0.1:8000") ;;
  *) echo -e "${RED}Unknown NETWORK=$NETWORK${NC}"; exit 1 ;;
esac

ok()   { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
section() { echo; echo -e "${YELLOW}── $1 ──${NC}"; }

section "1. Tooling"
command -v docker >/dev/null 2>&1 && ok "docker present" || fail "docker missing"
( docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1 ) \
  && ok "docker compose plugin present" || fail "docker compose missing"
command -v curl >/dev/null 2>&1 && ok "curl present" || fail "curl missing"
command -v psql >/dev/null 2>&1 && ok "psql present" || warn "psql missing (indexer check skipped)"

section "2. Environment file"
ENV_FILE="$(dirname "$0")/../docker/.env"
if [ -f "$ENV_FILE" ]; then
  ok ".env exists at $ENV_FILE"
  if grep -q '^INDEXER_DB_PASSWORD=' "$ENV_FILE"; then
    ok "INDEXER_DB_PASSWORD set"
  else
    fail "INDEXER_DB_PASSWORD missing from .env"
  fi
else
  fail ".env missing — run deploy-ecosystem.sh first"
fi

section "3. Container health"
COMPOSE_DIR="$(dirname "$0")/../docker"
if [ -d "$COMPOSE_DIR" ]; then
  if (cd "$COMPOSE_DIR" && docker compose ps --status running 2>/dev/null | grep -q explorer); then
    ok "explorer container running"
  else
    fail "explorer container not running"
  fi
  if (cd "$COMPOSE_DIR" && docker compose ps --status running 2>/dev/null | grep -q indexer); then
    ok "indexer container running"
  else
    fail "indexer container not running"
  fi
else
  fail "docker dir not found ($COMPOSE_DIR)"
fi

section "4. Indexer Postgres"
if command -v psql >/dev/null 2>&1; then
  if PGPASSWORD="$(grep -E '^INDEXER_DB_PASSWORD=' "$ENV_FILE" 2>/dev/null | cut -d= -f2)" \
     psql -h 127.0.0.1 -p 5432 -U gyds -d gydschain -c "SELECT 1" >/dev/null 2>&1; then
    ok "indexer responds to SELECT 1"
  else
    fail "indexer SELECT 1 failed"
  fi
fi

section "5. Public RPC endpoints"
for url in "${RPC_URLS[@]}"; do
  resp=$(curl -fsS --max-time 5 -X POST -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' "$url" 2>/dev/null)
  if echo "$resp" | grep -q '"result":"0x'; then
    ok "$url → $(echo "$resp" | sed -E 's/.*"result":"([^"]+)".*/\1/')"
  else
    fail "$url unreachable or bad response"
  fi
done

section "6. Bootnodes endpoint"
resp=$(curl -fsS --max-time 5 "$BOOTNODES_URL?network=$NETWORK" 2>/dev/null)
if echo "$resp" | grep -q '"chain_id"' && echo "$resp" | grep -q '"bootnodes"'; then
  ok "bootnodes endpoint OK for $NETWORK"
else
  fail "bootnodes endpoint missing chain_id/bootnodes"
fi

section "7. Frontend reachability"
code=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 8 "$FRONTEND_URL" 2>/dev/null || echo "000")
if [ "$code" = "200" ]; then
  ok "$FRONTEND_URL → 200"
else
  fail "$FRONTEND_URL → $code"
fi

echo
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}All $PASS checks passed.${NC}"
  exit 0
else
  echo -e "${RED}$FAIL failed, $PASS passed.${NC}"
  exit 1
fi
