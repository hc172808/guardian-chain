#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Multi-Node Installer
#  Install ANY combination of node types on a SINGLE server.
#
#  Usage:
#    sudo bash install-all-nodes.sh --bootnode --fullnode
#    sudo bash install-all-nodes.sh --all
#    sudo bash install-all-nodes.sh --litenode --rpc-port=8547 --p2p-port=30304
#
#  Flags (any combination):
#    --bootnode       Install peer-discovery bootnode  (port 30303)
#    --fullnode       Install founder full node + RPC  (ports 8546, 30303)
#    --litenode       Install lite node               (port 3030 API)
#    --rpc            Install dedicated RPC node      (port 8546)
#    --all            Install bootnode + fullnode + litenode
#
#  Port-conflict awareness: each subsequent node auto-shifts ports if needed.
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

INSTALL_BOOTNODE=false
INSTALL_FULLNODE=false
INSTALL_LITENODE=false
INSTALL_RPC=false

for arg in "$@"; do
  case "$arg" in
    --bootnode) INSTALL_BOOTNODE=true ;;
    --fullnode) INSTALL_FULLNODE=true ;;
    --litenode) INSTALL_LITENODE=true ;;
    --rpc)      INSTALL_RPC=true ;;
    --all)      INSTALL_BOOTNODE=true; INSTALL_FULLNODE=true; INSTALL_LITENODE=true ;;
    -h|--help)  sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

if ! $INSTALL_BOOTNODE && ! $INSTALL_FULLNODE && ! $INSTALL_LITENODE && ! $INSTALL_RPC; then
  echo "No node type selected. Use --bootnode, --fullnode, --litenode, --rpc, or --all"
  exit 1
fi

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)."; exit 1; }

# Default repo — individual scripts use their own repos; this is a fallback
REPO_URL="${REPO_URL:-https://github.com/hc172808/validatornode.git}"
REPO_DIR="${REPO_DIR:-/opt/guardian-chain}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export SRC_DIR="${SRC_DIR:-$(cd "$SCRIPT_DIR/../blockchain-go" 2>/dev/null && pwd || echo "")}"

# Auto-clone from guardian-chain if SRC_DIR not set
if [[ -z "$SRC_DIR" || ! -d "$SRC_DIR" ]]; then
  echo "⚙  SRC_DIR not set — cloning from ${REPO_URL}..."
  if [[ -d "${REPO_DIR}/.git" ]]; then
    echo "   Repo exists at ${REPO_DIR} — pulling latest..."
    git -C "${REPO_DIR}" pull --ff-only
  else
    git clone --depth=1 "${REPO_URL}" "${REPO_DIR}"
  fi
  export SRC_DIR="${REPO_DIR}/public/blockchain-go"
fi

[[ -d "$SRC_DIR" ]] || { echo "❌ Source not found at ${SRC_DIR}. Set REPO_URL= or SRC_DIR="; exit 1; }

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain Multi-Node Installer                                     ║"
echo "║   bootnode=${INSTALL_BOOTNODE}  fullnode=${INSTALL_FULLNODE}  litenode=${INSTALL_LITENODE}  rpc=${INSTALL_RPC}            ║"
echo "║   Source: ${SRC_DIR}"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

run() {
  local label="$1"; shift
  echo -e "\n${GREEN}━━━ Installing ${label} ━━━${NC}\n"
  "$@"
}

if $INSTALL_BOOTNODE; then
  run "bootnode" bash "$SCRIPT_DIR/install-bootnode.sh"
fi

if $INSTALL_FULLNODE; then
  run "fullnode" bash "$SCRIPT_DIR/install-fullnode.sh"
fi

if $INSTALL_RPC; then
  RPC_PORT=8547 P2P_PORT=30304 ENABLE_MINING=false \
    run "rpc node" bash "$SCRIPT_DIR/install-fullnode.sh"
fi

if $INSTALL_LITENODE; then
  # Lite node runs as a regular user (not root), so install for the SUDO_USER
  TARGET_USER="${SUDO_USER:-$USER}"
  TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
  echo -e "${GREEN}━━━ Installing litenode for user ${TARGET_USER} (HOME=${TARGET_HOME}) ━━━${NC}"
  sudo -u "$TARGET_USER" -H bash -c "SRC_DIR='$SRC_DIR' bash '$SCRIPT_DIR/install-litenode.sh'"
fi

cat <<EOF

╔═══════════════════════════════════════════════════════════════════════╗
║   ✅ Multi-node installation complete                                ║
╚═══════════════════════════════════════════════════════════════════════╝
  Active services (systemctl status <name>):
$($INSTALL_BOOTNODE && echo "    • gyds-bootnode")
$($INSTALL_FULLNODE && echo "    • gyds-fullnode")
$($INSTALL_RPC      && echo "    • gyds-fullnode (RPC mode, port 8547)")
$($INSTALL_LITENODE && echo "    • gyds-litenode (user systemd, run via systemctl --user)")

  Logs:    /var/log/gydschain/   (and ~/.gydschain/logs for litenode)
EOF
