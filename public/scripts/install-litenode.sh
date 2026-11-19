#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Lite Node Installer — PUBLIC ACCESS
#  Source:   local node-fixes/litenode bundle
#  OS:       Ubuntu/Debian/CentOS/RHEL/macOS
#  Chain ID: 198282  |  Block time: 5s  |  Domain: netlifegy.com
#  Run:      bash install-litenode.sh   (no sudo required for user-mode)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Load shared config (written by deploy-dashboard.sh — all values skippable) ─
GYDS_CONF="${GYDS_CONF:-/var/www/gydschain/gyds-config.env}"
# shellcheck disable=SC1090
[[ -f "$GYDS_CONF" ]] && { source "$GYDS_CONF"; echo "[config] Loaded shared config from $GYDS_CONF"; }
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/node-network.sh"
PROJECT_ROOT="${PROJECT_ROOT:-}"
if [[ -z "$PROJECT_ROOT" ]]; then
  if [[ -f "$SCRIPT_DIR/../../node-fixes/litenode/go.mod" ]]; then
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  else
    PROJECT_ROOT="/var/www/gydschain"
  fi
fi
source "$SCRIPT_DIR/node-profile.sh"
load_node_profile

# ── Config ────────────────────────────────────────────────────────────────────
GYDS_VERSION="1.0.0"
BINARY="gyds-litenode"
CHAIN_ID="${GYDS_CHAIN_ID:-198282}"
GO_VERSION="${GO_VERSION:-1.25.0}"

GYDS_HOME="${GYDS_HOME:-$HOME/.gydschain}"
GYDS_BIN="${GYDS_BIN:-$GYDS_HOME/bin}"
DATA_DIR="${GYDS_DATA_DIR:-${GYDS_HOME}/data}"
LOG_DIR="${GYDS_HOME}/logs"

RPC_PORT="${GYDS_RPC_PORT:-8545}"
P2P_PORT="${GYDS_P2P_PORT:-30303}"
LOG_LEVEL="${GYDS_LOG_LEVEL:-info}"
BOOTSTRAP="${GYDS_BOOTSTRAP_NODES:-}"
RPC_ENDPOINTS="${LITE_RPC_ENDPOINTS:-${GYDS_UPSTREAM_RPC:-}}"
API_HOST="${LITE_API_HOST:-127.0.0.1}"
RPC_DOMAIN="${GYDS_RPC_DOMAIN:-${DOMAIN:-}}"

NODE_SOURCE_DIR="${NODE_SOURCE_DIR:-${PROJECT_ROOT}/node-fixes/litenode}"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain LITE NODE Installer v${GYDS_VERSION}                   ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Block time: 5s  |  netlifegy.com  ║"
echo "║   Source: local node-fixes/litenode                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Arg parsing ───────────────────────────────────────────────────────────────
require_value() {
  [[ $# -ge 2 && -n "${2:-}" && "${2:-}" != --* ]] || die "$1 requires a value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rpc-port)        require_value "$@"; RPC_PORT="$2";   shift 2 ;;
    --p2p-port)        require_value "$@"; P2P_PORT="$2";   shift 2 ;;
    --data-dir)        require_value "$@"; DATA_DIR="$2";   shift 2 ;;
    --log-level)       require_value "$@"; LOG_LEVEL="$2";  shift 2 ;;
    --bootstrap-nodes) require_value "$@"; BOOTSTRAP="$2";  shift 2 ;;
    *) warn "Unknown flag: $1"; shift ;;
  esac
done

[[ -n "$BOOTSTRAP" && -n "${GYDS_ALLOWED_NODES:-}" ]] || die "Lite mode requires trusted bootstrap peers and their approved node IDs"
[[ -z "${GYDS_NODE_MODE:-}" || "$GYDS_NODE_MODE" == lite ]] || die "Profile role must be lite"
[[ -n "$RPC_ENDPOINTS" ]] || die "Set LITE_RPC_ENDPOINTS or GYDS_UPSTREAM_RPC to a reachable HTTP RPC endpoint; P2P peers are not RPC endpoints."
[[ "$API_HOST" == "127.0.0.1" ]] || die "Lite API must bind to 127.0.0.1; use GYDS_RPC_DOMAIN for HTTPS access."
if [[ -n "$RPC_DOMAIN" && ! "$RPC_DOMAIN" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]]; then
  die "GYDS_RPC_DOMAIN must be a hostname without a scheme or path."
fi

valid_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] || return 1
  (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}
valid_port "$RPC_PORT" || die "RPC port must be from 1 to 65535."
valid_port "$P2P_PORT" || die "P2P port must be from 1 to 65535."
[[ "$RPC_PORT" != "$P2P_PORT" ]] || die "Lite API and P2P ports must be different."

# ── OS & arch ─────────────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)        GO_ARCH="amd64" ;;
  aarch64|arm64) GO_ARCH="arm64" ;;
  armv7l)        GO_ARCH="armv6l" ;;
  *) die "Unsupported arch: $ARCH" ;;
esac

# ── Dependencies ──────────────────────────────────────────────────────────────
log "[1/6] Installing dependencies..."
if [[ "$OS" == "Linux" ]]; then
  if command -v apt-get &>/dev/null; then
    sudo apt-get update -qq
    PACKAGES=(build-essential git curl wget jq ca-certificates openssl)
    [[ -n "$RPC_DOMAIN" ]] && PACKAGES+=(nginx certbot python3-certbot-nginx)
    sudo apt-get install -y --no-install-recommends "${PACKAGES[@]}"
  elif command -v dnf &>/dev/null; then
    PACKAGES=(gcc git curl wget jq ca-certificates openssl)
    [[ -n "$RPC_DOMAIN" ]] && PACKAGES+=(nginx certbot python3-certbot-nginx)
    sudo dnf install -y "${PACKAGES[@]}"
  elif command -v yum &>/dev/null; then
    PACKAGES=(gcc git curl wget jq ca-certificates openssl)
    [[ -n "$RPC_DOMAIN" ]] && PACKAGES+=(nginx certbot python3-certbot-nginx)
    sudo yum install -y "${PACKAGES[@]}"
  fi
elif [[ "$OS" == "Darwin" ]]; then
  command -v brew &>/dev/null || { warn "Homebrew not found. Install: https://brew.sh"; }
  command -v brew &>/dev/null && brew install git curl wget jq openssl 2>/dev/null || true
fi
node_network_resolve_p2p_host || die "Could not determine a reachable P2P address."
if [[ "${GYDS_P2P_FIREWALL_CONFIGURED:-0}" != "1" ]]; then
  node_network_allow_p2p_tcp "$P2P_PORT"
fi
if [[ -n "$RPC_DOMAIN" ]]; then
  node_network_allow_tcp_port 80 "GYDS lite HTTPS proxy"
  node_network_allow_tcp_port 443 "GYDS lite HTTPS proxy"
fi

# ── Go ────────────────────────────────────────────────────────────────────────
log "[2/6] Ensuring Go ${GO_VERSION}..."
export PATH="$PATH:/usr/local/go/bin:${GYDS_BIN}"
CURRENT_GO=$(go version 2>/dev/null | awk '{print $3}' | sed 's/go//' || echo "none")
if [[ "$CURRENT_GO" != "$GO_VERSION" ]]; then
  if [[ "$OS" == "Linux" ]]; then
    GO_URL="https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
    wget -q "$GO_URL" -O /tmp/go.tar.gz || die "Failed to download Go"
    sudo rm -rf /usr/local/go
    sudo tar -C /usr/local -xzf /tmp/go.tar.gz
    rm -f /tmp/go.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.profile
    export PATH="$PATH:/usr/local/go/bin"
  elif [[ "$OS" == "Darwin" ]]; then
    command -v brew &>/dev/null && brew install go || die "Install Go 1.21+ manually from https://go.dev/dl/"
  fi
fi
go version || die "Go not found after install"
log "    $(go version)"

# ── Validate bundled local source ─────────────────────────────────────────────
log "[3/6] Checking local litenode source..."
[[ -f "$NODE_SOURCE_DIR/go.mod" ]] || die "Local source not found at $NODE_SOURCE_DIR. Set PROJECT_ROOT to the checked-out project directory."
grep -Fqx "module github.com/gydschain/litenode" "$NODE_SOURCE_DIR/go.mod" || \
  die "Unexpected Go module in $NODE_SOURCE_DIR/go.mod; refusing to build another node source."

# ── Build binary ──────────────────────────────────────────────────────────────
log "[4/6] Building ${BINARY}..."
mkdir -p "$GYDS_BIN"
( cd "$NODE_SOURCE_DIR" && go mod download && \
  go build -ldflags="-s -w -X main.version=${GYDS_VERSION}" -o "${GYDS_BIN}/${BINARY}" . )
chmod +x "${GYDS_BIN}/${BINARY}"
log "    Installed: ${GYDS_BIN}/${BINARY} ($(du -h "${GYDS_BIN}/${BINARY}" | cut -f1))"

# ── Directories ───────────────────────────────────────────────────────────────
log "[5/6] Setting up directories..."
mkdir -p "${DATA_DIR}" "${LOG_DIR}" "${GYDS_HOME}/config"
chmod 700 "${GYDS_HOME}"

# ── Start script & service ────────────────────────────────────────────────────
log "[6/6] Creating start script and service..."

cat > "${GYDS_HOME}/start.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
while IFS='=' read -r key value; do
  case "\$key" in
    GYDS_CHAIN_ID|GYDS_P2P_ADVERTISE_HOST|GYDS_PEER_AUTH|GYDS_ALLOWED_NODES|LITE_RPC_ENDPOINTS|LITE_RPC_PORT|LITE_API_HOST|LITE_P2P_PORT|LITE_DATADIR|LITE_LOG_LEVEL)
      export "\$key=\$value"
      ;;
  esac
done < "${GYDS_HOME}/config/node.env"
export PATH="${GYDS_BIN}:\$PATH"
exec "${GYDS_BIN}/${BINARY}" start
EOF
chmod +x "${GYDS_HOME}/start.sh"

# User systemd service (no root required)
if command -v systemctl &>/dev/null && [[ -d "$HOME/.config" ]]; then
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/gyds-litenode.service" <<EOF
[Unit]
Description=GYDSchain Lite Node v${GYDS_VERSION}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${GYDS_HOME}
EnvironmentFile=-${GYDS_HOME}/config/node.env
ExecStart=${GYDS_HOME}/start.sh
Restart=on-failure
RestartSec=10
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/litenode.log
StandardError=append:${LOG_DIR}/litenode-error.log

[Install]
WantedBy=default.target
EOF
  # Write env file for systemd
  cat > "${GYDS_HOME}/config/node.env" <<EOF
GYDS_CHAIN_ID=${CHAIN_ID}
GYDS_P2P_ADVERTISE_HOST=${GYDS_P2P_ADVERTISE_HOST}
LITE_RPC_ENDPOINTS=${RPC_ENDPOINTS}
LITE_RPC_PORT=${RPC_PORT}
LITE_API_HOST=${API_HOST}
LITE_P2P_PORT=${P2P_PORT}
LITE_DATADIR=${DATA_DIR}
LITE_LOG_LEVEL=${LOG_LEVEL}
GYDS_PEER_AUTH=true
GYDS_ALLOWED_NODES=${GYDS_ALLOWED_NODES:-}
EOF

if [[ -n "$RPC_DOMAIN" ]]; then
  sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  cat <<EOF | sudo tee /etc/nginx/sites-available/gyds-litenode >/dev/null
server {
    listen 80;
    server_name ${RPC_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${RPC_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF
  sudo ln -sf /etc/nginx/sites-available/gyds-litenode /etc/nginx/sites-enabled/gyds-litenode
  sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx
  sudo certbot --nginx -d "$RPC_DOMAIN" --non-interactive --agree-tos -m "admin@${RPC_DOMAIN}" 2>/dev/null \
    || warn "TLS setup failed; check DNS for ${RPC_DOMAIN}, then rerun Certbot."
fi
  mkdir -p "$HOME/.config/systemd/user/default.target.wants"
  ln -sfn ../gyds-litenode.service "$HOME/.config/systemd/user/default.target.wants/gyds-litenode.service"

  # User services only start at system boot when linger is enabled. Enable it
  # when already root or when passwordless sudo is available; otherwise print
  # the exact one-time command instead of silently implying boot support.
  if command -v loginctl >/dev/null 2>&1; then
    LINGER_STATE="$(loginctl show-user "$USER" -p Linger --value 2>/dev/null || true)"
    if [[ "$LINGER_STATE" != "yes" ]]; then
      if [[ "$EUID" -eq 0 ]]; then
        loginctl enable-linger "$USER" && LINGER_STATE="yes" || true
      elif command -v sudo >/dev/null 2>&1; then
        if sudo loginctl enable-linger "$USER" 2>/dev/null; then
          LINGER_STATE="yes"
        fi
      fi
    fi
    if [[ "$LINGER_STATE" == "yes" ]]; then
      echo "✓ User lingering is enabled; the lite-node service can start at system boot."
    else
      echo "⚠ Boot autostart needs one privileged setup command:"
      echo "  sudo loginctl enable-linger $USER"
    fi
  else
    echo "⚠ loginctl is unavailable; user systemd autostart may require logging in after reboot."
  fi

  if systemctl --user daemon-reload 2>/dev/null; then
    if ! systemctl --user enable gyds-litenode 2>/dev/null; then
      echo "⚠ Could not enable the lite-node user service."
    fi
    if systemctl --user start gyds-litenode 2>/dev/null; then
      if systemctl --user is-enabled --quiet gyds-litenode 2>/dev/null; then
        echo "✓ Lite node service is enabled and started."
      else
        echo "⚠ Lite node is running but its user service is not enabled for boot."
      fi
    else
      echo "⚠ Lite node is installed but the user systemd manager is unavailable."
      echo "  Start it from a logged-in session with: systemctl --user start gyds-litenode"
    fi
  else
    echo "⚠ Lite node is installed; user systemd is unavailable in this session."
    echo "  Start it from a logged-in session with: systemctl --user start gyds-litenode"
  fi
fi

# ── Summary & Web Setup Wizard ────────────────────────────────────────────────
SETUP_PORT="${GYDS_SETUP_PORT:-8888}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         GYDSchain LITE NODE — INSTALLED ✓                   ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Binary   : ${GYDS_BIN}/${BINARY}"
echo "║  Data dir : ${DATA_DIR}"
echo "║  Config   : ${GYDS_HOME}/config/node.env"
echo "║  Chain ID : ${CHAIN_ID}"
echo "║                                                              ║"
echo "║  API      : ${API_HOST}:${RPC_PORT} (local only)"
echo "║  RPC sync : ${RPC_ENDPOINTS}"
echo "║  P2P      : ${GYDS_P2P_ADVERTISE_HOST}:${P2P_PORT} (TCP)"
if [[ -n "$RPC_DOMAIN" ]]; then
  echo "║  HTTPS    : https://${RPC_DOMAIN}"
fi
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║   🌐  WEB SETUP WIZARD                                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  A browser-based setup wizard is available.                 ║"
echo "║  It will help you configure your node via a simple UI.      ║"
echo "║                                                              ║"
echo "║  ➜  http://localhost:${SETUP_PORT}                                 ║"
echo "║  Remote access: use an SSH tunnel; wizard is local-only.      ║"
echo "║                                                              ║"
echo "║  The wizard will:                                           ║"
echo "║    • Ask for RPC endpoints, ports, sync settings            ║"
echo "║    • Generate your node.env config file                     ║"
echo "║    • Show you the exact start commands                      ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Ask user if they want the web setup wizard ────────────────────────────────
LAUNCH_WIZARD="${GYDS_SKIP_WIZARD:-}"
if echo "${@}" | grep -q "\-\-no-wizard"; then
  LAUNCH_WIZARD="n"
fi
if [[ -z "$LAUNCH_WIZARD" ]]; then
  read -r -p "  Launch web setup wizard now? [Y/n]: " WIZARD_REPLY
  case "${WIZARD_REPLY,,}" in
    n|no) LAUNCH_WIZARD="n" ;;
    *)    LAUNCH_WIZARD="y" ;;
  esac
fi

if [[ "$LAUNCH_WIZARD" != "n" && "$LAUNCH_WIZARD" != "1" ]]; then
  log "Starting web setup wizard on port ${SETUP_PORT}..."
  echo "  Open → http://localhost:${SETUP_PORT}"
  echo "  Press Ctrl+C when finished to continue."
  echo ""
  export PATH="${GYDS_BIN}:$PATH"
  "${GYDS_BIN}/${BINARY}" setup --port "${SETUP_PORT}" 2>&1 || true
else
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  START / MANAGE (wizard skipped)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Run wizard     : ${GYDS_BIN}/${BINARY} setup"
  echo "  Manual start   : ${GYDS_HOME}/start.sh"
  echo "  Service start  : systemctl --user start gyds-litenode"
  echo "  Live logs      : journalctl --user -u gyds-litenode -f"
  echo "  Log file       : tail -f ${LOG_DIR}/litenode.log"
  echo ""
  echo "  RPC test:"
  [[ -n "$RPC_DOMAIN" ]] && echo "  HTTPS API      : https://${RPC_DOMAIN}/health" || true
  echo "  Local API test : curl http://127.0.0.1:${RPC_PORT}/health"
  echo ""
fi
node_network_report_tcp_listener "$P2P_PORT"
node_network_report_p2p "$P2P_PORT"
