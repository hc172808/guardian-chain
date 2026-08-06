#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain — Script Test Suite
#  Tests all bash scripts for syntax, structure, and required content.
#  Safe to run on any machine — no changes are made to the system.
#
#  Usage:
#    bash scripts/test-scripts.sh           # test all scripts
#    bash scripts/test-scripts.sh --verbose # verbose output
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

VERBOSE=false
[[ "${1:-}" == "--verbose" ]] && VERBOSE=true

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
PASS=0; FAIL=0; WARN=0

pass() { echo -e "  ${GREEN}[PASS]${NC} $*"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}[FAIL]${NC} $*"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $*"; WARN=$((WARN + 1)); }
info() { echo -e "  ${CYAN}[INFO]${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo ""
echo -e "${BOLD}${CYAN}GYDSchain Script Test Suite${NC}"
echo -e "────────────────────────────────────────"
echo ""

# ─── Helpers ─────────────────────────────────────────────────────────────────
check_syntax() {
  local file="$1"
  if bash -n "$file" 2>/dev/null; then
    pass "Syntax OK: $(basename "$file")"
    return 0
  else
    fail "Syntax error in: $(basename "$file")"
    bash -n "$file" 2>&1 | sed 's/^/    /'
    return 1
  fi
}

check_executable() {
  local file="$1"
  if [[ -x "$file" ]]; then
    pass "Executable: $(basename "$file")"
  else
    warn "Not executable: $(basename "$file") (run: chmod +x $file)"
  fi
}

check_shebang() {
  local file="$1"
  local first
  first="$(head -1 "$file")"
  if [[ "$first" == "#!/usr/bin/env bash" ]]; then
    pass "Shebang OK: $(basename "$file")"
  else
    warn "Missing/non-portable shebang in $(basename "$file"): $first"
  fi
}

check_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    [[ "$VERBOSE" == "true" ]] && pass "$label: $(basename "$file")"
    return 0
  else
    fail "Missing '$label' in $(basename "$file")"
    return 1
  fi
}

check_no_pattern() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    fail "Found dangerous pattern '$label' in $(basename "$file")"
    grep -n "$pattern" "$file" | head -3 | sed 's/^/    /'
    return 1
  else
    [[ "$VERBOSE" == "true" ]] && pass "No '$label' in $(basename "$file")"
    return 0
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
echo -e "${BOLD}[ 1 ] Locate scripts${NC}"
# ═════════════════════════════════════════════════════════════════════════════

SCRIPTS=(
  "$SCRIPT_DIR/setup-ubuntu-server.sh"
  "$SCRIPT_DIR/setup-validator-node.sh"
)

# Also include legacy scripts in public/scripts/
LEGACY_SCRIPTS=()
for f in "$REPO_ROOT/public/scripts/"*.sh; do
  [[ -f "$f" ]] && LEGACY_SCRIPTS+=("$f")
done

ALL_SCRIPTS=("${SCRIPTS[@]}" "${LEGACY_SCRIPTS[@]}")

for s in "${ALL_SCRIPTS[@]}"; do
  if [[ -f "$s" ]]; then
    pass "Found: ${s#$REPO_ROOT/}"
  else
    fail "Missing: ${s#$REPO_ROOT/}"
  fi
done

echo ""
echo -e "${BOLD}[ 2 ] Syntax check (bash -n)${NC}"
# ═════════════════════════════════════════════════════════════════════════════
for s in "${ALL_SCRIPTS[@]}"; do
  [[ -f "$s" ]] && check_syntax "$s"
done

echo ""
echo -e "${BOLD}[ 3 ] Shebang check${NC}"
# ═════════════════════════════════════════════════════════════════════════════
for s in "${ALL_SCRIPTS[@]}"; do
  [[ -f "$s" ]] && check_shebang "$s"
done

echo ""
echo -e "${BOLD}[ 4 ] Executable bit${NC}"
# ═════════════════════════════════════════════════════════════════════════════
for s in "${ALL_SCRIPTS[@]}"; do
  [[ -f "$s" ]] && check_executable "$s"
done

echo ""
echo -e "${BOLD}[ 5 ] Required content — setup-ubuntu-server.sh${NC}"
# ═════════════════════════════════════════════════════════════════════════════
S="$SCRIPT_DIR/setup-ubuntu-server.sh"
if [[ -f "$S" ]]; then
  check_contains "$S" "set -euo pipefail"    "strict mode"
  check_contains "$S" "EUID -eq 0"           "root check"
  check_contains "$S" "GO_VERSION"           "Go installation"
  check_contains "$S" "apt-get"              "apt package install"
  check_contains "$S" "ufw"                  "firewall setup"
  check_contains "$S" "fail2ban"             "fail2ban setup"
  check_contains "$S" "nginx"                "nginx setup"
  check_contains "$S" "certbot"              "SSL/certbot"
  check_contains "$S" "wireguard"            "WireGuard"
  check_contains "$S" "gyds-fullnode"        "binary install"
  check_contains "$S" "logrotate"            "log rotation"
  check_contains "$S" "sysctl"               "kernel tuning"
  check_contains "$S" "CHAIN_ID"             "chain ID config"
  check_contains "$S" "198282"                "correct chain ID"
  check_contains "$S" "netlifegy.com"        "domain reference"
  check_contains "$S" "gydschain"            "service user"
fi

echo ""
echo -e "${BOLD}[ 6 ] Required content — setup-validator-node.sh${NC}"
# ═════════════════════════════════════════════════════════════════════════════
S="$SCRIPT_DIR/setup-validator-node.sh"
if [[ -f "$S" ]]; then
  check_contains "$S" "set -euo pipefail"        "strict mode"
  check_contains "$S" "EUID -eq 0"               "root check"
  check_contains "$S" "WALLET_ADDR"              "wallet address"
  check_contains "$S" "validator.key"            "validator key"
  check_contains "$S" "validator.toml"           "config file"
  check_contains "$S" "gyds-validator.service"   "systemd service"
  check_contains "$S" "systemctl enable"         "service enable"
  check_contains "$S" "systemctl start"          "service start"
  check_contains "$S" "WireGuard"                "WireGuard"
  check_contains "$S" "commission"               "commission config"
  check_contains "$S" "slashing"                 "slashing config"
  check_contains "$S" "NoNewPrivileges"          "systemd hardening"
  check_contains "$S" "ProtectSystem"            "systemd hardening"
  check_contains "$S" "logrotate"                "log rotation"
  check_contains "$S" "CHAIN_ID"                 "chain ID"
  check_contains "$S" "198282"                    "correct chain ID"
  check_contains "$S" 'WALLET_ADDR.*=~'           "wallet address validation"
  check_contains "$S" "BACK UP"                  "key backup warning"
fi

echo ""
echo -e "${BOLD}[ 7 ] Security checks${NC}"
# ═════════════════════════════════════════════════════════════════════════════
for s in "${SCRIPTS[@]}"; do
  [[ ! -f "$s" ]] && continue
  # No hardcoded passwords
  check_no_pattern "$s" "password=.*[a-z0-9]" "hardcoded password"
  # No curl | bash patterns
  check_no_pattern "$s" "curl.*|.*bash"        "curl-pipe-bash"
  check_no_pattern "$s" "wget.*|.*bash"        "wget-pipe-bash"
  # set -e should be present
  check_contains   "$s" "set -e"               "error-exit mode"
done

echo ""
echo -e "${BOLD}[ 8 ] Legacy scripts in public/scripts/${NC}"
# ═════════════════════════════════════════════════════════════════════════════
for s in "${LEGACY_SCRIPTS[@]}"; do
  [[ ! -f "$s" ]] && continue
  NAME="$(basename "$s")"
  # Syntax check only for legacy — don't enforce all new standards
  if bash -n "$s" 2>/dev/null; then
    pass "Syntax OK: $NAME"
  else
    fail "Syntax error: $NAME"
  fi
done

echo ""
echo -e "${BOLD}[ 9 ] Chain ID consistency${NC}"
# ═════════════════════════════════════════════════════════════════════════════
info "Checking all scripts reference chain ID 198282 (not other IDs)..."
WRONG_ID=0
for s in "${ALL_SCRIPTS[@]}"; do
  [[ ! -f "$s" ]] && continue
  # Check for wrong chain IDs (1=mainnet, 5=goerli, etc.)
  if grep -qE 'CHAIN_ID[=: ]+[0-9]+' "$s"; then
    IDS="$(grep -oE 'CHAIN_ID[=: ]+[0-9]+' "$s" | grep -oE '[0-9]+' | sort -u)"
    for id in $IDS; do
      if [[ "$id" != "198282" && "$id" != "0" ]]; then
        warn "Unexpected chain ID $id in $(basename "$s")"
        WRONG_ID=1
      fi
    done
  fi
done
[[ "$WRONG_ID" -eq 0 ]] && pass "All chain IDs are 198282"

echo ""
echo -e "${BOLD}[ 10 ] Help flag smoke test${NC}"
# ═════════════════════════════════════════════════════════════════════════════
for s in "${SCRIPTS[@]}"; do
  [[ ! -f "$s" ]] && continue
  if bash "$s" --help 2>/dev/null | grep -q "Usage\|usage\|--" 2>/dev/null; then
    pass "--help works: $(basename "$s")"
  else
    warn "--help not implemented or no output: $(basename "$s")"
  fi
done

# ═════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "────────────────────────────────────────"
echo -e "${BOLD}Results:${NC}  ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}  ${YELLOW}${WARN} warnings${NC}"
echo ""

if (( FAIL > 0 )); then
  echo -e "${RED}${BOLD}❌  ${FAIL} test(s) failed. Fix issues above before deploying.${NC}"
  echo ""
  exit 1
elif (( WARN > 0 )); then
  echo -e "${YELLOW}${BOLD}⚠️   All tests passed with ${WARN} warning(s).${NC}"
  echo -e "    Warnings won't block deployment but should be reviewed."
  echo ""
  exit 0
else
  echo -e "${GREEN}${BOLD}✅  All ${PASS} tests passed.${NC}"
  echo ""
  exit 0
fi
