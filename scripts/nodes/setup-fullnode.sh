#!/usr/bin/env bash
# ============================================================
# GYDS Chain — Full Node Setup (Ubuntu 22.04)
# Usage: sudo bash setup-fullnode.sh [--datadir /data/gyds]
# ============================================================
set -euo pipefail

GYDS_VERSION="${GYDS_VERSION:-1.0.0}"
GYDS_USER="${GYDS_USER:-gyds}"
GYDS_DATADIR="${GYDS_DATADIR:-/var/lib/gyds-fullnode}"
GYDS_CHAIN_ID="${GYDS_CHAIN_ID:-1337}"
GYDS_RPC_PORT="${GYDS_RPC_PORT:-8545}"
GYDS_WS_PORT="${GYDS_WS_PORT:-8546}"
GYDS_P2P_PORT="${GYDS_P2P_PORT:-30303}"
GO_VERSION="1.22.4"
BINARY_URL="https://github.com/gydschain/node/releases/download/v${GYDS_VERSION}/gyds-fullnode-linux-amd64"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --datadir) GYDS_DATADIR="$2"; shift 2 ;;
    --rpc-port) GYDS_RPC_PORT="$2"; shift 2 ;;
    --p2p-port) GYDS_P2P_PORT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[GYDS]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && die "Run as root: sudo bash $0"

log "Installing system dependencies..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  curl wget git build-essential ca-certificates \
  jq lsof ufw net-tools snapd

log "Installing Go ${GO_VERSION}..."
if ! command -v go &>/dev/null || [[ "$(go version | awk '{print $3}' | tr -d 'go')" != "$GO_VERSION" ]]; then
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
  rm /tmp/go.tar.gz
fi
export PATH=$PATH:/usr/local/go/bin
log "Go version: $(go version)"

log "Creating system user '${GYDS_USER}'..."
id "${GYDS_USER}" &>/dev/null || useradd -r -m -s /bin/bash -d "/home/${GYDS_USER}" "${GYDS_USER}"

log "Creating data directory: ${GYDS_DATADIR}"
mkdir -p "${GYDS_DATADIR}"/{chaindata,keystore,logs}
chown -R "${GYDS_USER}:${GYDS_USER}" "${GYDS_DATADIR}"

log "Installing GYDS Full Node binary..."
INSTALL_DIR="/usr/local/bin"
if [[ -n "$BINARY_URL" ]] && curl --silent --fail -L "$BINARY_URL" -o "${INSTALL_DIR}/gyds-fullnode" 2>/dev/null; then
  chmod +x "${INSTALL_DIR}/gyds-fullnode"
  log "Binary installed from release."
else
  warn "Pre-built binary not found — building from source..."
  BUILD_TMP=$(mktemp -d)
  git clone --depth=1 https://github.com/gydschain/node.git "$BUILD_TMP" 2>/dev/null || {
    warn "Repo not yet public. Building litenode from local source instead."
    cp -r . "$BUILD_TMP" 2>/dev/null || true
  }
  cd "$BUILD_TMP" && go build -ldflags="-s -w" -o "${INSTALL_DIR}/gyds-fullnode" . && cd -
  rm -rf "$BUILD_TMP"
fi

log "Writing genesis configuration..."
cat > "${GYDS_DATADIR}/genesis.json" <<GENESIS
{
  "chainId": ${GYDS_CHAIN_ID},
  "networkName": "GYDS Chain",
  "gasLimit": "0x1C9C380",
  "difficulty": "0x1",
  "timestamp": "0x65974880",
  "extraData": "0x4759445320436861696e",
  "validators": [
    "0x0000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000002",
    "0x0000000000000000000000000000000000000003"
  ],
  "alloc": {
    "0x0000000000000000000000000000000000000001": { "balance": "100000000000000000000000000" },
    "0x0000000000000000000000000000000000000002": { "balance": "50000000000000000000000000" }
  }
}
GENESIS

log "Writing node configuration..."
cat > "${GYDS_DATADIR}/config.toml" <<CONFIG
[node]
mode       = "full"
datadir    = "${GYDS_DATADIR}"
chain_id   = ${GYDS_CHAIN_ID}
log_level  = "info"

[p2p]
port       = ${GYDS_P2P_PORT}
max_peers  = 50
bootstrap  = []

[rpc]
enabled    = true
host       = "0.0.0.0"
port       = ${GYDS_RPC_PORT}

[ws]
enabled    = true
port       = ${GYDS_WS_PORT}

[sync]
mode       = "full"
snapshot   = true
CONFIG

log "Configuring firewall (ufw)..."
ufw --force enable
ufw allow "${GYDS_P2P_PORT}/tcp" comment "GYDS P2P"
ufw allow "${GYDS_P2P_PORT}/udp" comment "GYDS P2P UDP"
ufw allow "${GYDS_RPC_PORT}/tcp" comment "GYDS RPC HTTP"
ufw allow "${GYDS_WS_PORT}/tcp"  comment "GYDS RPC WS"
ufw allow 22/tcp comment "SSH"

log "Creating systemd service..."
cat > /etc/systemd/system/gyds-fullnode.service <<SERVICE
[Unit]
Description=GYDS Chain Full Node
After=network-online.target
Wants=network-online.target

[Service]
User=${GYDS_USER}
Group=${GYDS_USER}
Type=simple
Restart=on-failure
RestartSec=10
ExecStart=${INSTALL_DIR}/gyds-fullnode start \\
  --datadir=${GYDS_DATADIR} \\
  --rpc-port=${GYDS_RPC_PORT} \\
  --p2p-port=${GYDS_P2P_PORT} \\
  --config=${GYDS_DATADIR}/config.toml
StandardOutput=append:${GYDS_DATADIR}/logs/fullnode.log
StandardError=append:${GYDS_DATADIR}/logs/fullnode-error.log
LimitNOFILE=65536
LimitNPROC=65536

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable gyds-fullnode
systemctl start  gyds-fullnode

log "Waiting for node to start..."
sleep 3
if systemctl is-active --quiet gyds-fullnode; then
  log "Full node is running!"
else
  warn "Node may not have started — check: journalctl -u gyds-fullnode -n 50"
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  GYDS Full Node Setup Complete!          ${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "  Data dir  : ${GYDS_DATADIR}"
echo "  RPC HTTP  : http://localhost:${GYDS_RPC_PORT}"
echo "  RPC WS    : ws://localhost:${GYDS_WS_PORT}"
echo "  P2P Port  : ${GYDS_P2P_PORT}"
echo "  Logs      : ${GYDS_DATADIR}/logs/"
echo ""
echo "  Commands:"
echo "    sudo systemctl status gyds-fullnode"
echo "    sudo journalctl -u gyds-fullnode -f"
echo "    curl http://localhost:${GYDS_RPC_PORT}/api/status"
