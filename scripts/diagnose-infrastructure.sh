#!/usr/bin/env bash
#
# GYDS / ChainCore infrastructure diagnostics
#
# Safe by default: this script only reads local service state and performs
# connection probes. It does not change firewall rules, database data, or
# node configuration.
#
# Examples:
#   bash scripts/diagnose-infrastructure.sh
#   bash scripts/diagnose-infrastructure.sh --base-url https://app.example.com
#   bash scripts/diagnose-infrastructure.sh --peer 203.0.113.10:30303 --peer 203.0.113.11:30306
#   GYDS_BOOTSTRAP_NODES=203.0.113.10:30303,203.0.113.11:30306 bash scripts/diagnose-infrastructure.sh
#
set -uo pipefail

BASE_URL="${GYDS_BASE_URL:-http://127.0.0.1:5001}"
RPC_URL="${GYDS_RPC_URL:-http://127.0.0.1:8545}"
EXPECTED_CHAIN_ID="${GYDS_CHAIN_ID:-198282}"
DB_PROBES="${GYDS_DB_PROBES:-3}"
PEERS_RAW="${GYDS_BOOTSTRAP_NODES:-}"
REPORT_DIR="${GYDS_DIAGNOSTIC_DIR:-}"
FAILURES=0
CHECKS=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "${CYAN}[INFO]${NC} $*"; }
section() { echo; echo -e "${BOLD}${CYAN}━━━ $* ━━━${NC}"; }

usage() {
  sed -n '4,15p' "$0" | sed 's/^# \?//'
  cat <<'EOF'

Options:
  --base-url URL       Dashboard/API base URL (default: GYDS_BASE_URL or :5001)
  --rpc-url URL        JSON-RPC URL (default: GYDS_RPC_URL or :8545)
  --peer HOST:PORT     Add a TCP peer probe; may be repeated
  --db-probes N        Number of one-second DB probes (default: 3)
  --report-dir DIR     Save a redacted text report in DIR
  --no-db              Skip PostgreSQL checks
  -h, --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --rpc-url) RPC_URL="${2:-}"; shift 2 ;;
    --peer) PEERS_RAW="${PEERS_RAW:+$PEERS_RAW,}${2:-}"; shift 2 ;;
    --db-probes) DB_PROBES="${2:-3}"; shift 2 ;;
    --report-dir) REPORT_DIR="${2:-}"; shift 2 ;;
    --no-db) NO_DB=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

NO_DB="${NO_DB:-0}"
[[ "$DB_PROBES" =~ ^[1-9][0-9]*$ ]] || DB_PROBES=3

redact_url() {
  # Never print DATABASE_URL credentials or URL userinfo.
  printf '%s' "$1" | sed -E 's#(://)[^/@]+@#\1***@#'
}

normalize_url() {
  local value="$1"
  value="${value%/}"
  printf '%s' "$value"
}

BASE_URL="$(normalize_url "$BASE_URL")"
RPC_URL="$(normalize_url "$RPC_URL")"

if [[ -n "$REPORT_DIR" ]]; then
  mkdir -p "$REPORT_DIR" 2>/dev/null || {
    echo "Cannot create report directory: $REPORT_DIR" >&2
    exit 2
  }
  REPORT_FILE="$REPORT_DIR/gyds-diagnostics-$(date +%Y%m%d-%H%M%S).txt"
  # Keep terminal output and a copy of the report, without duplicating stderr.
  exec > >(tee "$REPORT_FILE") 2>&1
  info "Saving redacted report to $REPORT_FILE"
fi

echo -e "${BOLD}GYDS infrastructure diagnostics${NC}"
info "Base API: $(redact_url "$BASE_URL")"
info "RPC:      $(redact_url "$RPC_URL")"
info "Chain ID: $EXPECTED_CHAIN_ID"

section "Local prerequisites"
for command_name in curl; do
  CHECKS=$((CHECKS + 1))
  if command -v "$command_name" >/dev/null 2>&1; then
    ok "$command_name is installed"
  else
    fail "$command_name is not installed"
  fi
done
if command -v ss >/dev/null 2>&1; then
  ok "ss is installed (local listener details will be shown)"
else
  warn "ss is not installed (local listener details will be skipped)"
fi
for command_name in psql pg_isready; do
  if command -v "$command_name" >/dev/null 2>&1; then
    ok "$command_name is installed"
  else
    warn "$command_name is not installed (database checks will be limited)"
  fi
done

section "Dashboard/API routing"
check_json_endpoint() {
  local label="$1" url="$2" body_file status content_type
  CHECKS=$((CHECKS + 1))
  body_file="$(mktemp)"
  status="$(curl -sS --max-time 10 -o "$body_file" -w '%{http_code}' \
    -H 'Accept: application/json' "$url" 2>/dev/null || printf '000')"
  content_type="$(curl -sSI --max-time 10 -H 'Accept: application/json' "$url" 2>/dev/null |
    awk -F': ' 'tolower($1)=="content-type" {gsub("\r","",$2); print $2; exit}')"
  if [[ "$status" == "200" ]] && grep -qE '^[[:space:]]*[{[]' "$body_file"; then
    if [[ "$content_type" == application/json* || -z "$content_type" ]]; then
      ok "$label returned HTTP 200 JSON"
    else
      warn "$label returned HTTP 200 but Content-Type is $content_type"
    fi
  elif [[ "$status" == "000" ]]; then
    fail "$label could not be reached at $(redact_url "$url")"
  else
    fail "$label returned HTTP $status instead of JSON 200"
    printf '       response: '
    head -c 220 "$body_file" | tr '\n' ' '
    echo
  fi
  rm -f "$body_file"
}

check_json_endpoint "API health" "$BASE_URL/api/health"
check_json_endpoint "Security challenge health" "$BASE_URL/api/auth/captcha/health"
check_json_endpoint "Security challenge route" "$BASE_URL/api/auth/captcha"

section "Database connectivity"
if [[ "$NO_DB" == "1" ]]; then
  info "Database checks skipped by request"
elif [[ -z "${DATABASE_URL:-}" ]]; then
  fail "DATABASE_URL is not set in this shell"
else
  info "Database URL: $(redact_url "$DATABASE_URL")"
  CHECKS=$((CHECKS + 1))
  if command -v pg_isready >/dev/null 2>&1 &&
     pg_isready -d "$DATABASE_URL" -t 8 >/dev/null 2>&1; then
    ok "PostgreSQL accepts connections"
  else
    fail "PostgreSQL readiness probe failed"
  fi

  if command -v psql >/dev/null 2>&1; then
    for ((probe=1; probe<=DB_PROBES; probe++)); do
      CHECKS=$((CHECKS + 1))
      query_output="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
        -c "SELECT current_database() || '|' || pg_backend_pid() || '|' || now()::text;" \
        2>&1)"
      if [[ "$query_output" == *"|"* ]]; then
        ok "Database query probe $probe/$DB_PROBES succeeded"
        info "  $query_output"
      else
        fail "Database query probe $probe/$DB_PROBES failed"
        printf '       %s\n' "$(printf '%s' "$query_output" | tail -n 1)"
      fi
      [[ "$probe" -lt "$DB_PROBES" ]] && sleep 1
    done

    CHECKS=$((CHECKS + 1))
    table_count="$(psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 \
      -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || true)"
    if [[ "$table_count" =~ ^[0-9]+$ ]] && [[ "$table_count" -gt 0 ]]; then
      ok "Database schema is visible ($table_count public tables)"
    else
      warn "Connected to PostgreSQL but could not count public tables"
    fi
  else
    warn "psql is unavailable; install PostgreSQL client tools for query probes"
  fi
fi

section "RPC and chain identity"
rpc_call() {
  local method="$1"
  curl -sS --max-time 10 -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":[]}" \
    "$RPC_URL" 2>/dev/null
}
CHECKS=$((CHECKS + 1))
chain_response="$(rpc_call eth_chainId)"
expected_hex="0x$(printf '%x' "$EXPECTED_CHAIN_ID" 2>/dev/null || true)"
if [[ "$chain_response" == *"\"result\":\"$expected_hex\""* ]]; then
  ok "RPC chain ID is $EXPECTED_CHAIN_ID ($expected_hex)"
elif [[ -n "$chain_response" ]]; then
  fail "RPC responded, but chain ID was not $EXPECTED_CHAIN_ID"
  printf '       response: %s\n' "$(printf '%s' "$chain_response" | head -c 220)"
else
  fail "RPC endpoint could not be reached at $(redact_url "$RPC_URL")"
fi
CHECKS=$((CHECKS + 1))
peer_response="$(rpc_call net_peerCount)"
if [[ "$peer_response" == *'"result":'* ]]; then
  ok "RPC net_peerCount is available"
  info "  $peer_response"
else
  warn "RPC net_peerCount is unavailable (node may be healthy but peer RPC may not be enabled)"
fi

section "External peer reachability"
if [[ -z "$PEERS_RAW" ]]; then
  warn "No peers supplied. Pass --peer HOST:PORT or set GYDS_BOOTSTRAP_NODES."
else
  IFS=',' read -r -a peer_list <<< "$PEERS_RAW"
  for peer in "${peer_list[@]}"; do
    peer="${peer#tcp://}"
    peer="${peer#http://}"
    peer="${peer//[[:space:]]/}"
    [[ -z "$peer" ]] && continue

    # IPv6 must be passed as [addr]:port. Strip brackets only after splitting.
    host="${peer%:*}"
    port="${peer##*:}"
    host="${host#[}"
    host="${host%]}"
    CHECKS=$((CHECKS + 1))
    if [[ -z "$host" || ! "$port" =~ ^[0-9]+$ || "$port" -lt 1 || "$port" -gt 65535 ]]; then
      fail "Invalid peer address: $peer (expected HOST:PORT)"
      continue
    fi
    if command -v getent >/dev/null 2>&1; then
      if getent ahosts "$host" >/dev/null 2>&1; then
        ok "Peer DNS resolves: $host"
      else
        fail "Peer DNS does not resolve: $host"
        continue
      fi
    fi
    if timeout 8 bash -c ":</dev/tcp/$host/$port" >/dev/null 2>&1; then
      ok "Peer TCP port is reachable: $host:$port"
    elif command -v nc >/dev/null 2>&1 && nc -z -w 8 "$host" "$port" >/dev/null 2>&1; then
      ok "Peer TCP port is reachable: $host:$port"
    else
      fail "Peer TCP port is not reachable: $host:$port"
      info "  Check the peer's public IP, cloud firewall, UFW/firewalld, and node P2P port."
    fi
  done
fi

section "Local listeners and firewall"
if command -v ss >/dev/null 2>&1; then
  info "Listening TCP sockets:"
  ss -ltn 2>/dev/null | awk 'NR==1 || /:(5001|8545|8555|8565|8575|8585|8590|8595|3030[0-9]|3031[0-9])([[:space:]]|$)/' | head -40
  info "Listening UDP sockets:"
  ss -lun 2>/dev/null | awk 'NR==1 || /:(3030[0-9]|3031[0-9])([[:space:]]|$)/' | head -40
fi
if command -v ufw >/dev/null 2>&1; then
  info "UFW status:"
  ufw status 2>/dev/null | head -30
elif command -v firewall-cmd >/dev/null 2>&1; then
  info "firewalld state:"
  firewall-cmd --state 2>/dev/null || true
  firewall-cmd --list-ports 2>/dev/null || true
else
  warn "Neither UFW nor firewalld was found; check the cloud provider firewall separately."
fi

echo
if [[ "$FAILURES" -eq 0 ]]; then
  ok "Completed $CHECKS checks with no failures."
  exit 0
else
  fail "Completed $CHECKS checks with $FAILURES failure(s)."
  exit 1
fi