#!/usr/bin/env bash
# ============================================================
# GYDS Chain — Production Boost Node Installer
# Ubuntu 22.04+
#
# Features:
#   - installs dependencies
#   - installs Go
#   - clones guardian-chain repo
#   - auto-detects Go main package
#   - builds boost node binary
#   - configures networking
#   - configures firewall
#   - creates hardened systemd service
#   - enables log rotation
#
# Usage:
#   sudo bash setup-boostnode.sh
# ============================================================

set -Eeuo pipefail

# ============================================================
# Configuration
# ============================================================

GYDS_USER="${GYDS_USER:-gyds}"

GYDS_DATADIR="${GYDS_DATADIR:-/var/lib/gyds-boostnode}"

GYDS_CHAIN_ID="${GYDS_CHAIN_ID:-1337}"

GYDS_RPC_PORT="${GYDS_RPC_PORT:-8545}"
GYDS_P2P_PORT="${GYDS_P2P_PORT:-30306}"
GYDS_BOOST_PORT="${GYDS_BOOST_PORT:-30307}"

GO_VERSION="${GO_VERSION:-1.22.4}"

GIT_REPO="${GIT_REPO:-https://github.com/hc172808/guardian-chain.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"

# Actual Go module location inside repo
BUILD_SUBDIR=".migration-backup/public/blockchain-go"

# ============================================================
# Colors
# ============================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[BOOST]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()  { echo -e "${RED}[ERROR]${NC}  $*"; exit 1; }

cleanup() {
  [[ -n "${REPO_DIR:-}" && -d "${REPO_DIR:-}" ]] && rm -rf "${REPO_DIR}"
}

trap cleanup EXIT

[[ $EUID -ne 0 ]] && die "Run as root: sudo bash $0"

# ============================================================
# Install Dependencies
# ============================================================

log "Installing dependencies..."

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq

apt-get install -y --no-install-recommends \
  curl \
  wget \
  git \
  jq \
  rsync \
  ufw \
  build-essential \
  ca-certificates \
  net-tools \
  iperf3 \
  tcpdump \
  logrotate

# ============================================================
# Create User
# ============================================================

if ! id "${GYDS_USER}" &>/dev/null; then
  log "Creating system user: ${GYDS_USER}"
  useradd -r -m -s /bin/bash "${GYDS_USER}"
fi

# ============================================================
# Create Directories
# ============================================================

log "Creating directories..."

mkdir -p \
  "${GYDS_DATADIR}/logs" \
  "${GYDS_DATADIR}/peers"

chown -R "${GYDS_USER}:${GYDS_USER}" "${GYDS_DATADIR}"

# ============================================================
# Kernel Tuning
# ============================================================

log "Applying kernel tuning..."

cat > /etc/sysctl.d/99-gyds-boostnode.conf <<SYSCTL
# ==================================================
# GYDS Boost Node Tuning
# ==================================================

net.core.rmem_max = 134217728
net.core.wmem_max = 134217728

net.core.netdev_max_backlog = 5000

net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728

net.ipv4.tcp_congestion_control = bbr
net.core.default_qdisc = fq

net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1

fs.file-max = 2097152
SYSCTL

sysctl --system >/dev/null

# ============================================================
# Limits
# ============================================================

log "Setting limits..."

cat > /etc/security/limits.d/gyds.conf <<LIMITS
${GYDS_USER} soft nofile 131072
${GYDS_USER} hard nofile 131072
${GYDS_USER} soft nproc 32768
${GYDS_USER} hard nproc 32768
LIMITS

# ============================================================
# Install Go
# ============================================================

install_go() {

  log "Installing Go ${GO_VERSION}..."

  wget -q \
    "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" \
    -O /tmp/go.tar.gz

  rm -rf /usr/local/go

  tar -C /usr/local -xzf /tmp/go.tar.gz

  cat > /etc/profile.d/go.sh <<'EOF'
export PATH=$PATH:/usr/local/go/bin
EOF

  rm -f /tmp/go.tar.gz
}

if ! command -v go &>/dev/null; then

  install_go

else

  CURRENT_GO="$(go version | awk '{print $3}')"

  if [[ "${CURRENT_GO}" != "go${GO_VERSION}" ]]; then
    warn "Go version mismatch (${CURRENT_GO})"
    install_go
  fi
fi

export PATH=$PATH:/usr/local/go/bin

# ============================================================
# Clone Repository
# ============================================================

log "Cloning Guardian Chain repository..."

REPO_DIR="$(mktemp -d)"

git clone \
  --depth=1 \
  --branch "${GIT_BRANCH}" \
  "${GIT_REPO}" \
  "${REPO_DIR}"

# ============================================================
# Build Directory
# ============================================================

BUILD_DIR="${REPO_DIR}/${BUILD_SUBDIR}"

[[ -d "${BUILD_DIR}" ]] \
  || die "Build directory not found: ${BUILD_DIR}"

cd "${BUILD_DIR}"

[[ -f "go.mod" ]] \
  || die "go.mod not found in ${BUILD_DIR}"

# ============================================================
# Detect Main Package
# ============================================================

log "Detecting Go main package..."

MAIN_DIR=""

while IFS= read -r file; do

  if grep -q "^package main" "$file"; then
    MAIN_DIR="$(dirname "$file")"
    break
  fi

done < <(find "${BUILD_DIR}" -name "*.go")

[[ -n "${MAIN_DIR}" ]] \
  || die "Could not locate package main"

log "Detected main package: ${MAIN_DIR}"

# ============================================================
# Build Binary
# ============================================================

log "Building boost node binary..."

if ! go build \
    -ldflags="-s -w" \
    -tags boostnode \
    -o /usr/local/bin/gyds-boostnode \
    "${MAIN_DIR}"; then

  warn "Tagged build failed — retrying standard build..."

  go build \
    -ldflags="-s -w" \
    -o /usr/local/bin/gyds-boostnode \
    "${MAIN_DIR}"
fi

cd - >/dev/null

chmod +x /usr/local/bin/gyds-boostnode

[[ -x /usr/local/bin/gyds-boostnode ]] \
  || die "Boost node binary missing"

# ============================================================
# Config
# ============================================================

log "Writing config..."

cat > "${GYDS_DATADIR}/config.toml" <<CONFIG
[node]
mode      = "boost"
datadir   = "${GYDS_DATADIR}"
chain_id  = ${GYDS_CHAIN_ID}
log_level = "info"

[p2p]
port       = ${GYDS_P2P_PORT}
max_peers  = 200
relay      = true
bootstrap  = true
boost_port = ${GYDS_BOOST_PORT}

[rpc]
enabled = true
host    = "127.0.0.1"
port    = ${GYDS_RPC_PORT}

[sync]
mode     = "light"
snapshot = false
CONFIG

chown -R "${GYDS_USER}:${GYDS_USER}" "${GYDS_DATADIR}"

# ============================================================
# Log Rotation
# ============================================================

log "Configuring log rotation..."

cat > /etc/logrotate.d/gyds-boostnode <<ROTATE
${GYDS_DATADIR}/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
ROTATE

# ============================================================
# Systemd Service
# ============================================================

log "Creating systemd service..."

cat > /etc/systemd/system/gyds-boostnode.service <<SERVICE
[Unit]
Description=GYDS Chain Boost Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple

User=${GYDS_USER}
Group=${GYDS_USER}

WorkingDirectory=${GYDS_DATADIR}

Environment=GYDS_CHAIN_ID=${GYDS_CHAIN_ID}
Environment=GYDS_RPC_PORT=${GYDS_RPC_PORT}
Environment=GYDS_P2P_PORT=${GYDS_P2P_PORT}
Environment=GYDS_DATA_DIR=${GYDS_DATADIR}
Environment=GYDS_NODE_MODE=boost

ExecStart=/usr/local/bin/gyds-boostnode start

Restart=always
RestartSec=5

LimitNOFILE=131072
LimitNPROC=32768

StandardOutput=append:${GYDS_DATADIR}/logs/boost.log
StandardError=append:${GYDS_DATADIR}/logs/boost-error.log

# ==================================================
# Security Hardening
# ==================================================

NoNewPrivileges=true
PrivateTmp=true

ProtectSystem=strict
ProtectHome=true

ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

MemoryDenyWriteExecute=true
LockPersonality=true
RestrictRealtime=true

ReadWritePaths=${GYDS_DATADIR}

[Install]
WantedBy=multi-user.target
SERVICE

# ============================================================
# Firewall
# ============================================================

log "Configuring firewall..."

ufw allow 22/tcp

ufw allow "${GYDS_P2P_PORT}/tcp"
ufw allow "${GYDS_P2P_PORT}/udp"

ufw allow "${GYDS_BOOST_PORT}/tcp"
ufw allow "${GYDS_BOOST_PORT}/udp"

ufw --force enable

# ============================================================
# Start Service
# ============================================================

log "Starting boost node..."

systemctl daemon-reload

systemctl enable gyds-boostnode

systemctl restart gyds-boostnode

sleep 3

# ============================================================
# Health Check
# ============================================================

if systemctl is-active --quiet gyds-boostnode; then
  STATUS="RUNNING"
else
  STATUS="FAILED"
fi

PUBLIC_IP="$(curl -4 -s https://api.ipify.org || true)"

# ============================================================
# Final Output
# ============================================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}     GYDS Boost Node Installation Complete${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"

echo ""
echo " Status         : ${STATUS}"
echo " Data Directory : ${GYDS_DATADIR}"

echo ""
echo " P2P Port       : ${GYDS_P2P_PORT}"
echo " Boost Port     : ${GYDS_BOOST_PORT}"
echo " RPC Port       : ${GYDS_RPC_PORT}"

echo ""

if [[ -n "${PUBLIC_IP}" ]]; then
  echo " Bootstrap Entry:"
  echo "   GYDS_BOOTSTRAP_NODES=${PUBLIC_IP}:${GYDS_P2P_PORT}"
fi

echo ""
echo " Service Commands:"
echo "   systemctl status gyds-boostnode"
echo "   journalctl -u gyds-boostnode -f"

echo ""
echo " Peer Monitoring:"
echo "   curl http://127.0.0.1:${GYDS_RPC_PORT}/api/peers"

echo ""
echo " Logs:"
echo "   tail -f ${GYDS_DATADIR}/logs/boost.log"

echo ""
echo " Installation Complete."
echo ""
