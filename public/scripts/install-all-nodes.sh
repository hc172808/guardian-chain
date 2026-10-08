#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Multi-Node Installer
#  Install ANY combination of node types on a SINGLE server.
#
#  Usage:
#    sudo bash install-all-nodes.sh --bootnode --fullnode
#    sudo bash install-all-nodes.sh --all
#    sudo bash install-all-nodes.sh --litenode --rpc-port=8550 --p2p-port=30306
#
#  Flags (any combination):
#    --bootnode       Install peer-discovery bootnode  (P2P 30303)
#    --fullnode       Install full node                (RPC 8545, WS 8546, P2P 30304)
#    --litenode       Install lite node               (RPC 8550, WS 8551, P2P 30306)
#    --rpc            Install dedicated RPC node      (RPC 8547, WS 8548, P2P 30305)
#    --all            Install bootnode + fullnode + litenode
#
#  Role ports are distinct so multiple nodes can run on one host. Override them
#  with GYDS_<ROLE>_*_PORT variables, or use --rpc-port/--ws-port/--p2p-port
#  when installing exactly one node.
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

INSTALL_BOOTNODE=false
INSTALL_FULLNODE=false
INSTALL_LITENODE=false
INSTALL_RPC=false
CUSTOM_RPC_PORT=""
CUSTOM_WS_PORT=""
CUSTOM_P2P_PORT=""
NODE_ARGS=()

while [[ $# -gt 0 ]]; do
  arg="$1"
  shift
  case "$arg" in
    --bootnode) INSTALL_BOOTNODE=true ;;
    --fullnode) INSTALL_FULLNODE=true ;;
    --litenode) INSTALL_LITENODE=true ;;
    --rpc)      INSTALL_RPC=true ;;
    --all)      INSTALL_BOOTNODE=true; INSTALL_FULLNODE=true; INSTALL_LITENODE=true ;;
    --rpc-port|--ws-port|--p2p-port)
      [[ $# -gt 0 && "$1" != --* ]] || { echo "$arg requires a port value"; exit 2; }
      case "$arg" in
        --rpc-port) CUSTOM_RPC_PORT="$1" ;;
        --ws-port)  CUSTOM_WS_PORT="$1" ;;
        --p2p-port) CUSTOM_P2P_PORT="$1" ;;
      esac
      shift
      ;;
    --rpc-port=*|--ws-port=*|--p2p-port=*)
      [[ -n "${arg#*=}" ]] || { echo "$arg requires a port value"; exit 2; }
      case "${arg%%=*}" in
        --rpc-port) CUSTOM_RPC_PORT="${arg#*=}" ;;
        --ws-port)  CUSTOM_WS_PORT="${arg#*=}" ;;
        --p2p-port) CUSTOM_P2P_PORT="${arg#*=}" ;;
      esac
      ;;
    --data-dir|--log-level|--bootstrap-nodes|--domain)
      [[ $# -gt 0 && "$1" != --* ]] || { echo "$arg requires a value"; exit 2; }
      NODE_ARGS+=("$arg" "$1")
      shift
      ;;
    --data-dir=*|--log-level=*|--bootstrap-nodes=*|--domain=*)
      [[ -n "${arg#*=}" ]] || { echo "$arg requires a value"; exit 2; }
      NODE_ARGS+=("${arg%%=*}" "${arg#*=}")
      ;;
    --no-wizard) GYDS_SKIP_WIZARD=1 ;;
    -h|--help)  sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

if ! $INSTALL_BOOTNODE && ! $INSTALL_FULLNODE && ! $INSTALL_LITENODE && ! $INSTALL_RPC; then
  echo "No node type selected. Use --bootnode, --fullnode, --litenode, --rpc, or --all"
  exit 1
fi

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)."; exit 1; }
NONINTERACTIVE="${NONINTERACTIVE:-0}"

SELECTED_COUNT=0
for selected in "$INSTALL_BOOTNODE" "$INSTALL_FULLNODE" "$INSTALL_LITENODE" "$INSTALL_RPC"; do
  [[ "$selected" == "true" ]] && SELECTED_COUNT=$((SELECTED_COUNT + 1))
done

if [[ ( -n "$CUSTOM_RPC_PORT$CUSTOM_WS_PORT$CUSTOM_P2P_PORT" || ${#NODE_ARGS[@]} -gt 0 ) && "$SELECTED_COUNT" -ne 1 ]]; then
  echo "Custom port flags require exactly one selected node. Use role-specific GYDS_*_PORT variables for multi-node installs."
  exit 2
fi
if $INSTALL_BOOTNODE && [[ ${#NODE_ARGS[@]} -gt 0 ]]; then
  echo "Generic node options do not apply to the bootnode; use its dedicated flags."
  exit 2
fi
if $INSTALL_LITENODE; then
  for node_arg in "${NODE_ARGS[@]}"; do
    [[ "$node_arg" != "--domain" ]] || { echo "--domain is not supported for the lite node."; exit 2; }
  done
fi

# A shared config may provide bootstrap and public-advertise settings.
GYDS_CONF="${GYDS_CONF:-/var/www/gydschain/gyds-config.env}"
# shellcheck disable=SC1090
[[ -f "$GYDS_CONF" ]] && source "$GYDS_CONF"

BOOTNODE_P2P_PORT="${GYDS_BOOTNODE_P2P_PORT:-30303}"
FULLNODE_RPC_PORT="${GYDS_FULLNODE_RPC_PORT:-8545}"
FULLNODE_WS_PORT="${GYDS_FULLNODE_WS_PORT:-8546}"
FULLNODE_P2P_PORT="${GYDS_FULLNODE_P2P_PORT:-30304}"
RPCNODE_RPC_PORT="${GYDS_RPCNODE_RPC_PORT:-8547}"
RPCNODE_WS_PORT="${GYDS_RPCNODE_WS_PORT:-8548}"
RPCNODE_P2P_PORT="${GYDS_RPCNODE_P2P_PORT:-30305}"
LITENODE_RPC_PORT="${GYDS_LITENODE_RPC_PORT:-8550}"
LITENODE_WS_PORT="${GYDS_LITENODE_WS_PORT:-8551}"
LITENODE_P2P_PORT="${GYDS_LITENODE_P2P_PORT:-30306}"

if [[ "$SELECTED_COUNT" -eq 1 ]]; then
  if $INSTALL_BOOTNODE; then
    [[ -z "$CUSTOM_RPC_PORT$CUSTOM_WS_PORT" ]] || { echo "The bootnode has no RPC or WebSocket port."; exit 2; }
    [[ -z "$CUSTOM_P2P_PORT" ]] || BOOTNODE_P2P_PORT="$CUSTOM_P2P_PORT"
  elif $INSTALL_FULLNODE; then
    [[ -z "$CUSTOM_RPC_PORT" ]] || FULLNODE_RPC_PORT="$CUSTOM_RPC_PORT"
    [[ -z "$CUSTOM_WS_PORT" ]] || FULLNODE_WS_PORT="$CUSTOM_WS_PORT"
    [[ -z "$CUSTOM_P2P_PORT" ]] || FULLNODE_P2P_PORT="$CUSTOM_P2P_PORT"
  elif $INSTALL_RPC; then
    [[ -z "$CUSTOM_RPC_PORT" ]] || RPCNODE_RPC_PORT="$CUSTOM_RPC_PORT"
    [[ -z "$CUSTOM_WS_PORT" ]] || RPCNODE_WS_PORT="$CUSTOM_WS_PORT"
    [[ -z "$CUSTOM_P2P_PORT" ]] || RPCNODE_P2P_PORT="$CUSTOM_P2P_PORT"
  elif $INSTALL_LITENODE; then
    [[ -z "$CUSTOM_RPC_PORT" ]] || LITENODE_RPC_PORT="$CUSTOM_RPC_PORT"
    [[ -z "$CUSTOM_WS_PORT" ]] || LITENODE_WS_PORT="$CUSTOM_WS_PORT"
    [[ -z "$CUSTOM_P2P_PORT" ]] || LITENODE_P2P_PORT="$CUSTOM_P2P_PORT"
  fi
fi

# Reject invalid or colliding service ports before changing the server.
ACTIVE_PORTS=()
reserve_port() {
  local raw_port="$1"
  local label="$2"
  local numeric_port
  local reserved
  [[ "$raw_port" =~ ^[0-9]{1,5}$ ]] || { echo "$label port is invalid: $raw_port"; exit 2; }
  numeric_port=$((10#$raw_port))
  (( numeric_port >= 1 && numeric_port <= 65535 )) || { echo "$label port is outside 1-65535: $raw_port"; exit 2; }
  for reserved in "${ACTIVE_PORTS[@]}"; do
    if [[ "${reserved%%:*}" == "$numeric_port" ]]; then
      echo "Port conflict: $label and ${reserved#*:} both use $numeric_port."
      exit 2
    fi
  done
  ACTIVE_PORTS+=("${numeric_port}:${label}")
}

if $INSTALL_BOOTNODE; then reserve_port "$BOOTNODE_P2P_PORT" "bootnode P2P"; fi
if $INSTALL_FULLNODE; then
  reserve_port "$FULLNODE_RPC_PORT" "fullnode RPC"
  reserve_port "$FULLNODE_WS_PORT" "fullnode WebSocket"
  reserve_port "$FULLNODE_P2P_PORT" "fullnode P2P"
fi
if $INSTALL_RPC; then
  reserve_port "$RPCNODE_RPC_PORT" "RPC node RPC"
  reserve_port "$RPCNODE_WS_PORT" "RPC node WebSocket"
  reserve_port "$RPCNODE_P2P_PORT" "RPC node P2P"
fi
if $INSTALL_LITENODE; then
  reserve_port "$LITENODE_RPC_PORT" "lite node RPC"
  reserve_port "$LITENODE_WS_PORT" "lite node WebSocket"
  reserve_port "$LITENODE_P2P_PORT" "lite node P2P"
fi

# Resolve a public host for enode/bootstrap advertising when this bundle adds a bootnode.
P2P_ADVERTISE_HOST="${GYDS_P2P_ADVERTISE_HOST:-}"
BOOTNODE_ADDRESS="${PUBLIC_ADDR:-}"
if [[ -n "$BOOTNODE_ADDRESS" && -z "$P2P_ADVERTISE_HOST" ]]; then
  P2P_ADVERTISE_HOST="${BOOTNODE_ADDRESS%:*}"
fi
if [[ -z "$P2P_ADVERTISE_HOST" ]]; then
  P2P_ADVERTISE_HOST="$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
fi
if [[ -z "$BOOTNODE_ADDRESS" && -n "$P2P_ADVERTISE_HOST" ]]; then
  BOOTNODE_ADDRESS="${P2P_ADVERTISE_HOST}:${BOOTNODE_P2P_PORT}"
fi
BOOTSTRAP_NODES="${GYDS_BOOTSTRAP_NODES:-}"
if [[ -z "$BOOTSTRAP_NODES" && "$INSTALL_BOOTNODE" == "true" && -n "$BOOTNODE_ADDRESS" ]]; then
  BOOTSTRAP_NODES="$BOOTNODE_ADDRESS"
fi
BOOTSTRAP_ARGS=()
[[ -n "$BOOTSTRAP_NODES" ]] && BOOTSTRAP_ARGS=(--bootstrap-nodes "$BOOTSTRAP_NODES")
if [[ -z "$BOOTSTRAP_NODES" ]] && { $INSTALL_FULLNODE || $INSTALL_LITENODE || $INSTALL_RPC; }; then
  echo "Warning: no bootstrap peer is configured. This node may not discover external peers until GYDS_BOOTSTRAP_NODES is set."
fi

TARGET_USER=""
TARGET_HOME=""
TARGET_UID=""
if $INSTALL_LITENODE; then
  TARGET_USER="${GYDS_LITE_USER:-${SUDO_USER:-}}"
  [[ -n "$TARGET_USER" && "$TARGET_USER" != "root" ]] || {
    echo "Lite node needs a regular user. Run with sudo from that user, or set GYDS_LITE_USER."
    exit 1
  }
  TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
  [[ -n "$TARGET_HOME" && -d "$TARGET_HOME" ]] || { echo "Could not find a home directory for $TARGET_USER."; exit 1; }
  command -v sudo >/dev/null 2>&1 || { echo "sudo is required to install the lite node for $TARGET_USER."; exit 1; }
  command -v systemctl >/dev/null 2>&1 || { echo "systemd is required to run the lite node service."; exit 1; }
  TARGET_UID="$(id -u "$TARGET_USER")"
  if command -v loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$TARGET_USER" || { echo "Could not enable a persistent user service for $TARGET_USER."; exit 1; }
  fi
  systemctl start "user@${TARGET_UID}.service" || { echo "Could not start the user systemd manager for $TARGET_USER."; exit 1; }
fi

# Canonical source repo shared by every supported node installer
REPO_URL="${REPO_URL:-https://github.com/hc172808/fullnode.git}"
REPO_DIR="${REPO_DIR:-/opt/gyds-fullnode}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export REPO_URL REPO_DIR

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
  BOOTNODE_ARGS=(--p2p-port "$BOOTNODE_P2P_PORT")
  [[ -n "$BOOTNODE_ADDRESS" ]] && BOOTNODE_ARGS+=(--public-addr "$BOOTNODE_ADDRESS")
  run "bootnode" env NONINTERACTIVE="$NONINTERACTIVE" \
    bash "$SCRIPT_DIR/install-bootnode.sh" "${BOOTNODE_ARGS[@]}"
fi

if $INSTALL_FULLNODE; then
  run "fullnode" env \
    NONINTERACTIVE="$NONINTERACTIVE" \
    GYDS_SKIP_WIZARD="${GYDS_SKIP_WIZARD:-$([[ "$NONINTERACTIVE" == "1" ]] && echo 1 || echo "")}" \
    bash "$SCRIPT_DIR/install-fullnode.sh" \
      --rpc-port "$FULLNODE_RPC_PORT" \
      --ws-port "$FULLNODE_WS_PORT" \
      --p2p-port "$FULLNODE_P2P_PORT" \
      --advertise-host "$P2P_ADVERTISE_HOST" \
      "${BOOTSTRAP_ARGS[@]}" \
      "${NODE_ARGS[@]}"
fi

if $INSTALL_RPC; then
  run "rpc node" env \
    NONINTERACTIVE="$NONINTERACTIVE" \
    bash "$SCRIPT_DIR/install-rpcnode.sh" \
      --rpc-port "$RPCNODE_RPC_PORT" \
      --ws-port "$RPCNODE_WS_PORT" \
      --p2p-port "$RPCNODE_P2P_PORT" \
      --advertise-host "$P2P_ADVERTISE_HOST" \
      "${BOOTSTRAP_ARGS[@]}" \
      "${NODE_ARGS[@]}"
fi

if $INSTALL_LITENODE; then
  echo -e "${GREEN}━━━ Installing litenode for user ${TARGET_USER} (HOME=${TARGET_HOME}) ━━━${NC}"
  run "lite node" sudo -u "$TARGET_USER" -H env \
    HOME="$TARGET_HOME" \
    XDG_RUNTIME_DIR="/run/user/${TARGET_UID}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${TARGET_UID}/bus" \
    SRC_DIR="$SRC_DIR" \
    REPO_URL="$REPO_URL" \
    NONINTERACTIVE="$NONINTERACTIVE" \
    GYDS_SKIP_WIZARD="${GYDS_SKIP_WIZARD:-$([[ "$NONINTERACTIVE" == "1" ]] && echo 1 || echo "")}" \
    bash "$SCRIPT_DIR/install-litenode.sh" \
      --rpc-port "$LITENODE_RPC_PORT" \
      --ws-port "$LITENODE_WS_PORT" \
      --p2p-port "$LITENODE_P2P_PORT" \
      --advertise-host "$P2P_ADVERTISE_HOST" \
      "${BOOTSTRAP_ARGS[@]}" \
      "${NODE_ARGS[@]}"
fi

cat <<EOF

╔═══════════════════════════════════════════════════════════════════════╗
║   ✅ Multi-node installation complete                                ║
╚═══════════════════════════════════════════════════════════════════════╝
  Active services (systemctl status <name>):
$($INSTALL_BOOTNODE && echo "    • gyds-bootnode")
$($INSTALL_FULLNODE && echo "    • gyds-fullnode")
$($INSTALL_RPC      && echo "    • gyds-rpcnode (RPC ${RPCNODE_RPC_PORT}, P2P ${RPCNODE_P2P_PORT})")
$($INSTALL_LITENODE && echo "    • gyds-litenode (user systemd, run via systemctl --user)")

  Logs:    /var/log/gydschain/   (and ~/.gydschain/logs for litenode)
EOF
