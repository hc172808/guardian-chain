#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Boost Node Installer
#  Clones from: https://github.com/hc172808/boostnode.git
#  A high-performance relay/boost node for GydsChain.
#  Target OS: Ubuntu 22.04 LTS  |  Chain ID 13370  |  Domain: netlifegy.com
#  Run:  sudo bash install-boostnode.sh
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GYDS_VERSION="2.1.0"
GYDS_USER="${GYDS_USER:-gydschain}"
GYDS_HOME="${GYDS_HOME:-/var/lib/gydschain-boost}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-/var/log/gydschain}"
GO_VERSION="${GO_VERSION:-1.22.5}"

BOOST_PORT="${BOOST_PORT:-8547}"
P2P_PORT="${P2P_PORT:-30304}"
STORAGE_SIZE="${STORAGE_SIZE:-50}"
CHAIN_ID="${CHAIN_ID:-13370}"
BLOCK_TIME="${BLOCK_TIME:-120}"

RPC_PRIMARY="https://rpc.netlifegy.com"
RPC_BACKUP_1="https://rpc2.netlifegy.com"
WS_ENDPOINT="wss://ws.netlifegy.com"

REPO_URL="${REPO_URL:-https://github.com/hc172808/boostnode.git}"
REPO_DIR="${REPO_DIR:-/opt/gyds-boostnode}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain BOOST NODE Installer v${GYDS_VERSION}                             ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Block time: ${BLOCK_TIME}s  |  netlifegy.com        ║"
echo "║   Repo: github.com/hc172808/boostnode                               ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || { err "Run as root (sudo)."; exit 1; }

# ─── 0. Clone / update repo ──────────────────────────────────────────────────
log "[0/7] Fetching boostnode source from ${REPO_URL}..."
if [[ -d "$REPO_DIR/.git" ]]; then
    git -C "$REPO_DIR" pull --ff-only
else
    git clone --depth=1 "$REPO_URL" "$REPO_DIR"
fi

[[ -f "$REPO_DIR/go.mod" ]] || { err "go.mod not found in ${REPO_DIR}"; exit 1; }

# ─── 1. System packages ──────────────────────────────────────────────────────
log "[1/7] Installing apt packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq build-essential git curl wget jq ufw fail2ban openssl ca-certificates

# ─── 2. Go ───────────────────────────────────────────────────────────────────
log "[2/7] Installing Go ${GO_VERSION}..."
if ! command -v go >/dev/null || [[ "$(go version | awk '{print $3}')" != "go${GO_VERSION}" ]]; then
    cd /tmp
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O go.tgz
    rm -rf /usr/local/go && tar -C /usr/local -xzf go.tgz && rm go.tgz
    ln -sf /usr/local/go/bin/go /usr/local/bin/go
fi
log "    $(go version)"

# ─── 3. User & dirs ──────────────────────────────────────────────────────────
log "[3/7] Creating ${GYDS_USER} user..."
id -u "$GYDS_USER" >/dev/null 2>&1 || useradd --system -m -d "$GYDS_HOME" -s /bin/bash "$GYDS_USER"
mkdir -p "$GYDS_HOME"/{data,logs,config} "$LOG_DIR"
chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME" "$LOG_DIR"

# ─── 4. Build binary ─────────────────────────────────────────────────────────
log "[4/7] Building gyds-boostnode..."
BUILD_TMP="$(mktemp -d)"
cp -r "$REPO_DIR" "$BUILD_TMP/boostnode-src"
chown -R "$GYDS_USER:$GYDS_USER" "$BUILD_TMP"

CMD_PATH="."
[[ -d "$BUILD_TMP/boostnode-src/cmd/boostnode" ]] && CMD_PATH="./cmd/boostnode"

sudo -u "$GYDS_USER" -H env HOME="$GYDS_HOME" PATH="$PATH" \
    bash -c "cd '$BUILD_TMP/boostnode-src' && go mod download && go build -ldflags '-s -w -X main.Version=${GYDS_VERSION}' -o '$BUILD_TMP/gyds-boostnode' ${CMD_PATH}"
install -m 0755 -o root -g root "$BUILD_TMP/gyds-boostnode" "$GYDS_BIN/gyds-boostnode"
rm -rf "$BUILD_TMP"
log "    Installed: $GYDS_BIN/gyds-boostnode"

# ─── 5. Firewall ─────────────────────────────────────────────────────────────
log "[5/7] Configuring firewall..."
ufw allow ssh >/dev/null
ufw allow "$P2P_PORT/tcp" comment 'GYDS Boost P2P' >/dev/null
ufw allow "$P2P_PORT/udp" comment 'GYDS Boost P2P' >/dev/null
ufw allow "$BOOST_PORT/tcp" comment 'GYDS Boost API' >/dev/null
ufw --force enable >/dev/null

# ─── 6. systemd unit ─────────────────────────────────────────────────────────
log "[6/7] Installing systemd service..."
cat > /etc/systemd/system/gyds-boostnode.service <<EOF
[Unit]
Description=GYDSchain Boost Node v${GYDS_VERSION}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${GYDS_USER}
Group=${GYDS_USER}
WorkingDirectory=${GYDS_HOME}
ExecStart=${GYDS_BIN}/gyds-boostnode \
    --datadir=${GYDS_HOME}/data \
    --port=${BOOST_PORT} \
    --p2pport=${P2P_PORT} \
    --chain-id=${CHAIN_ID} \
    --rpc=${RPC_PRIMARY} \
    --ws=${WS_ENDPOINT}
Restart=always
RestartSec=10
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/boostnode.log
StandardError=append:${LOG_DIR}/boostnode-error.log
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
ReadWritePaths=${GYDS_HOME} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable gyds-boostnode >/dev/null 2>&1

# ─── 7. Config file ──────────────────────────────────────────────────────────
log "[7/7] Writing node config..."
cat > "$GYDS_HOME/config/node.toml" <<EOF
[node]
type     = "boostnode"
chain_id = ${CHAIN_ID}
version  = "${GYDS_VERSION}"

[network]
p2p_port  = ${P2P_PORT}
api_port  = ${BOOST_PORT}
max_peers = 100

[rpc]
primary = "${RPC_PRIMARY}"
backup  = ["${RPC_BACKUP_1}"]

[websocket]
endpoint = "${WS_ENDPOINT}"

[storage]
data_dir    = "${GYDS_HOME}/data"
max_size_gb = ${STORAGE_SIZE}
EOF
chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME"
systemctl restart gyds-boostnode || true

LOCAL_IP="$(hostname -I | awk '{print $1}')"
cat <<EOF

╔═══════════════════════════════════════════════════════════════════════╗
║   ✅ GYDSchain Boost Node installed                                   ║
╚═══════════════════════════════════════════════════════════════════════╝
  Repo:      ${REPO_URL}
  Binary:    ${GYDS_BIN}/gyds-boostnode
  Service:   gyds-boostnode.service
  Data dir:  ${GYDS_HOME}/data
  Config:    ${GYDS_HOME}/config/node.toml
  Logs:      ${LOG_DIR}/boostnode.log

  Local IP:  ${LOCAL_IP}
  API:       http://${LOCAL_IP}:${BOOST_PORT}
  P2P:       ${LOCAL_IP}:${P2P_PORT}
  Chain ID:  ${CHAIN_ID}

  Manage:
    systemctl status gyds-boostnode
    journalctl -u gyds-boostnode -f
EOF
