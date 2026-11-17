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
FULLNODE_INSTALLED=false
RPC_INSTALLED=false
LITENODE_INSTALLED=false
FAILED_NODES=()
SKIPPED_NODES=()

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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
export PROJECT_ROOT

# Validate every selected child's dependencies before fetching or installing.
for dependency in node-profile.sh; do
  [[ -f "$SCRIPT_DIR/$dependency" ]] || { echo "Missing $dependency" >&2; exit 1; }
done
for role in bootnode fullnode rpc litenode; do
  case "$role" in
    bootnode) selected=$INSTALL_BOOTNODE; child=install-bootnode.sh;;
    fullnode) selected=$INSTALL_FULLNODE; child=install-fullnode.sh;;
    rpc) selected=$INSTALL_RPC; child=install-rpcnode.sh;;
    litenode) selected=$INSTALL_LITENODE; child=install-litenode.sh;;
  esac
  if $selected && [[ ! -f "$SCRIPT_DIR/$child" ]]; then
    echo "⚠ Skipping ${role}: installer script $child is missing."
    SKIPPED_NODES+=("${role}: missing ${child}")
    case "$role" in
      bootnode) INSTALL_BOOTNODE=false ;;
      fullnode) INSTALL_FULLNODE=false ;;
      rpc) INSTALL_RPC=false ;;
      litenode) INSTALL_LITENODE=false ;;
    esac
  fi
done
if $INSTALL_LITENODE && [[ -z "${GYDS_BOOTSTRAP_NODES:-}" || -z "${GYDS_ALLOWED_NODES:-}" ]]; then
  echo "⚠ Skipping litenode: trusted GYDS_BOOTSTRAP_NODES and GYDS_ALLOWED_NODES are not configured."
  SKIPPED_NODES+=("litenode: trusted bootstrap peers or approved node IDs missing")
  INSTALL_LITENODE=false
fi
if ! $INSTALL_BOOTNODE && ! $INSTALL_FULLNODE && ! $INSTALL_LITENODE && ! $INSTALL_RPC; then
  echo "No selected node role is ready to install."
  printf 'Skipped: %s\n' "${SKIPPED_NODES[@]}"
  exit 1
fi

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain Multi-Node Installer                                     ║"
echo "║   bootnode=${INSTALL_BOOTNODE}  fullnode=${INSTALL_FULLNODE}  litenode=${INSTALL_LITENODE}  rpc=${INSTALL_RPC}            ║"
echo "║   Local project: ${PROJECT_ROOT}"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

run_role() {
  local role="$1" label="$2" status
  shift 2
  echo -e "\n${GREEN}━━━ Installing ${label} ━━━${NC}\n"
  if "$@"; then
    echo "✓ ${label} installation completed."
    return 0
  else
    status=$?
    echo "⚠ ${label} installation failed (exit ${status}); continuing with other selected node roles." >&2
    FAILED_NODES+=("${role}: installer exited ${status}")
    return 1
  fi
}

if $INSTALL_BOOTNODE; then
  if [[ ! -d "${PROJECT_ROOT}/public/blockchain-go/cmd/bootnode" ]]; then
    echo "⚠  Skipping bootnode: local public/blockchain-go/cmd/bootnode is missing."
    BOOTNODE_SKIPPED=true
    SKIPPED_NODES+=("bootnode: bundled source is missing")
  else
    if GYDS_CONF=/dev/null PROJECT_ROOT="$PROJECT_ROOT" SRC_DIR="$PROJECT_ROOT/public/blockchain-go" P2P_PORT=30303 \
      run_role "bootnode" "bootnode" bash "$SCRIPT_DIR/install-bootnode.sh"; then
      BOOTNODE_INSTALLED=true
    fi
  fi
fi

if $INSTALL_FULLNODE; then
  if GYDS_CONF=/dev/null PROJECT_ROOT="$PROJECT_ROOT" NODE_SOURCE_DIR="$PROJECT_ROOT/node-fixes/fullnode" \
    NODE_ROLE=full GYDS_P2P_PORT=30304 \
    run_role "fullnode" "fullnode" bash "$SCRIPT_DIR/install-fullnode.sh"; then
    FULLNODE_INSTALLED=true
  fi
fi

if $INSTALL_RPC; then
  if GYDS_CONF=/dev/null PROJECT_ROOT="$PROJECT_ROOT" NODE_SOURCE_DIR="$PROJECT_ROOT/node-fixes/rpcnode" \
      GYDS_RPC_DOMAIN='' DOMAIN='' GYDS_RPC_PORT=8547 GYDS_WS_PORT=8548 GYDS_P2P_PORT=30305 ENABLE_MINING=false \
      run_role "rpc node" "rpc node" bash "$SCRIPT_DIR/install-rpcnode.sh"; then
    RPC_INSTALLED=true
  fi
fi

if $INSTALL_LITENODE; then
  # Lite node runs as a regular user (not root), so install for the SUDO_USER
  TARGET_USER="${NODE_USER:-${SUDO_USER:-$USER}}"
  if [[ "$TARGET_USER" == "root" ]] && getent passwd ubuntu >/dev/null; then
    TARGET_USER="ubuntu"
  fi
  if ! id -u "$TARGET_USER" >/dev/null 2>&1; then
    echo "⚠ Skipping litenode: could not identify a non-root account. Set SUDO_USER or NODE_USER."
    SKIPPED_NODES+=("litenode: no non-root service account found")
  else
    TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
    echo -e "${GREEN}━━━ Installing litenode for user ${TARGET_USER} (HOME=${TARGET_HOME}) ━━━${NC}"
    if run_role "litenode" "litenode" sudo -u "$TARGET_USER" -H env GYDS_CONF=/dev/null PROJECT_ROOT="$PROJECT_ROOT" \
        NODE_SOURCE_DIR="$PROJECT_ROOT/node-fixes/litenode" \
        GYDS_BOOTSTRAP_NODES="${GYDS_BOOTSTRAP_NODES:-}" GYDS_ALLOWED_NODES="${GYDS_ALLOWED_NODES:-}" GYDS_PEER_AUTH=true \
        GYDS_RPC_PORT=8549 GYDS_WS_PORT=8550 GYDS_P2P_PORT=30306 \
        bash "$SCRIPT_DIR/install-litenode.sh"; then
      LITENODE_INSTALLED=true
      if command -v loginctl >/dev/null 2>&1 &&
          loginctl enable-linger "$TARGET_USER" &&
          [[ "$(loginctl show-user "$TARGET_USER" -p Linger --value 2>/dev/null || true)" == "yes" ]]; then
        echo "✓ Lite-node user services will start at boot for ${TARGET_USER}."
      else
        echo "⚠ Lite node is installed, but boot startup needs: sudo loginctl enable-linger ${TARGET_USER}"
        SKIPPED_NODES+=("litenode autostart: enable user lingering for ${TARGET_USER}")
      fi
    fi
  fi
fi

# Start/register local services after their units have been installed.
if [[ -f "$SCRIPT_DIR/register-local-nodes.sh" ]]; then
  if ! APP_DIR="${APP_DIR:-/var/www/gydschain}" bash "$SCRIPT_DIR/register-local-nodes.sh"; then
    echo "⚠ Local node registration failed; installed services remain in place." >&2
    FAILED_NODES+=("local node registration: installer exited non-zero")
  fi
fi

cat <<EOF

╔═══════════════════════════════════════════════════════════════════════╗
║   ✅ Multi-node installation complete                                ║
╚═══════════════════════════════════════════════════════════════════════╝
  Installed services:
$($BOOTNODE_INSTALLED && echo "    • gyds-bootnode")
$($FULLNODE_INSTALLED && echo "    • gyds-fullnode")
$($RPC_INSTALLED      && echo "    • gyds-rpcnode (RPC mode, port 8547)")
$($LITENODE_INSTALLED && echo "    • gyds-litenode (user systemd, RPC port 8549)")
$($BOOTNODE_SKIPPED && echo "    • bootnode was skipped (local source missing)")

  Logs:    /var/log/gydschain/   (and ~/.gydschain/logs for litenode)
EOF

if ((${#SKIPPED_NODES[@]} > 0)); then
  echo ""
  echo "Skipped node roles:"
  printf '  • %s\n' "${SKIPPED_NODES[@]}"
fi

if ((${#FAILED_NODES[@]} > 0)); then
  echo ""
  echo "Failed node roles:"
  printf '  • %s\n' "${FAILED_NODES[@]}"
fi

if ((${#SKIPPED_NODES[@]} > 0 || ${#FAILED_NODES[@]} > 0)); then
  echo ""
  echo "Other selected node roles were still attempted; successful installs were not rolled back."
  exit 1
fi
