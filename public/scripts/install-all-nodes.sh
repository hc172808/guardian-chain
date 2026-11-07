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
INSTALL_ALL_REQUESTED=false
BOOTNODE_INSTALLED=false
BOOTNODE_SKIPPED=false

for arg in "$@"; do
  case "$arg" in
    --bootnode) INSTALL_BOOTNODE=true ;;
    --fullnode) INSTALL_FULLNODE=true ;;
    --litenode) INSTALL_LITENODE=true ;;
    --rpc)      INSTALL_RPC=true ;;
    --all)      INSTALL_ALL_REQUESTED=true; INSTALL_BOOTNODE=true; INSTALL_FULLNODE=true; INSTALL_LITENODE=true ;;
    -h|--help)  sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

if ! $INSTALL_BOOTNODE && ! $INSTALL_FULLNODE && ! $INSTALL_LITENODE && ! $INSTALL_RPC; then
  echo "No node type selected. Use --bootnode, --fullnode, --litenode, --rpc, or --all"
  exit 1
fi

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)."; exit 1; }

# Canonical source repo shared by every supported node installer
REPO_URL="${REPO_URL:-https://github.com/hc172808/fullnode.git}"
REPO_DIR="${REPO_DIR:-/opt/gyds-fullnode}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export REPO_URL REPO_DIR

# Validate every selected child's dependencies before fetching or installing.
for dependency in node-profile.sh; do
  [[ -f "$SCRIPT_DIR/$dependency" ]] || { echo "Missing $dependency" >&2; exit 1; }
done
for role in bootnode fullnode rpc litenode; do
  case "$role" in
    bootnode) selected=$INSTALL_BOOTNODE; child=install-bootnode.sh;;
    fullnode) selected=$INSTALL_FULLNODE; child=install-fullnode.sh;;
    rpc) selected=$INSTALL_RPC; child=install-fullnode.sh;;
    litenode) selected=$INSTALL_LITENODE; child=install-litenode.sh;;
  esac
  if $selected; then [[ -f "$SCRIPT_DIR/$child" ]] || { echo "Missing $child" >&2; exit 1; }; fi
done
if $INSTALL_LITENODE; then
  [[ -n "${GYDS_BOOTSTRAP_NODES:-}" && -n "${GYDS_ALLOWED_NODES:-}" ]] || {
    echo "Lite mode requires trusted GYDS_BOOTSTRAP_NODES and GYDS_ALLOWED_NODES. Configure approved peers first." >&2; exit 1;
  }
fi

# Clone the canonical source once so the selected installers share the same revision
if [[ -z "${SRC_DIR:-}" || ! -d "${SRC_DIR:-}" ]]; then
  echo "⚙  Fullnode source not set — cloning from ${REPO_URL}..."
  if [[ -d "${REPO_DIR}/.git" ]]; then
    echo "   Repo exists at ${REPO_DIR} — pulling latest..."
    git -C "${REPO_DIR}" pull --ff-only
  else
    git clone --depth=1 "${REPO_URL}" "${REPO_DIR}"
  fi
  export SRC_DIR="${REPO_DIR}"
fi

[[ -d "${SRC_DIR:-}" ]] || { echo "❌ Source not found at ${REPO_DIR}"; exit 1; }

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain Multi-Node Installer                                     ║"
echo "║   bootnode=${INSTALL_BOOTNODE}  fullnode=${INSTALL_FULLNODE}  litenode=${INSTALL_LITENODE}  rpc=${INSTALL_RPC}            ║"
echo "║   Source: ${REPO_URL}"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

run() {
  local label="$1"; shift
  echo -e "\n${GREEN}━━━ Installing ${label} ━━━${NC}\n"
  "$@"
}

if $INSTALL_BOOTNODE; then
  if $INSTALL_ALL_REQUESTED && [[ ! -d "${SRC_DIR}/cmd/bootnode" ]]; then
    echo "⚠  Skipping bootnode: ${REPO_URL} does not contain cmd/bootnode yet."
    echo "   No alternate repository was used. The selected fullnode/lite installs will continue."
    BOOTNODE_SKIPPED=true
  else
    GYDS_CONF=/dev/null P2P_PORT=30303 run "bootnode" bash "$SCRIPT_DIR/install-bootnode.sh"
    BOOTNODE_INSTALLED=true
  fi
fi

if $INSTALL_FULLNODE; then
  GYDS_CONF=/dev/null NODE_ROLE=full GYDS_P2P_PORT=30304 run "fullnode" bash "$SCRIPT_DIR/install-fullnode.sh"
fi

if $INSTALL_RPC; then
  GYDS_CONF=/dev/null NODE_ROLE=rpc GYDS_RPC_DOMAIN='' DOMAIN='' GYDS_RPC_PORT=8547 GYDS_WS_PORT=8548 GYDS_P2P_PORT=30305 ENABLE_MINING=false \
    run "rpc node" bash "$SCRIPT_DIR/install-fullnode.sh"
fi

if $INSTALL_LITENODE; then
  # Lite node runs as a regular user (not root), so install for the SUDO_USER
  TARGET_USER="${NODE_USER:-${SUDO_USER:-$USER}}"
  if [[ "$TARGET_USER" == "root" ]] && getent passwd ubuntu >/dev/null; then
    TARGET_USER="ubuntu"
  fi
  id -u "$TARGET_USER" >/dev/null 2>&1 || {
    echo "Could not identify a non-root account for the lite node. Set SUDO_USER or NODE_USER."
    exit 1
  }
  TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
  echo -e "${GREEN}━━━ Installing litenode for user ${TARGET_USER} (HOME=${TARGET_HOME}) ━━━${NC}"
  sudo -u "$TARGET_USER" -H env GYDS_CONF=/dev/null \
    GYDS_BOOTSTRAP_NODES="${GYDS_BOOTSTRAP_NODES:-}" GYDS_ALLOWED_NODES="${GYDS_ALLOWED_NODES:-}" GYDS_PEER_AUTH=true \
    GYDS_RPC_PORT=8549 GYDS_WS_PORT=8550 GYDS_P2P_PORT=30306 \
    bash "$SCRIPT_DIR/install-litenode.sh"
fi

# Start/register local services after their units have been installed.
if [[ -f "$SCRIPT_DIR/register-local-nodes.sh" ]]; then
  APP_DIR="${APP_DIR:-/var/www/gydschain}" bash "$SCRIPT_DIR/register-local-nodes.sh"
fi

cat <<EOF

╔═══════════════════════════════════════════════════════════════════════╗
║   ✅ Multi-node installation complete                                ║
╚═══════════════════════════════════════════════════════════════════════╝
  Installed services:
$($BOOTNODE_INSTALLED && echo "    • gyds-bootnode")
$($INSTALL_FULLNODE && echo "    • gyds-fullnode")
$($INSTALL_RPC      && echo "    • gyds-rpcnode (RPC mode, port 8547)")
$($INSTALL_LITENODE && echo "    • gyds-litenode (user systemd, RPC port 8549)")
$($BOOTNODE_SKIPPED && echo "    • bootnode was skipped (unsupported by the selected source repository)")

  Logs:    /var/log/gydschain/   (and ~/.gydschain/logs for litenode)
EOF
