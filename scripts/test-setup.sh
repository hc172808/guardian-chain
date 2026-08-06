#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  ChainCore / GYDSchain — Setup Verification Test Suite v1.0.0              ║
# ║  Tests every installed component and DB connection for correctness.        ║
# ║                                                                              ║
# ║  Usage:                                                                      ║
# ║    sudo bash scripts/test-setup.sh                   # all tests            ║
# ║    sudo bash scripts/test-setup.sh --db-only         # database only        ║
# ║    sudo bash scripts/test-setup.sh --services-only   # services only        ║
# ║    DATABASE_URL=postgresql://... bash scripts/test-setup.sh                 ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -uo pipefail

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

PASS=0; FAIL=0; WARN=0
RESULTS=()

pass() { PASS=$((PASS+1)); RESULTS+=("${GREEN}[PASS]${NC} $1"); echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { FAIL=$((FAIL+1)); RESULTS+=("${RED}[FAIL]${NC} $1 — $2"); echo -e "${RED}[FAIL]${NC} $1 — $2"; }
warn() { WARN=$((WARN+1)); RESULTS+=("${YELLOW}[WARN]${NC} $1"); echo -e "${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }
section() { echo ""; echo -e "${BOLD}${CYAN}══ $1 ══${NC}"; }

# ─── Args ─────────────────────────────────────────────────────────────────────
DB_ONLY=false; SERVICES_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --db-only)       DB_ONLY=true ;;
    --services-only) SERVICES_ONLY=true ;;
  esac
done

# ─── Load .env if present ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(dirname "$SCRIPT_DIR")}"
ENV_FILE="${APP_DIR}/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
  info "Loaded .env from $ENV_FILE"
fi

echo ""
echo -e "${BOLD}${CYAN}ChainCore — Setup Verification Test Suite${NC}"
echo -e "  App dir : ${APP_DIR}"
echo -e "  Date    : $(date '+%Y-%m-%d %H:%M:%S')"

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — Core CLI tools
# ══════════════════════════════════════════════════════════════════════════════
if ! $DB_ONLY; then
section "1. Core CLI tools"

check_cmd() {
  local cmd="$1"; local label="${2:-$1}"; local ver_flag="${3:---version}"
  if command -v "$cmd" &>/dev/null; then
    local ver
    ver=$($cmd $ver_flag 2>&1 | head -1 | tr -d '\n')
    pass "$label — $ver"
  else
    fail "$label" "not found (run scripts/requirements.sh)"
  fi
}

check_cmd git    "Git"
check_cmd curl   "curl"
check_cmd wget   "wget"
check_cmd jq     "jq"
check_cmd openssl "OpenSSL" "version"
check_cmd unzip  "unzip"

fi  # !DB_ONLY

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — Node.js / npm / PM2
# ══════════════════════════════════════════════════════════════════════════════
if ! $DB_ONLY; then
section "2. Node.js / npm / PM2"

if command -v node &>/dev/null; then
  NODE_VER=$(node --version 2>/dev/null)
  NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1 | tr -d v)
  if [[ "$NODE_MAJOR" -ge 20 ]]; then
    pass "Node.js — ${NODE_VER}"
  else
    fail "Node.js" "version ${NODE_VER} is below minimum v20 LTS"
  fi
else
  fail "Node.js" "not found"
fi

if command -v npm &>/dev/null; then
  pass "npm — $(npm --version)"
else
  fail "npm" "not found"
fi

if command -v pm2 &>/dev/null; then
  pass "PM2 — $(pm2 --version 2>/dev/null | tail -1)"
else
  warn "PM2 not installed (needed to run the dashboard as a service)"
fi

# Check node_modules
if [[ -d "${APP_DIR}/node_modules" ]]; then
  COUNT=$(ls "${APP_DIR}/node_modules" 2>/dev/null | wc -l)
  pass "node_modules — ${COUNT} packages installed"
else
  fail "node_modules" "missing — run: npm install"
fi

# Check build output
if [[ -d "${APP_DIR}/dist" ]]; then
  SIZE=$(du -sh "${APP_DIR}/dist" 2>/dev/null | cut -f1)
  pass "Build output — dist/ exists (${SIZE})"
else
  warn "dist/ not found — run: npm run build (needed for production)"
fi

fi  # !DB_ONLY

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — PostgreSQL server + client
# ══════════════════════════════════════════════════════════════════════════════
if ! $SERVICES_ONLY; then
section "3. PostgreSQL"

# 3a. psql client
if command -v psql &>/dev/null; then
  PSQL_VER=$(psql --version 2>/dev/null | awk '{print $3}')
  pass "psql client — ${PSQL_VER}"
else
  fail "psql client" "not found — install postgresql-client-16"
fi

# 3b. pg_dump / pg_restore
for tool in pg_dump pg_restore pg_isready createdb dropdb; do
  if command -v "$tool" &>/dev/null; then
    pass "${tool} — available"
  else
    warn "${tool} not found (some backup/restore operations will fail)"
  fi
done

# 3c. PostgreSQL service
if systemctl is-active --quiet postgresql 2>/dev/null || \
   systemctl is-active --quiet postgresql-16 2>/dev/null; then
  pass "PostgreSQL service — running"
else
  # Check if it's the Replit managed DB (no local service needed)
  if [[ -n "${DATABASE_URL:-}" ]] && echo "$DATABASE_URL" | grep -q "neon\|supabase\|replit\|amazonaws\|digitalocean\|planetscale"; then
    pass "PostgreSQL — using managed/remote database (no local service needed)"
  else
    warn "PostgreSQL service is not running (may be remote)"
  fi
fi

# 3d. Connection test
if [[ -n "${DATABASE_URL:-}" ]]; then
  info "Testing database connection: ${DATABASE_URL%%@*}@..."
  if psql "${DATABASE_URL}" -c "SELECT version();" &>/dev/null 2>&1; then
    DB_VER=$(psql "${DATABASE_URL}" -t -c "SELECT version();" 2>/dev/null | head -1 | sed 's/^ *//')
    pass "DB connection — OK (${DB_VER})"

    # 3e. Count tables
    TABLE_COUNT=$(psql "${DATABASE_URL}" -t -c \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" \
      2>/dev/null | tr -d ' \n' || echo "?")
    if [[ "$TABLE_COUNT" =~ ^[0-9]+$ ]] && [[ "$TABLE_COUNT" -ge 10 ]]; then
      pass "Schema — ${TABLE_COUNT} tables found"
    elif [[ "$TABLE_COUNT" =~ ^[0-9]+$ ]]; then
      warn "Schema — only ${TABLE_COUNT} tables found (expected 60+, start the server to trigger startup-migrate)"
    else
      warn "Schema — could not count tables"
    fi

    # 3f. Check critical tables exist
    CRITICAL_TABLES="users wallets tokens user_roles node_installations"
    for t in $CRITICAL_TABLES; do
      EXISTS=$(psql "${DATABASE_URL}" -t -c \
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${t}');" \
        2>/dev/null | tr -d ' \n')
      if [[ "$EXISTS" == "t" ]]; then
        pass "Table ${t} — exists"
      else
        fail "Table ${t}" "missing — start the server once to apply startup-migrate"
      fi
    done

    # 3g. Check token_standard column (new)
    TOKEN_STD=$(psql "${DATABASE_URL}" -t -c \
      "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='tokens' AND column_name='token_standard');" \
      2>/dev/null | tr -d ' \n')
    if [[ "$TOKEN_STD" == "t" ]]; then
      pass "tokens.token_standard column — present"
    else
      warn "tokens.token_standard column — missing (start server to apply migration)"
    fi

    # 3h. Check for default users (founder/admin)
    USER_COUNT=$(psql "${DATABASE_URL}" -t -c \
      "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' \n' || echo "?")
    if [[ "$USER_COUNT" =~ ^[0-9]+$ ]] && [[ "$USER_COUNT" -ge 2 ]]; then
      pass "Seed users — ${USER_COUNT} user(s) found"
    elif [[ "$USER_COUNT" == "0" ]]; then
      warn "No users in DB yet — start the server to seed founder/admin accounts"
    else
      warn "Seed users — could not count"
    fi

  else
    fail "DB connection" "cannot connect — check DATABASE_URL: ${DATABASE_URL%%:*}://..."
  fi
else
  warn "DATABASE_URL not set — skipping connection tests"
fi

fi  # !SERVICES_ONLY

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — Nginx
# ══════════════════════════════════════════════════════════════════════════════
if ! $DB_ONLY; then
section "4. Nginx"

if command -v nginx &>/dev/null; then
  NGINX_VER=$(nginx -v 2>&1 | grep -o 'nginx/[0-9.]*')
  pass "Nginx binary — ${NGINX_VER}"

  if nginx -t &>/dev/null 2>&1; then
    pass "Nginx config — valid"
  else
    fail "Nginx config" "$(nginx -t 2>&1 | tail -2)"
  fi

  if systemctl is-active --quiet nginx 2>/dev/null; then
    pass "Nginx service — running"
  else
    warn "Nginx service — not running (start with: systemctl start nginx)"
  fi
else
  warn "Nginx not installed (only needed for production server)"
fi

fi  # !DB_ONLY

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — Firewall (UFW)
# ══════════════════════════════════════════════════════════════════════════════
if ! $DB_ONLY; then
section "5. Firewall"

if command -v ufw &>/dev/null; then
  UFW_STATUS=$(ufw status 2>/dev/null | head -1)
  if echo "$UFW_STATUS" | grep -q "active"; then
    pass "UFW — active"
    # Check SSH is allowed (safety check)
    if ufw status 2>/dev/null | grep -q "22\|OpenSSH\|SSH"; then
      pass "UFW — SSH (port 22) allowed"
    else
      fail "UFW — SSH" "port 22 is NOT in UFW allow rules — you may lock yourself out!"
    fi
  else
    warn "UFW — not active (run: ufw enable)"
  fi
else
  warn "UFW not installed (firewall recommended in production)"
fi

fi  # !DB_ONLY

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — Go toolchain
# ══════════════════════════════════════════════════════════════════════════════
if ! $DB_ONLY; then
section "6. Go toolchain (blockchain nodes)"

GO_BIN=$(command -v go 2>/dev/null || echo /usr/local/go/bin/go)
if [[ -x "$GO_BIN" ]]; then
  GO_VER=$($GO_BIN version 2>/dev/null | awk '{print $3}')
  pass "Go — ${GO_VER}"
else
  warn "Go not installed (only needed to build blockchain node binaries)"
fi

fi  # !DB_ONLY

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7 — Docker
# ══════════════════════════════════════════════════════════════════════════════
if ! $DB_ONLY; then
section "7. Docker"

if command -v docker &>/dev/null; then
  DOCKER_VER=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ,)
  pass "Docker — ${DOCKER_VER}"

  if docker compose version &>/dev/null 2>&1; then
    pass "Docker Compose — $(docker compose version 2>/dev/null | awk '{print $4}')"
  else
    warn "Docker Compose plugin not available (run: apt install docker-compose-plugin)"
  fi

  if systemctl is-active --quiet docker 2>/dev/null; then
    pass "Docker service — running"
  else
    warn "Docker service — not running (start with: systemctl start docker)"
  fi
else
  warn "Docker not installed (only needed for containerised node deployments)"
fi

fi  # !DB_ONLY

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 8 — WireGuard
# ══════════════════════════════════════════════════════════════════════════════
if ! $DB_ONLY; then
section "8. WireGuard"

if command -v wg &>/dev/null; then
  WG_VER=$(wg --version 2>/dev/null || echo "installed")
  pass "WireGuard — ${WG_VER}"

  # IP forwarding check
  IP_FWD=$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null)
  if [[ "$IP_FWD" == "1" ]]; then
    pass "IP forwarding — enabled"
  else
    warn "IP forwarding — disabled (required for WireGuard routing; add net.ipv4.ip_forward=1 to /etc/sysctl.conf)"
  fi
else
  warn "WireGuard not installed (only needed for VPN mesh between nodes)"
fi

fi  # !DB_ONLY

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 9 — Application API health
# ══════════════════════════════════════════════════════════════════════════════
if ! $DB_ONLY; then
section "9. Application health"

API_PORT="${PORT:-5001}"
API_URL="http://127.0.0.1:${API_PORT}"

if curl -sf --max-time 5 "${API_URL}/api/health" &>/dev/null 2>&1; then
  HEALTH=$(curl -sf --max-time 5 "${API_URL}/api/health" 2>/dev/null || echo '{}')
  pass "API server — responding on :${API_PORT}"
  info "  Response: ${HEALTH}"
elif curl -sf --max-time 3 "${API_URL}/" &>/dev/null 2>&1; then
  pass "API server — responding on :${API_PORT} (no /api/health endpoint)"
else
  warn "API server — not responding on :${API_PORT} (start with: npm run dev or pm2 start ecosystem.config.cjs)"
fi

VITE_PORT="${VITE_PORT:-5000}"
if curl -sf --max-time 3 "http://127.0.0.1:${VITE_PORT}/" &>/dev/null 2>&1; then
  pass "Frontend — Vite serving on :${VITE_PORT}"
else
  warn "Frontend — not found on :${VITE_PORT} (start with: npm run dev)"
fi

fi  # !DB_ONLY

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 10 — Environment variables
# ══════════════════════════════════════════════════════════════════════════════
section "10. Environment variables"

check_env() {
  local var="$1"; local required="${2:-false}"
  local val="${!var:-}"
  if [[ -n "$val" ]]; then
    # Mask sensitive values
    if [[ "$var" =~ (SECRET|PASSWORD|PASS|TOKEN|KEY|PRIVATE) ]]; then
      pass "env ${var} — set (****)"
    else
      pass "env ${var} — ${val}"
    fi
  elif [[ "$required" == "true" ]]; then
    fail "env ${var}" "not set (required)"
  else
    warn "env ${var} — not set (optional)"
  fi
}

check_env DATABASE_URL    "true"
check_env SESSION_SECRET  "true"
check_env NODE_ENV        "false"
check_env PORT            "false"
check_env FOUNDER_WALLET  "false"
check_env ADMIN_WALLET    "false"
check_env TELEGRAM_BOT_TOKEN "false"
check_env SMTP_HOST          "false"

# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                     TEST SUITE RESULTS                              ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Passed :${NC} ${PASS}"
echo -e "  ${YELLOW}Warnings:${NC} ${WARN}"
echo -e "  ${RED}Failed :${NC} ${FAIL}"
echo ""

if [[ $FAIL -eq 0 && $WARN -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}✅  All checks passed — server is ready.${NC}"
elif [[ $FAIL -eq 0 ]]; then
  echo -e "  ${YELLOW}${BOLD}⚠  Setup complete with warnings — review items above.${NC}"
else
  echo -e "  ${RED}${BOLD}✗  ${FAIL} critical check(s) failed — fix before deploying.${NC}"
fi

echo ""

# Exit with failure if any critical tests failed
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
