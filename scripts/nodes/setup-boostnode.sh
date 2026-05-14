#!/usr/bin/env bash
# ============================================================
# GYDS Chain — Boost Node Setup (Ubuntu 22.04)
# A boost node is a high-bandwidth P2P relay/bootstrap node
# that helps new nodes discover peers and accelerates block
# propagation across the network.
# Usage: sudo bash setup-boostnode.sh
# ============================================================
set -euo pipefail

GYDS_USER="${GYDS_USER:-gyds}"
GYDS_DATADIR="${GYDS_DATADIR:-/var/lib/gyds-boostnode}"
GYDS_CHAIN_ID="${GYDS_CHAIN_ID:-1337}"
GYDS_RPC_PORT="${GYDS_RPC_PORT:-8545}"
GYDS_P2P_PORT="${GYDS_P2P_PORT:-30306}"
GYDS_BOOST_PORT="${GYDS_BOOST_PORT:-30307}"
GO_VERSION="1.22.4"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[BOOST]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()  { echo -e "${RED}[ERROR]${NC}  $*"; exit 1; }

[[ $EUID -ne 0 ]] && die "Run as root: sudo bash $0"

log "Installing system dependencies + high-performance networking..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  curl wget git build-essential ca-certificates jq ufw \
  net-tools iperf3 tcpdump

log "Tuning kernel for high-throughput P2P networking..."
cat >> /etc/sysctl.conf <<SYSCTL

# GYDS Boost Node network tuning
net.core.rmem_max        = 134217728
net.core.wmem_max        = 134217728
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_rmem        = 4096 87380 134217728
net.ipv4.tcp_wmem        = 4096 65536 134217728
net.ipv4.tcp_congestion_control = bbr
net.core.default_qdisc   = fq
fs.file-max              = 2097152
SYSCTL
sysctl -p > /dev/null

log "Setting system limits..."
cat >> /etc/security/limits.conf <<LIMITS
${GYDS_USER}  soft  nofile  131072
${GYDS_USER}  hard  nofile  131072
${GYDS_USER}  soft  nproc   32768
${GYDS_USER}  hard  nproc   32768
LIMITS

log "Installing Go ${GO_VERSION}..."
if ! command -v go &>/dev/null; then
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
  rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile.d/go.sh
  rm /tmp/go.tar.gz
fi
export PATH=$PATH:/usr/local/go/bin

id "${GYDS_USER}" &>/dev/null || useradd -r -m -s /bin/bash "${GYDS_USER}"
mkdir -p "${GYDS_DATADIR}"/{peers,logs}
chown -R "${GYDS_USER}:${GYDS_USER}" "${GYDS_DATADIR}"

log "Building boost node binary..."
REPO_DIR=$(mktemp -d)
rsync -a --exclude=bin --exclude=data artifacts/gyds-litenode/ "${REPO_DIR}/" 2>/dev/null || true
cd "${REPO_DIR}"
go build -ldflags="-s -w" -tags boostnode \
  -o /usr/local/bin/gyds-boostnode . 2>/dev/null || \
  go build -ldflags="-s -w" -o /usr/local/bin/gyds-boostnode . 2>/dev/null || \
  warn "Build failed — deploy binary manually"
cd - && rm -rf "${REPO_DIR}"
chmod +x /usr/local/bin/gyds-boostnode 2>/dev/null || true

log "Writing boost node config..."
cat > "${GYDS_DATADIR}/config.toml" <<CONFIG
[node]
mode      = "boost"
datadir   = "${GYDS_DATADIR}"
chain_id  = ${GYDS_CHAIN_ID}
log_level = "info"

[p2p]
port      = ${GYDS_P2P_PORT}
max_peers = 200
relay     = true
bootstrap = true
boost_port = ${GYDS_BOOST_PORT}

[rpc]
enabled = true
host    = "127.0.0.1"
port    = ${GYDS_RPC_PORT}

[sync]
mode     = "light"
snapshot = false
CONFIG

log "Creating systemd service..."
cat > /etc/systemd/system/gyds-boostnode.service <<SERVICE
[Unit]
Description=GYDS Chain Boost Node (P2P Relay)
After=network-online.target
Wants=network-online.target

[Service]
User=${GYDS_USER}
Group=${GYDS_USER}
Type=simple
Restart=always
RestartSec=5
Environment=GYDS_CHAIN_ID=${GYDS_CHAIN_ID}
Environment=GYDS_RPC_PORT=${GYDS_RPC_PORT}
Environment=GYDS_P2P_PORT=${GYDS_P2P_PORT}
Environment=GYDS_DATA_DIR=${GYDS_DATADIR}
Environment=GYDS_NODE_MODE=boost
ExecStart=/usr/local/bin/gyds-boostnode start
StandardOutput=append:${GYDS_DATADIR}/logs/boost.log
StandardError=append:${GYDS_DATADIR}/logs/boost-error.log
LimitNOFILE=131072
LimitNPROC=32768

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable gyds-boostnode
systemctl start gyds-boostnode

ufw --force enable
ufw allow 22/tcp
ufw allow "${GYDS_P2P_PORT}/tcp"
ufw allow "${GYDS_P2P_PORT}/udp"
ufw allow "${GYDS_BOOST_PORT}/tcp"
ufw allow "${GYDS_BOOST_PORT}/udp"

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  GYDS Boost Node Setup Complete!         ${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "  Data dir  : ${GYDS_DATADIR}"
echo "  P2P Port  : ${GYDS_P2P_PORT}"
echo "  Boost Port: ${GYDS_BOOST_PORT}"
echo ""
echo "  Add this node's IP to bootstrap lists of other nodes:"
echo "    GYDS_BOOTSTRAP_NODES=<THIS_SERVER_IP>:${GYDS_P2P_PORT}"
echo ""
echo "  Monitor peers:"
echo "    curl http://localhost:${GYDS_RPC_PORT}/api/peers"
