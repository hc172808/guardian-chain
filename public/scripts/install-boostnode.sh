#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Boost Node Installer
#  Repo:     https://github.com/hc172808/fullnode.git  (boost mode via GYDS_NODE_MODE)
#  A high-performance relay/boost node for GYDSchain.
#  Target OS: Ubuntu 20.04/22.04/24.04 | Debian 11/12  |  Chain ID 13370
#  Run:  sudo bash install-boostnode.sh
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GYDS_VERSION="1.0.0"
BINARY="gyds-fullnode"
APP_USER="${APP_USER:-gyds}"
APP_DIR="${APP_DIR:-/opt/gyds-boostnode}"
DATA_DIR="${DATA_DIR:-/var/lib/gyds-boostnode}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-${DATA_DIR}/logs}"
GO_VERSION="${GO_VERSION:-1.21.13}"

CHAIN_ID="${GYDS_CHAIN_ID:-13370}"
RPC_PORT="${GYDS_RPC_PORT:-8547}"
P2P_PORT="${GYDS_P2P_PORT:-30304}"
LOG_LEVEL="${GYDS_LOG_LEVEL:-info}"
BOOTSTRAP="${GYDS_BOOTSTRAP_NODES:-}"

REPO_URL="https://github.com/hc172808/fullnode.git"
REPO_DIR="$APP_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain BOOST NODE Installer v${GYDS_VERSION}                   ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Block time: 5s  |  netlifegy.com  ║"
echo "║   Repo: github.com/hc172808/fullnode                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || { err "Run as root (sudo)."; exit 1; }

ARCH=$(uname -m)
case "$ARCH" in
  x86_64)        GO_ARCH="amd64" ;;
  aarch64|arm64) GO_ARCH="arm64" ;;
  *) die "Unsupported arch: $ARCH" ;;
esac

# ─── 1. System packages ──────────────────────────────────────────────────────
log "[1/6] Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends build-essential git curl wget jq ufw fail2ban ca-certificates openssl

# ─── 2. Go ───────────────────────────────────────────────────────────────────
log "[2/6] Installing Go ${GO_VERSION}..."
export PATH="$PATH:/usr/local/go/bin"
CURRENT_GO=$(go version 2>/dev/null | awk '{print $3}' | sed 's/go//' || echo "none")
if [[ "$CURRENT_GO" != "$GO_VERSION" ]]; then
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" -O /tmp/go.tar.gz || die "Failed to download Go"
  rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz && rm -f /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
fi
log "    $(go version)"

# ─── 3. Clone / build ────────────────────────────────────────────────────────
log "[3/6] Fetching source from ${REPO_URL}..."
if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" fetch origin main && git -C "$REPO_DIR" reset --hard origin/main
else
  git clone --depth=1 "$REPO_URL" "$REPO_DIR"
fi
[[ -f "$REPO_DIR/go.mod" ]] || die "go.mod not found in $REPO_DIR"

log "[4/6] Building ${BINARY}..."
( cd "$REPO_DIR" && go mod download && \
  go build -ldflags="-s -w -X main.version=${GYDS_VERSION}" -o "/tmp/${BINARY}" . )
install -m 0755 -o root -g root "/tmp/${BINARY}" "${GYDS_BIN}/${BINARY}"
rm -f "/tmp/${BINARY}"
log "    Installed: ${GYDS_BIN}/${BINARY}"

# ─── 4. User & dirs ──────────────────────────────────────────────────────────
log "[5/6] Creating user and directories..."
id "$APP_USER" &>/dev/null || \
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER" 2>/dev/null || \
  adduser --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "${DATA_DIR}"/{state.db,logs} "${LOG_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}" "${LOG_DIR}"

# ─── 5. Firewall ─────────────────────────────────────────────────────────────
ufw default deny incoming >/dev/null 2>&1 || true
ufw default allow outgoing >/dev/null 2>&1 || true
ufw limit 22/tcp            comment "SSH"            >/dev/null 2>&1 || true
ufw allow "${RPC_PORT}/tcp" comment "GYDS Boost RPC" >/dev/null 2>&1 || true
ufw allow "${P2P_PORT}/tcp" comment "GYDS Boost P2P" >/dev/null 2>&1 || true
ufw allow "${P2P_PORT}/udp" comment "GYDS Boost P2P" >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

# ─── 6. systemd service ──────────────────────────────────────────────────────
log "[6/6] Installing systemd service..."
cat > /etc/systemd/system/gyds-boostnode.service <<EOF
[Unit]
Description=GYDSchain Boost Node v${GYDS_VERSION}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${DATA_DIR}
Environment=GYDS_CHAIN_ID=${CHAIN_ID}
Environment=GYDS_NODE_MODE=boost
Environment=GYDS_RPC_PORT=${RPC_PORT}
Environment=GYDS_RPC_HOST=0.0.0.0
Environment=GYDS_P2P_PORT=${P2P_PORT}
Environment=GYDS_DATA_DIR=${DATA_DIR}
Environment=GYDS_LOG_LEVEL=${LOG_LEVEL}
Environment=GYDS_LOG_FORMAT=json
$([ -n "$BOOTSTRAP" ] && echo "Environment=GYDS_BOOTSTRAP_NODES=${BOOTSTRAP}")
ExecStart=${GYDS_BIN}/${BINARY} start
ExecReload=/bin/kill -HUP \$MAINPID
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/boostnode.log
StandardError=append:${LOG_DIR}/boostnode-error.log
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${DATA_DIR} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gyds-boostnode
systemctl restart gyds-boostnode
sleep 3

NODE_OK=false
for i in 1 2 3; do
  curl -sf --max-time 4 "http://localhost:${RPC_PORT}/health" &>/dev/null && NODE_OK=true && break
  sleep 4
done

SERVER_IP=$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         GYDSchain BOOST NODE — DEPLOYED                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
$NODE_OK && echo "  Status  : ✅ RUNNING" || echo "  Status  : ⚠️  NOT RESPONDING — check logs"
echo ""
echo "  Binary  : ${GYDS_BIN}/${BINARY}"
echo "  Service : gyds-boostnode.service"
echo "  Data    : ${DATA_DIR}"
echo "  Logs    : ${LOG_DIR}/boostnode.log"
echo "  RPC     : http://${SERVER_IP}:${RPC_PORT}"
echo "  P2P     : tcp://${SERVER_IP}:${P2P_PORT}"
echo "  Chain ID: ${CHAIN_ID}  |  Mode: boost"
echo ""
echo "  systemctl status gyds-boostnode"
echo "  journalctl -u gyds-boostnode -f"
echo ""
