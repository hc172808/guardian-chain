#!/usr/bin/env bash
# ============================================================
# GYDS Chain — Light Node Setup (Ubuntu 22.04)
# Usage: sudo bash setup-litenode.sh [--datadir /data/gyds-lite]
# ============================================================
set -euo pipefail

GYDS_USER="${GYDS_USER:-gyds}"
GYDS_DATADIR="${GYDS_DATADIR:-/var/lib/gyds-litenode}"
GYDS_CHAIN_ID="${GYDS_CHAIN_ID:-1337}"
GYDS_RPC_PORT="${GYDS_RPC_PORT:-8545}"
GYDS_WS_PORT="${GYDS_WS_PORT:-8546}"
GYDS_P2P_PORT="${GYDS_P2P_PORT:-30304}"
GO_VERSION="1.22.4"
REPO_DIR="/opt/gyds-litenode"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --datadir)  GYDS_DATADIR="$2";  shift 2 ;;
    --rpc-port) GYDS_RPC_PORT="$2"; shift 2 ;;
    --p2p-port) GYDS_P2P_PORT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[LITE]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && die "Run as root: sudo bash $0"

log "Installing system dependencies..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  curl wget git build-essential ca-certificates jq ufw

log "Installing Go ${GO_VERSION}..."
if ! command -v go &>/dev/null; then
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
  rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile.d/go.sh
  rm /tmp/go.tar.gz
fi
export PATH=$PATH:/usr/local/go/bin

log "Creating system user '${GYDS_USER}'..."
id "${GYDS_USER}" &>/dev/null || useradd -r -m -s /bin/bash "${GYDS_USER}"

log "Creating directories..."
mkdir -p "${GYDS_DATADIR}"/{headers,logs} "${REPO_DIR}"
chown -R "${GYDS_USER}:${GYDS_USER}" "${GYDS_DATADIR}" "${REPO_DIR}"

log "Cloning/copying litenode source..."
if git ls-remote https://github.com/gydschain/litenode.git &>/dev/null 2>&1; then
  git clone --depth=1 https://github.com/gydschain/litenode.git "$REPO_DIR" || true
else
  warn "Using local source (copy artifacts/gyds-litenode/ to ${REPO_DIR})"
  rsync -a --exclude=bin --exclude=data . "${REPO_DIR}/" 2>/dev/null || true
fi

log "Building litenode binary..."
cd "${REPO_DIR}"
GOPATH=/home/${GYDS_USER}/go go build \
  -ldflags="-s -w" \
  -o /usr/local/bin/gyds-litenode .
chmod +x /usr/local/bin/gyds-litenode
log "Binary built: $(gyds-litenode version)"

log "Writing config..."
cat > "${GYDS_DATADIR}/config.toml" <<CONFIG
[node]
mode      = "lite"
datadir   = "${GYDS_DATADIR}"
chain_id  = ${GYDS_CHAIN_ID}
log_level = "info"

[p2p]
port       = ${GYDS_P2P_PORT}
max_peers  = 25

[rpc]
enabled = true
host    = "0.0.0.0"
port    = ${GYDS_RPC_PORT}

[ws]
enabled = true
port    = ${GYDS_WS_PORT}

[sync]
mode     = "light"
snapshot = true
CONFIG

log "Configuring firewall..."
ufw --force enable
ufw allow "${GYDS_P2P_PORT}/tcp"
ufw allow "${GYDS_P2P_PORT}/udp"
ufw allow "${GYDS_RPC_PORT}/tcp"
ufw allow "${GYDS_WS_PORT}/tcp"
ufw allow 22/tcp

log "Creating systemd service..."
cat > /etc/systemd/system/gyds-litenode.service <<SERVICE
[Unit]
Description=GYDS Chain Light Node
After=network-online.target
Wants=network-online.target

[Service]
User=${GYDS_USER}
Group=${GYDS_USER}
Type=simple
Restart=on-failure
RestartSec=10
Environment=GYDS_CHAIN_ID=${GYDS_CHAIN_ID}
Environment=GYDS_RPC_PORT=${GYDS_RPC_PORT}
Environment=GYDS_P2P_PORT=${GYDS_P2P_PORT}
Environment=GYDS_DATA_DIR=${GYDS_DATADIR}
Environment=GYDS_NODE_MODE=lite
ExecStart=/usr/local/bin/gyds-litenode start
StandardOutput=append:${GYDS_DATADIR}/logs/litenode.log
StandardError=append:${GYDS_DATADIR}/logs/litenode-error.log
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable gyds-litenode
systemctl start  gyds-litenode

sleep 3
if systemctl is-active --quiet gyds-litenode; then
  log "Litenode is running!"
else
  warn "Node may not have started — check: journalctl -u gyds-litenode -n 50"
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  GYDS Light Node Setup Complete!         ${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "  Data dir : ${GYDS_DATADIR}"
echo "  RPC      : http://localhost:${GYDS_RPC_PORT}"
echo "  WS       : ws://localhost:${GYDS_WS_PORT}"
echo "  P2P      : ${GYDS_P2P_PORT}"
echo ""
echo "  Commands:"
echo "    sudo systemctl status gyds-litenode"
echo "    sudo journalctl -u gyds-litenode -f"
echo "    curl http://localhost:${GYDS_RPC_PORT}/api/status"
