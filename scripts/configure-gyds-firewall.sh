#!/usr/bin/env bash
#
# Open the P2P port for an installed GYDS node.
# This is deliberately separate from diagnostics because it changes firewall
# state. Rules are idempotent and RPC ports are never opened by default.
#
# Examples:
#   sudo bash scripts/configure-gyds-firewall.sh --p2p-port 30303
#   sudo bash scripts/configure-gyds-firewall.sh --p2p-port 30306 --dry-run
#   sudo bash scripts/configure-gyds-firewall.sh --p2p-port 30303 --source 10.8.0.0/24
#
set -euo pipefail

P2P_PORT="${GYDS_P2P_PORT:-30303}"
SOURCE_CIDR=""
DRY_RUN=0

usage() {
  sed -n '4,10p' "$0" | sed 's/^# \?//'
  cat <<'EOF'

Options:
  --p2p-port PORT       Node P2P port (default: GYDS_P2P_PORT or 30303)
  --source CIDR         Restrict the rule to a source network (optional)
  --dry-run             Print commands without changing firewall state
  -h, --help            Show this help

This opens TCP and UDP for P2P. It does not open RPC; keep RPC bound to a
private interface or protect it with an authenticated reverse proxy/VPN.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --p2p-port) P2P_PORT="${2:-}"; shift 2 ;;
    --source) SOURCE_CIDR="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ ! "$P2P_PORT" =~ ^[0-9]+$ ]] || (( P2P_PORT < 1024 || P2P_PORT > 65535 )); then
  echo "P2P port must be an integer from 1024 to 65535." >&2
  exit 2
fi
if [[ $EUID -ne 0 && "$DRY_RUN" -ne 1 ]]; then
  echo "Run as root: sudo bash $0 $*" >&2
  exit 1
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
info() { echo -e "${CYAN}[INFO]${NC} $*"; }

rule_suffix="${SOURCE_CIDR:+ from $SOURCE_CIDR}"
echo -e "${BOLD}GYDS P2P firewall configuration${NC}"
info "Opening TCP and UDP port $P2P_PORT${rule_suffix}"

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+'
    printf ' %q' "$@"
    echo
  else
    "$@"
  fi
}

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi 'Status: active'; then
  if [[ -n "$SOURCE_CIDR" ]]; then
    run ufw allow from "$SOURCE_CIDR" to any port "$P2P_PORT" proto tcp
    run ufw allow from "$SOURCE_CIDR" to any port "$P2P_PORT" proto udp
  else
    run ufw allow "$P2P_PORT/tcp" comment "GYDS P2P"
    run ufw allow "$P2P_PORT/udp" comment "GYDS P2P"
  fi
  run ufw reload
  ok "UFW rule applied"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  if [[ -n "$SOURCE_CIDR" ]]; then
    warn "firewalld source-restricted rich rules are not added automatically."
    warn "Use the equivalent rich-rule for your active zone, then rerun diagnostics."
    exit 2
  fi
  run firewall-cmd --permanent --add-port="${P2P_PORT}/tcp"
  run firewall-cmd --permanent --add-port="${P2P_PORT}/udp"
  run firewall-cmd --reload
  ok "firewalld rules applied"
else
  warn "No active UFW or firewalld detected."
  warn "Open TCP and UDP $P2P_PORT in the cloud provider/security-group firewall."
  exit 2
fi

if command -v ss >/dev/null 2>&1; then
  if ss -ltn 2>/dev/null | grep -Eq ":${P2P_PORT}([[:space:]]|$)"; then
    ok "A local TCP service is listening on $P2P_PORT"
  else
    warn "Nothing is listening on TCP $P2P_PORT yet; firewall changes alone cannot create peers."
  fi
fi

cat <<EOF

Next steps:
  1. Run on this host:
       bash scripts/diagnose-infrastructure.sh --peer PEER_PUBLIC_IP:$P2P_PORT
  2. Run the same diagnostic from the other node back to this host.
  3. Confirm the node advertises a public/reachable address, not 127.0.0.1
     or a private LAN address.
EOF