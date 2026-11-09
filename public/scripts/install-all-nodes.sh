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
  if $INSTALL_ALL_REQUESTED && [[ ! -d "${SRC_DIR}/cmd/bootnode" ]]; then
    echo "⚠  Skipping bootnode: ${REPO_URL} does not contain cmd/bootnode yet."
    echo "   No alternate repository was used. The selected fullnode/lite installs will continue."
    BOOTNODE_SKIPPED=true
    SKIPPED_NODES+=("bootnode: source does not include cmd/bootnode")
  else
    if GYDS_CONF=/dev/null P2P_PORT=30303 run_role "bootnode" "bootnode" bash "$SCRIPT_DIR/install-bootnode.sh"; then
      BOOTNODE_INSTALLED=true
    fi
  fi
fi

if $INSTALL_FULLNODE; then
  if GYDS_CONF=/dev/null NODE_ROLE=full GYDS_P2P_PORT=30304 run_role "fullnode" "fullnode" bash "$SCRIPT_DIR/install-fullnode.sh"; then
    FULLNODE_INSTALLED=true
  fi
fi

if $INSTALL_RPC; then
  if GYDS_CONF=/dev/null NODE_ROLE=rpc GYDS_RPC_DOMAIN='' DOMAIN='' GYDS_RPC_PORT=8547 GYDS_WS_PORT=8548 GYDS_P2P_PORT=30305 ENABLE_MINING=false \
      run_role "rpc node" "rpc node" bash "$SCRIPT_DIR/install-fullnode.sh"; then
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
    if run_role "litenode" "litenode" sudo -u "$TARGET_USER" -H env GYDS_CONF=/dev/null \
        GYDS_BOOTSTRAP_NODES="${GYDS_BOOTSTRAP_NODES:-}" GYDS_ALLOWED_NODES="${GYDS_ALLOWED_NODES:-}" GYDS_PEER_AUTH=true \
        GYDS_RPC_PORT=8549 GYDS_WS_PORT=8550 GYDS_P2P_PORT=30306 \
        bash "$SCRIPT_DIR/install-litenode.sh"; then
      LITENODE_INSTALLED=true
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
$($BOOTNODE_SKIPPED && echo "    • bootnode was skipped (unsupported by the selected source repository)")

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
