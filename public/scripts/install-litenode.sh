#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Lite Node Installer — PUBLIC ACCESS
#  Repo:     https://github.com/hc172808/litenode.git
#  OS:       Ubuntu/Debian/CentOS/RHEL/macOS
#  Chain ID: 13370  |  Block time: 5s  |  Domain: netlifegy.com
#  Run:      bash install-litenode.sh   (no sudo required for user-mode)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Load shared config (written by deploy-dashboard.sh — all values skippable) ─
GYDS_CONF="${GYDS_CONF:-/var/www/gydschain/gyds-config.env}"
# shellcheck disable=SC1090
[[ -f "$GYDS_CONF" ]] && { source "$GYDS_CONF"; echo "[config] Loaded shared config from $GYDS_CONF"; }

# ── Config ────────────────────────────────────────────────────────────────────
GYDS_VERSION="1.0.0"
BINARY="gyds-litenode"
CHAIN_ID="${GYDS_CHAIN_ID:-13370}"
GO_VERSION="${GO_VERSION:-1.21.13}"

GYDS_HOME="${GYDS_HOME:-$HOME/.gydschain}"
GYDS_BIN="${GYDS_BIN:-$GYDS_HOME/bin}"
DATA_DIR="${GYDS_HOME}/data"
LOG_DIR="${GYDS_HOME}/logs"

RPC_PORT="${GYDS_RPC_PORT:-8545}"
WS_PORT="${GYDS_WS_PORT:-8546}"
P2P_PORT="${GYDS_P2P_PORT:-30303}"
LOG_LEVEL="${GYDS_LOG_LEVEL:-info}"
BOOTSTRAP="${GYDS_BOOTSTRAP_NODES:-}"

REPO_URL="https://github.com/hc172808/litenode.git"
REPO_DIR="${REPO_DIR:-$HOME/gyds-litenode-src}"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain LITE NODE Installer v${GYDS_VERSION}                   ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Block time: 5s  |  netlifegy.com  ║"
echo "║   Repo: github.com/hc172808/litenode                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rpc-port)        RPC_PORT="$2";   shift 2 ;;
    --p2p-port)        P2P_PORT="$2";   shift 2 ;;
    --data-dir)        DATA_DIR="$2";   shift 2 ;;
    --log-level)       LOG_LEVEL="$2";  shift 2 ;;
    --bootstrap-nodes) BOOTSTRAP="$2";  shift 2 ;;
    *) warn "Unknown flag: $1"; shift ;;
  esac
done

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
    sudo apt-get install -y --no-install-recommends build-essential git curl wget jq ca-certificates openssl
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y gcc git curl wget jq ca-certificates openssl
  elif command -v yum &>/dev/null; then
    sudo yum install -y gcc git curl wget jq ca-certificates openssl
  fi
elif [[ "$OS" == "Darwin" ]]; then
  command -v brew &>/dev/null || { warn "Homebrew not found. Install: https://brew.sh"; }
  command -v brew &>/dev/null && brew install git curl wget jq openssl 2>/dev/null || true
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

# ── Clone / update repo ───────────────────────────────────────────────────────
log "[3/6] Fetching source from ${REPO_URL}..."
if [[ -d "$REPO_DIR/.git" ]]; then
  log "    Existing source found — pulling latest..."
  git -C "$REPO_DIR" fetch origin main
  git -C "$REPO_DIR" reset --hard origin/main
else
  git clone --depth=1 "$REPO_URL" "$REPO_DIR"
fi
[[ -f "$REPO_DIR/go.mod" ]] || die "go.mod not found in $REPO_DIR"

# ── Build binary ──────────────────────────────────────────────────────────────
log "[4/6] Building ${BINARY}..."
mkdir -p "$GYDS_BIN"
( cd "$REPO_DIR" && go mod download && \
  go build -ldflags="-s -w -X main.version=${GYDS_VERSION}" -o "${GYDS_BIN}/${BINARY}" . )
chmod +x "${GYDS_BIN}/${BINARY}"
log "    Installed: ${GYDS_BIN}/${BINARY} ($(du -h "${GYDS_BIN}/${BINARY}" | cut -f1))"

# ── Directories ───────────────────────────────────────────────────────────────
log "[5/6] Setting up directories..."
mkdir -p "${DATA_DIR}" "${LOG_DIR}" "${GYDS_HOME}/config"
chmod 700 "${GYDS_HOME}"

# ── Start script & service ────────────────────────────────────────────────────
log "[6/6] Creating start script and service..."

ENV_VARS="GYDS_CHAIN_ID=${CHAIN_ID} \
GYDS_NODE_MODE=lite \
GYDS_RPC_PORT=${RPC_PORT} \
GYDS_RPC_HOST=127.0.0.1 \
GYDS_P2P_PORT=${P2P_PORT} \
GYDS_DATA_DIR=${DATA_DIR} \
GYDS_LOG_LEVEL=${LOG_LEVEL}"
[[ -n "$BOOTSTRAP" ]] && ENV_VARS="${ENV_VARS} GYDS_BOOTSTRAP_NODES=${BOOTSTRAP}"

cat > "${GYDS_HOME}/start.sh" <<EOF
#!/usr/bin/env bash
export PATH="${GYDS_BIN}:\$PATH"
export GYDS_CHAIN_ID="${CHAIN_ID}"
export GYDS_NODE_MODE="lite"
export GYDS_RPC_PORT="${RPC_PORT}"
export GYDS_RPC_HOST="127.0.0.1"
export GYDS_P2P_PORT="${P2P_PORT}"
export GYDS_DATA_DIR="${DATA_DIR}"
export GYDS_LOG_LEVEL="${LOG_LEVEL}"
$([ -n "$BOOTSTRAP" ] && echo "export GYDS_BOOTSTRAP_NODES=\"${BOOTSTRAP}\"")
exec "${GYDS_BIN}/${BINARY}" start
EOF
chmod +x "${GYDS_HOME}/start.sh"
# Append API namespace env vars into the node env file immediately (also written below for systemd)
grep -qxF "GYDS_HTTP_API=eth,net,web3,txpool,admin,miner,personal,debug" "${GYDS_HOME}/config/node.env" 2>/dev/null \
  || printf '\nGYDS_HTTP_API=eth,net,web3,txpool,admin,miner,personal,debug\nGYDS_WS_API=eth,net,web3,txpool,admin\n' >> "${GYDS_HOME}/config/node.env"

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
GYDS_NODE_MODE=lite
GYDS_RPC_PORT=${RPC_PORT}
GYDS_RPC_HOST=127.0.0.1
GYDS_P2P_PORT=${P2P_PORT}
GYDS_DATA_DIR=${DATA_DIR}
GYDS_LOG_LEVEL=${LOG_LEVEL}
$([ -n "$BOOTSTRAP" ] && echo "GYDS_BOOTSTRAP_NODES=${BOOTSTRAP}")
GYDS_HTTP_API=eth,net,web3,txpool,admin,miner,personal,debug
GYDS_WS_API=eth,net,web3,txpool,admin
EOF

  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user enable gyds-litenode 2>/dev/null || true
fi

# ── Summary & Web Setup Wizard ────────────────────────────────────────────────
SETUP_PORT="${GYDS_SETUP_PORT:-8888}"
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_SERVER_IP")

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
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║   🌐  WEB SETUP WIZARD                                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  A browser-based setup wizard is available.                 ║"
echo "║  It will help you configure your node via a simple UI.      ║"
echo "║                                                              ║"
echo "║  ➜  http://localhost:${SETUP_PORT}                                 ║"
echo "║  ➜  http://${LOCAL_IP}:${SETUP_PORT}  (from another machine)       ║"
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
  echo "  curl -s http://localhost:${RPC_PORT}/health"
  echo ""
fi
