#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Universal Node Installer
#  Usage:  sudo bash install-node.sh [validator|fullnode|rpc|litenode|bootnode]
#  Builds REAL binaries from public/blockchain-go/ source.
#  Chain ID: 13370  |  Domain: netlifegy.com
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NODE_TYPE="${1:-fullnode}"
case "$NODE_TYPE" in
  validator|fullnode|rpc|litenode|bootnode) ;;
  *) echo "Usage: $0 [validator|fullnode|rpc|litenode|bootnode]"; exit 1 ;;
esac

INSTALL_DIR="/opt/gydschain"
DATA_DIR="/var/lib/gydschain"
LOG_DIR="/var/log/gydschain"
SERVICE_NAME="gydschain-${NODE_TYPE}"
GO_VERSION="${GO_VERSION:-1.22.5}"

CHAIN_ID="${CHAIN_ID:-13370}"
BLOCK_TIME="${BLOCK_TIME:-120}"
P2P_PORT="${P2P_PORT:-30303}"
RPC_PORT="${RPC_PORT:-8546}"

PRIMARY_RPC="https://rpc.netlifegy.com"
BACKUP_RPC_1="https://rpc2.netlifegy.com"
BACKUP_RPC_2="https://rpc3.netlifegy.com"
WS_ENDPOINT="wss://ws.netlifegy.com"

SRC_DIR="${SRC_DIR:-$(cd "$(dirname "$0")/../blockchain-go" 2>/dev/null && pwd || echo "")}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   GYDSchain Node Installer (${NODE_TYPE})                 "
echo "║   Chain ID: ${CHAIN_ID}  |  Block: ${BLOCK_TIME}s         "
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || { err "Run as root (sudo)."; exit 1; }
[[ -n "$SRC_DIR" && -d "$SRC_DIR" ]] || { err "Set SRC_DIR=/path/to/blockchain-go"; exit 1; }

# ─── 1. Deps ──────────────────────────────────────────────────────
log "[1/8] Installing apt packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq build-essential git curl wget jq openssl ufw fail2ban iptables logrotate ca-certificates

# ─── 2. Go ────────────────────────────────────────────────────────
log "[2/8] Installing Go ${GO_VERSION}..."
if ! command -v go >/dev/null || [[ "$(go version | awk '{print $3}')" != "go${GO_VERSION}" ]]; then
  cd /tmp
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O go.tgz
  rm -rf /usr/local/go && tar -C /usr/local -xzf go.tgz && rm go.tgz
  ln -sf /usr/local/go/bin/go    /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
fi

# ─── 3. Dirs ──────────────────────────────────────────────────────
log "[3/8] Creating directories..."
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR" "$INSTALL_DIR/keys"

# ─── 4. Build the right binary(ies) ────────────────────────────────
log "[4/8] Building from ${SRC_DIR}..."
BUILD_TMP="$(mktemp -d)"
cp -r "$SRC_DIR" "$BUILD_TMP/blockchain-go"
pushd "$BUILD_TMP/blockchain-go" >/dev/null
go mod download
case "$NODE_TYPE" in
  validator|fullnode|rpc) go build -ldflags="-s -w" -o "$INSTALL_DIR/gydsd"     ./cmd/fullnode ;;
  litenode)               go build -ldflags="-s -w" -o "$INSTALL_DIR/litenode"  ./cmd/litenode ;;
  bootnode)               go build -ldflags="-s -w" -o "$INSTALL_DIR/bootnode"  ./cmd/bootnode ;;
esac
popd >/dev/null
rm -rf "$BUILD_TMP"

# ─── 5. Firewall ──────────────────────────────────────────────────
log "[5/8] Configuring ufw..."
ufw --force reset >/dev/null 2>&1 || true
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow ssh >/dev/null
ufw limit ssh/tcp >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow ${P2P_PORT}/tcp comment 'GYDS P2P TCP' >/dev/null
ufw allow ${P2P_PORT}/udp comment 'GYDS P2P UDP' >/dev/null
case "$NODE_TYPE" in
  validator|fullnode|rpc) ufw allow ${RPC_PORT}/tcp comment 'GYDS RPC' >/dev/null ;;
  bootnode) ;; # no RPC for bootnodes
esac
ufw allow 51820/udp comment 'WireGuard' >/dev/null
ufw --force enable >/dev/null

# ─── 6. fail2ban ──────────────────────────────────────────────────
log "[6/8] Configuring fail2ban..."
cat > /etc/fail2ban/jail.d/gydschain.conf <<EOF
[sshd]
enabled = true
maxretry = 5
bantime = 3600
EOF
systemctl enable fail2ban >/dev/null 2>&1 && systemctl restart fail2ban >/dev/null 2>&1 || true

# ─── 7. Build exec command + systemd unit ─────────────────────────
log "[7/8] Installing systemd service: ${SERVICE_NAME}..."
KEY_FILE="$INSTALL_DIR/keys/${NODE_TYPE}.key"
[[ -f "$KEY_FILE" ]] || { openssl rand -hex 32 > "$KEY_FILE"; chmod 600 "$KEY_FILE"; }

case "$NODE_TYPE" in
  validator|fullnode)
    EXEC_CMD="$INSTALL_DIR/gydsd --founder --datadir=$DATA_DIR --rpcport=$RPC_PORT --p2pport=$P2P_PORT --maxpeers=50 --storage=100 --validator-key=$KEY_FILE --mining"
    ;;
  rpc)
    EXEC_CMD="$INSTALL_DIR/gydsd --founder --datadir=$DATA_DIR --rpcport=$RPC_PORT --p2pport=$P2P_PORT --maxpeers=100 --storage=50 --validator-key=$KEY_FILE --mining=false"
    ;;
  litenode)
    EXEC_CMD="$INSTALL_DIR/litenode --rpc=$PRIMARY_RPC --rpc-failover=$BACKUP_RPC_1,$BACKUP_RPC_2 --ws=$WS_ENDPOINT --datadir=$DATA_DIR --chain-id=$CHAIN_ID"
    ;;
  bootnode)
    EXEC_CMD="$INSTALL_DIR/bootnode --datadir=$DATA_DIR --p2pport=$P2P_PORT --maxpeers=100 --node-key=$KEY_FILE --chain-id=$CHAIN_ID"
    ;;
esac

cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=GYDSchain ${NODE_TYPE} node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${EXEC_CMD}
Restart=always
RestartSec=10
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/${NODE_TYPE}.log
StandardError=append:${LOG_DIR}/${NODE_TYPE}-error.log
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${DATA_DIR} ${LOG_DIR} ${INSTALL_DIR}

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/logrotate.d/gydschain-${NODE_TYPE} <<EOF
${LOG_DIR}/${NODE_TYPE}*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
}
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME} >/dev/null 2>&1
systemctl restart ${SERVICE_NAME} || true

log "[8/8] Done."

cat <<EOF

╔═══════════════════════════════════════════════════════════╗
║  ✅ GYDSchain ${NODE_TYPE} installed                       
╚═══════════════════════════════════════════════════════════╝
  Service:  ${SERVICE_NAME}
  Logs:     ${LOG_DIR}/${NODE_TYPE}.log
  Data:     ${DATA_DIR}
  Manage:   systemctl status ${SERVICE_NAME}
            journalctl -u ${SERVICE_NAME} -f
EOF
