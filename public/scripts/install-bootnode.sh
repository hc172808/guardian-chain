#!/usr/bin/env bash
#
# GYDSchain Bootnode Installer
# ------------------------------------------------------------------
# Installs and configures a peer-discovery bootnode for GYDSchain.
#
# A bootnode is a minimal node:
#   - P2P discovery only
#   - NO mining, NO consensus, NO RPC, NO state storage
#   - Helps new fullnodes/litenodes find the network
#
# Recommended: deploy 2-3 bootnodes on different cloud providers.
#
# Target OS: Ubuntu 22.04 LTS (or compatible Debian)
# Run as:    sudo bash install-bootnode.sh
# ------------------------------------------------------------------

set -euo pipefail

# ---------------------- Configuration ----------------------
GYDS_USER="gydschain"
GYDS_HOME="/var/lib/gydschain"
BOOTNODE_DIR="${GYDS_HOME}/bootnode"
LOG_DIR="/var/log/gydschain"
BIN_PATH="/usr/local/bin/gyds-bootnode"
SERVICE_FILE="/etc/systemd/system/gyds-bootnode.service"
CONFIG_FILE="/etc/gydschain/bootnode.toml"

CHAIN_ID="${CHAIN_ID:-13370}"
P2P_PORT="${P2P_PORT:-30303}"
MAX_PEERS="${MAX_PEERS:-100}"
PUBLIC_ADDR="${PUBLIC_ADDR:-}"           # e.g. bootnode1.netlifegy.com:30303
BOOTSTRAP_PEERS="${BOOTSTRAP_PEERS:-}"   # comma-separated host:port list

# Source location: where the Go source lives. Defaults to the repo path you
# cloned this script from. Override with SRC_DIR=/path/to/blockchain-go
REPO_URL="${REPO_URL:-https://github.com/hc172808/guardian-chain.git}"
REPO_DIR="${REPO_DIR:-/opt/guardian-chain}"
SRC_DIR="${SRC_DIR:-$(cd "$(dirname "$0")/../blockchain-go" 2>/dev/null && pwd || echo "")}"

GO_VERSION="${GO_VERSION:-1.22.0}"

# ---------------------- Helpers ----------------------
log()  { echo -e "\033[1;32m[+]\033[0m $*"; }
warn() { echo -e "\033[1;33m[!]\033[0m $*"; }
err()  { echo -e "\033[1;31m[✗]\033[0m $*" >&2; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    err "This script must be run as root (use sudo)."
    exit 1
  fi
}

require_root

# ---------------------- 1. System packages ----------------------
log "Updating apt and installing prerequisites..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl wget git build-essential ufw fail2ban openssl ca-certificates

# ---------------------- 2. Install Go ----------------------
if ! command -v go >/dev/null 2>&1 || [[ "$(go version | awk '{print $3}')" != "go${GO_VERSION}" ]]; then
  log "Installing Go ${GO_VERSION}..."
  cd /tmp
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz"
  rm -rf /usr/local/go
  tar -C /usr/local -xzf "go${GO_VERSION}.linux-amd64.tar.gz"
  rm -f "go${GO_VERSION}.linux-amd64.tar.gz"
  ln -sf /usr/local/go/bin/go    /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
fi
log "Go: $(go version)"

# ---------------------- 3. System user & directories ----------------------
if ! id -u "${GYDS_USER}" >/dev/null 2>&1; then
  log "Creating system user ${GYDS_USER}..."
  useradd --system --home-dir "${GYDS_HOME}" --shell /usr/sbin/nologin "${GYDS_USER}"
fi

log "Creating directories..."
mkdir -p "${BOOTNODE_DIR}" "${LOG_DIR}" "$(dirname "${CONFIG_FILE}")"
chown -R "${GYDS_USER}:${GYDS_USER}" "${GYDS_HOME}" "${LOG_DIR}"
chmod 750 "${BOOTNODE_DIR}"

# ---------------------- 4. Build the binary ----------------------
if [[ -z "${SRC_DIR}" || ! -d "${SRC_DIR}" ]]; then
  warn "SRC_DIR not set — cloning from ${REPO_URL}..."
  if [[ -d "${REPO_DIR}/.git" ]]; then
    log "Repo already exists at ${REPO_DIR} — pulling latest..."
    git -C "${REPO_DIR}" pull --ff-only
  else
    git clone --depth=1 "${REPO_URL}" "${REPO_DIR}"
  fi
  SRC_DIR="${REPO_DIR}/public/blockchain-go"
fi

if [[ ! -d "${SRC_DIR}" ]]; then
  err "Source not found at ${SRC_DIR}"
  err "Example: SRC_DIR=/opt/guardian-chain/public/blockchain-go sudo -E bash $0"
  exit 1
fi

log "Building gyds-bootnode from ${SRC_DIR}..."
BUILD_TMP="$(mktemp -d)"
cp -r "${SRC_DIR}" "${BUILD_TMP}/blockchain-go"
pushd "${BUILD_TMP}/blockchain-go" >/dev/null
sudo -u "${GYDS_USER}" -H env HOME="${GYDS_HOME}" PATH="$PATH" \
  go build -ldflags "-s -w" -o "${BUILD_TMP}/gyds-bootnode" ./cmd/bootnode
popd >/dev/null

install -m 0755 -o root -g root "${BUILD_TMP}/gyds-bootnode" "${BIN_PATH}"
rm -rf "${BUILD_TMP}"
log "Installed binary: ${BIN_PATH}"
"${BIN_PATH}" --help 2>&1 | head -8 || true

# ---------------------- 5. Generate node key ----------------------
KEY_FILE="${BOOTNODE_DIR}/node.key"
if [[ ! -f "${KEY_FILE}" ]]; then
  log "Generating node key..."
  openssl rand -hex 32 > "${KEY_FILE}"
  chown "${GYDS_USER}:${GYDS_USER}" "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"
fi
log "Node key: ${KEY_FILE}"

# ---------------------- 6. Config file ----------------------
log "Writing config: ${CONFIG_FILE}"
cat > "${CONFIG_FILE}" <<EOF
# GYDSchain Bootnode Configuration
chain_id    = ${CHAIN_ID}
p2p_port    = ${P2P_PORT}
max_peers   = ${MAX_PEERS}
data_dir    = "${BOOTNODE_DIR}"
node_key    = "${KEY_FILE}"
public_addr = "${PUBLIC_ADDR}"
bootstrap   = "${BOOTSTRAP_PEERS}"
EOF
chmod 644 "${CONFIG_FILE}"

# ---------------------- 7. systemd service ----------------------
log "Installing systemd unit..."
BOOTSTRAP_FLAG=""
if [[ -n "${BOOTSTRAP_PEERS}" ]]; then
  BOOTSTRAP_FLAG="--bootstrap=${BOOTSTRAP_PEERS}"
fi
PUBLIC_FLAG=""
if [[ -n "${PUBLIC_ADDR}" ]]; then
  PUBLIC_FLAG="--public-addr=${PUBLIC_ADDR}"
fi

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=GYDSchain Bootnode (Peer Discovery)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${GYDS_USER}
Group=${GYDS_USER}
ExecStart=${BIN_PATH} \\
  --datadir=${BOOTNODE_DIR} \\
  --p2pport=${P2P_PORT} \\
  --maxpeers=${MAX_PEERS} \\
  --node-key=${KEY_FILE} \\
  --chain-id=${CHAIN_ID} \\
  ${PUBLIC_FLAG} ${BOOTSTRAP_FLAG}
Restart=always
RestartSec=10
StandardOutput=append:${LOG_DIR}/bootnode.log
StandardError=append:${LOG_DIR}/bootnode-error.log

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ReadWritePaths=${BOOTNODE_DIR} ${LOG_DIR}
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gyds-bootnode.service

# ---------------------- 8. Firewall (ufw) ----------------------
log "Configuring ufw firewall..."
ufw --force enable >/dev/null 2>&1 || true
ufw allow 22/tcp comment 'SSH' >/dev/null 2>&1 || true
ufw allow "${P2P_PORT}/tcp" comment 'GYDSchain bootnode P2P TCP' >/dev/null 2>&1 || true
ufw allow "${P2P_PORT}/udp" comment 'GYDSchain bootnode P2P UDP' >/dev/null 2>&1 || true
# NOTE: bootnode does NOT expose RPC. Do not open 8546/8545.
ufw reload >/dev/null 2>&1 || true

# ---------------------- 9. fail2ban jail ----------------------
log "Configuring fail2ban..."
cat > /etc/fail2ban/filter.d/gyds-bootnode.conf <<'EOF'
[Definition]
failregex = .*\[ban\] peer <HOST>.*
ignoreregex =
EOF

cat > /etc/fail2ban/jail.d/gyds-bootnode.conf <<EOF
[gyds-bootnode]
enabled  = true
port     = ${P2P_PORT}
filter   = gyds-bootnode
logpath  = ${LOG_DIR}/bootnode.log
maxretry = 5
findtime = 600
bantime  = 3600
EOF
systemctl restart fail2ban || warn "fail2ban restart failed (non-fatal)"

# ---------------------- 10. Start service ----------------------
log "Starting gyds-bootnode..."
systemctl restart gyds-bootnode.service
sleep 2
systemctl --no-pager --full status gyds-bootnode.service || true

# ---------------------- 11. Summary ----------------------
NODE_ID_SHORT="$(head -c 16 "${KEY_FILE}" 2>/dev/null || echo unknown)"
PUB_IP="$(curl -fsS https://api.ipify.org 2>/dev/null || echo "<server-ip>")"
ADVERT="${PUBLIC_ADDR:-${PUB_IP}:${P2P_PORT}}"

cat <<EOF

╔═══════════════════════════════════════════════════════════════╗
║   GYDSchain Bootnode Installed Successfully!                  ║
╚═══════════════════════════════════════════════════════════════╝

  Binary:       ${BIN_PATH}
  Service:      gyds-bootnode.service
  Config:       ${CONFIG_FILE}
  Data dir:     ${BOOTNODE_DIR}
  Logs:         ${LOG_DIR}/bootnode.log
  Node ID:      ${NODE_ID_SHORT}
  Chain ID:     ${CHAIN_ID}
  P2P port:     ${P2P_PORT} (tcp+udp)

  Share this bootstrap address with other operators:

      ${NODE_ID_SHORT}@${ADVERT}

  Useful commands:
      systemctl status gyds-bootnode
      journalctl -u gyds-bootnode -f
      tail -f ${LOG_DIR}/bootnode.log

EOF
