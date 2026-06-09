#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Full Node Installer — FOUNDER ONLY
#  Clones from: https://github.com/hc172808/fullnode.git
#  Target OS: Ubuntu 22.04 LTS  |  Chain ID 13370  |  Domain: netlifegy.com
#  Run:  sudo bash install-fullnode.sh
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GYDS_VERSION="2.1.0"
GYDS_USER="${GYDS_USER:-gydschain}"
GYDS_HOME="${GYDS_HOME:-/var/lib/gydschain}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-/var/log/gydschain}"
GO_VERSION="${GO_VERSION:-1.22.5}"

RPC_PORT="${RPC_PORT:-8546}"
P2P_PORT="${P2P_PORT:-30303}"
STORAGE_SIZE="${STORAGE_SIZE:-100}"
CHAIN_ID="${CHAIN_ID:-13370}"
BLOCK_TIME="${BLOCK_TIME:-120}"
ENABLE_MINING="${ENABLE_MINING:-true}"

RPC_PRIMARY="https://rpc.netlifegy.com"
RPC_BACKUP_1="https://rpc2.netlifegy.com"
RPC_BACKUP_2="https://rpc3.netlifegy.com"
WS_ENDPOINT="wss://ws.netlifegy.com"

REPO_URL="${REPO_URL:-https://github.com/hc172808/fullnode.git}"
REPO_DIR="${REPO_DIR:-/opt/gyds-fullnode}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain FULL NODE Installer v${GYDS_VERSION} — FOUNDER EDITION              ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Block time: ${BLOCK_TIME}s  |  netlifegy.com        ║"
echo "║   Repo: github.com/hc172808/fullnode                                 ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || { err "Run as root (sudo)."; exit 1; }

# ─── 0. Clone / update repo ──────────────────────────────────────────────────
log "[0/8] Fetching fullnode source from ${REPO_URL}..."
if [[ -d "$REPO_DIR/.git" ]]; then
    log "  Repo exists at ${REPO_DIR} — pulling latest..."
    git -C "$REPO_DIR" pull --ff-only
else
    git clone --depth=1 "$REPO_URL" "$REPO_DIR"
fi

# Accept both flat-repo layout (go files at root) and nested layout
if [[ -f "$REPO_DIR/go.mod" ]]; then
    SRC_DIR="$REPO_DIR"
elif [[ -d "$REPO_DIR/cmd/fullnode" ]]; then
    SRC_DIR="$REPO_DIR"
else
    err "Cannot find go.mod or cmd/fullnode in ${REPO_DIR}."
    err "Check repo layout: https://github.com/hc172808/fullnode"
    exit 1
fi

# ─── 1. System packages ──────────────────────────────────────────────────────
log "[1/8] Installing apt prerequisites..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq build-essential git curl wget jq ufw fail2ban unzip openssl ca-certificates

# ─── 2. Go ───────────────────────────────────────────────────────────────────
log "[2/8] Installing Go ${GO_VERSION}..."
if ! command -v go >/dev/null || [[ "$(go version | awk '{print $3}')" != "go${GO_VERSION}" ]]; then
    cd /tmp
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O go.tgz
    rm -rf /usr/local/go && tar -C /usr/local -xzf go.tgz && rm go.tgz
    ln -sf /usr/local/go/bin/go    /usr/local/bin/go
    ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
fi
log "    $(go version)"

# ─── 3. User & dirs ──────────────────────────────────────────────────────────
log "[3/8] Creating ${GYDS_USER} user and directories..."
id -u "$GYDS_USER" >/dev/null 2>&1 || useradd --system -m -d "$GYDS_HOME" -s /bin/bash "$GYDS_USER"
mkdir -p "$GYDS_HOME"/{data,logs,keys,config} "$LOG_DIR"
chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME" "$LOG_DIR"

# ─── 4. Build binary ─────────────────────────────────────────────────────────
log "[4/8] Building gyds-fullnode from ${SRC_DIR}..."
BUILD_TMP="$(mktemp -d)"
cp -r "$SRC_DIR" "$BUILD_TMP/fullnode-src"
chown -R "$GYDS_USER:$GYDS_USER" "$BUILD_TMP"

BINARY_NAME="gyds-fullnode"
if [[ -d "$BUILD_TMP/fullnode-src/cmd/fullnode" ]]; then
    CMD_PATH="./cmd/fullnode"
else
    CMD_PATH="."
fi

sudo -u "$GYDS_USER" -H env HOME="$GYDS_HOME" PATH="$PATH" \
    bash -c "cd '$BUILD_TMP/fullnode-src' && go mod download && go build -ldflags '-s -w -X main.Version=${GYDS_VERSION}' -o '$BUILD_TMP/${BINARY_NAME}' ${CMD_PATH}"
install -m 0755 -o root -g root "$BUILD_TMP/$BINARY_NAME" "$GYDS_BIN/$BINARY_NAME"
rm -rf "$BUILD_TMP"
log "    Installed: $GYDS_BIN/$BINARY_NAME ($(du -h "$GYDS_BIN/$BINARY_NAME" | cut -f1))"

# ─── 5. Validator key ────────────────────────────────────────────────────────
log "[5/8] Generating validator key..."
KEY_FILE="$GYDS_HOME/keys/validator.key"
if [[ ! -f "$KEY_FILE" ]]; then
    openssl rand -hex 32 > "$KEY_FILE"
    chown "$GYDS_USER:$GYDS_USER" "$KEY_FILE"
    chmod 600 "$KEY_FILE"
fi

# ─── 6. Firewall + fail2ban ──────────────────────────────────────────────────
log "[6/8] Configuring ufw + fail2ban..."
ufw --force reset >/dev/null 2>&1 || true
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow ssh >/dev/null
ufw limit ssh/tcp >/dev/null
ufw allow 80/tcp  comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow "$P2P_PORT/tcp" comment 'GYDS P2P TCP' >/dev/null
ufw allow "$P2P_PORT/udp" comment 'GYDS P2P UDP' >/dev/null
ufw allow "$RPC_PORT/tcp"  comment 'GYDS RPC' >/dev/null
ufw allow 51820/udp comment 'WireGuard' >/dev/null
ufw --force enable >/dev/null

cat > /etc/fail2ban/jail.d/gydschain.conf <<EOF
[sshd]
enabled  = true
maxretry = 5
bantime  = 3600

[gyds-rpc]
enabled  = true
port     = ${RPC_PORT}
maxretry = 20
bantime  = 1800
findtime = 300
EOF
systemctl enable fail2ban >/dev/null 2>&1 && systemctl restart fail2ban >/dev/null 2>&1 || true

# ─── 7. systemd unit ─────────────────────────────────────────────────────────
log "[7/8] Installing systemd service..."
MINING_FLAG=""
[[ "$ENABLE_MINING" == "true" ]] && MINING_FLAG="--mining"

cat > /etc/systemd/system/gyds-fullnode.service <<EOF
[Unit]
Description=GYDSchain Full Node v${GYDS_VERSION}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${GYDS_USER}
Group=${GYDS_USER}
WorkingDirectory=${GYDS_HOME}
ExecStart=${GYDS_BIN}/gyds-fullnode --founder \
    --datadir=${GYDS_HOME}/data \
    --rpcport=${RPC_PORT} \
    --p2pport=${P2P_PORT} \
    --storage=${STORAGE_SIZE} \
    --validator-key=${KEY_FILE} \
    ${MINING_FLAG}
Restart=always
RestartSec=10
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/fullnode.log
StandardError=append:${LOG_DIR}/fullnode-error.log
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${GYDS_HOME} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gyds-fullnode >/dev/null 2>&1

# ─── 8. Config file ──────────────────────────────────────────────────────────
log "[8/8] Writing node config..."
cat > "$GYDS_HOME/config/node.toml" <<EOF
[node]
type         = "fullnode"
founder_mode = true
chain_id     = ${CHAIN_ID}
version      = "${GYDS_VERSION}"

[network]
p2p_port  = ${P2P_PORT}
rpc_port  = ${RPC_PORT}
max_peers = 50

[consensus]
block_time          = ${BLOCK_TIME}
min_validators      = 4
block_finality      = 2
slashing_enabled    = true

[mining]
enabled              = ${ENABLE_MINING}
target_share_time    = ${BLOCK_TIME}
anti_bot             = true
difficulty_adjustment = true

[rpc]
primary = "${RPC_PRIMARY}"
backup  = ["${RPC_BACKUP_1}", "${RPC_BACKUP_2}"]

[websocket]
endpoint = "${WS_ENDPOINT}"

[storage]
data_dir    = "${GYDS_HOME}/data"
max_size_gb = ${STORAGE_SIZE}
EOF
chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME"

systemctl restart gyds-fullnode || true
sleep 2

LOCAL_IP="$(hostname -I | awk '{print $1}')"
cat <<EOF

╔═══════════════════════════════════════════════════════════════════════╗
║   ✅ GYDSchain Full Node installed successfully                       ║
╚═══════════════════════════════════════════════════════════════════════╝
  Binary:        ${GYDS_BIN}/gyds-fullnode
  Service:       gyds-fullnode.service
  Repo:          ${REPO_URL}
  Data dir:      ${GYDS_HOME}/data
  Validator key: ${KEY_FILE}    ⚠️  BACK THIS UP
  Config:        ${GYDS_HOME}/config/node.toml
  Logs:          ${LOG_DIR}/fullnode.log

  Local IP:   ${LOCAL_IP}
  RPC:        http://${LOCAL_IP}:${RPC_PORT}
  P2P:        ${LOCAL_IP}:${P2P_PORT}
  Chain ID:   ${CHAIN_ID}    Block time: ${BLOCK_TIME}s

  Manage:
    systemctl status gyds-fullnode
    journalctl -u gyds-fullnode -f
    tail -f ${LOG_DIR}/fullnode.log
EOF
