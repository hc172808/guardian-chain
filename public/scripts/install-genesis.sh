#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Genesis Node Installer — FOUNDER ONLY
#  Repo:     https://github.com/hc172808/genesis.git
#  Sets up the genesis/bootstrap node that starts the GYDSchain network.
#  Target OS: Ubuntu 20.04/22.04/24.04 | Debian 11/12  |  Chain ID 198282
#  Run:  sudo bash install-genesis.sh
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GYDS_VERSION="1.0.0"
BINARY="gyds-genesis"
APP_USER="${APP_USER:-gyds}"
APP_DIR="${APP_DIR:-/opt/gyds-genesis}"
DATA_DIR="${DATA_DIR:-/var/lib/gyds-genesis}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-${DATA_DIR}/logs}"
GO_VERSION="${GO_VERSION:-1.21.13}"

GENESIS_PORT="${GENESIS_PORT:-30300}"
RPC_PORT="${GYDS_RPC_PORT:-8544}"
CHAIN_ID="${GYDS_CHAIN_ID:-198282}"
STORAGE_SIZE="${STORAGE_SIZE:-500}"

REPO_URL="https://github.com/hc172808/genesis.git"
REPO_DIR="$APP_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain GENESIS NODE Installer v${GYDS_VERSION} — FOUNDER       ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Block time: 5s  |  netlifegy.com  ║"
echo "║   Repo: github.com/hc172808/genesis                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || { err "Run as root (sudo)."; exit 1; }

warn "This is the GENESIS node — it creates the blockchain from block 0."
warn "Only run this ONCE on your primary genesis server."
read -rp "Proceed? (yes/no) " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 0; }

ARCH=$(uname -m)
case "$ARCH" in
  x86_64)        GO_ARCH="amd64" ;;
  aarch64|arm64) GO_ARCH="arm64" ;;
  *) die "Unsupported arch: $ARCH" ;;
esac

# ─── 1. System packages ──────────────────────────────────────────────────────
log "[1/7] Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends build-essential git curl wget jq ufw fail2ban ca-certificates openssl

# ─── 2. Go ───────────────────────────────────────────────────────────────────
log "[2/7] Installing Go ${GO_VERSION}..."
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
log "[3/7] Fetching source from ${REPO_URL}..."
if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" fetch origin main && git -C "$REPO_DIR" reset --hard origin/main
else
  git clone --depth=1 "$REPO_URL" "$REPO_DIR"
fi
[[ -f "$REPO_DIR/go.mod" ]] || die "go.mod not found in $REPO_DIR"

log "[4/7] Building ${BINARY}..."
( cd "$REPO_DIR" && go mod download && \
  go build -ldflags="-s -w -X main.version=${GYDS_VERSION}" -o "/tmp/${BINARY}" . )
install -m 0755 -o root -g root "/tmp/${BINARY}" "${GYDS_BIN}/${BINARY}"
rm -f "/tmp/${BINARY}"
log "    Installed: ${GYDS_BIN}/${BINARY}"

# ─── 4. User & dirs ──────────────────────────────────────────────────────────
log "[5/7] Creating user and directories..."
id "$APP_USER" &>/dev/null || \
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER" 2>/dev/null || \
  adduser --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "${DATA_DIR}"/{state.db,logs,keystore,genesis} "${LOG_DIR}"
chmod 700 "${DATA_DIR}/keystore"
chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}" "${LOG_DIR}"

# ─── 5. Founder key + genesis config ─────────────────────────────────────────
log "[6/7] Generating founder key and genesis config..."
FOUNDER_KEY="${DATA_DIR}/keystore/founder.key"
if [[ ! -f "$FOUNDER_KEY" ]]; then
  openssl rand -hex 32 > "$FOUNDER_KEY"
  chmod 600 "$FOUNDER_KEY"
  chown "${APP_USER}:${APP_USER}" "$FOUNDER_KEY"
  warn "⚠️  FOUNDER KEY CREATED — BACK IT UP IMMEDIATELY: $FOUNDER_KEY"
fi

GENESIS_ADDR="0x$(openssl dgst -sha256 < "$FOUNDER_KEY" | awk '{print $2}' | cut -c1-40)"
GENESIS_FILE="${DATA_DIR}/genesis/genesis.json"

cat > "$GENESIS_FILE" <<EOF
{
  "chainId":      ${CHAIN_ID},
  "networkName":  "GYDS Chain",
  "timestamp":    "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "blockTime":    5,
  "gasLimit":     30000000,
  "extraData":    "0x4759445320436861696e202d20476f7920446563656e7472616c697a656420536f6c7574696f6e73",
  "validators":   ["${GENESIS_ADDR}"],
  "alloc": {
    "${GENESIS_ADDR}": { "balance": "1000000000000000000000000000" }
  }
}
EOF
chown "${APP_USER}:${APP_USER}" "$GENESIS_FILE"

# ─── 6. Firewall ─────────────────────────────────────────────────────────────
ufw default deny incoming >/dev/null 2>&1 || true
ufw default allow outgoing >/dev/null 2>&1 || true
ufw limit 22/tcp              comment "SSH"           >/dev/null 2>&1 || true
ufw allow "${RPC_PORT}/tcp"   comment "GYDS RPC"      >/dev/null 2>&1 || true
ufw allow "${GENESIS_PORT}/tcp" comment "GYDS P2P"   >/dev/null 2>&1 || true
ufw allow "${GENESIS_PORT}/udp" comment "GYDS P2P"   >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

# ─── 7. systemd service ──────────────────────────────────────────────────────
log "[7/7] Installing systemd service..."
cat > /etc/systemd/system/gyds-genesis.service <<EOF
[Unit]
Description=GYDSchain Genesis Node v${GYDS_VERSION}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${DATA_DIR}
Environment=GYDS_CHAIN_ID=${CHAIN_ID}
Environment=GYDS_NODE_MODE=full
Environment=GYDS_RPC_PORT=${RPC_PORT}
Environment=GYDS_RPC_HOST=0.0.0.0
Environment=GYDS_P2P_PORT=${GENESIS_PORT}
Environment=GYDS_DATA_DIR=${DATA_DIR}
Environment=GYDS_LOG_LEVEL=info
Environment=GYDS_LOG_FORMAT=json
Environment=GYDS_HTTP_API=eth,net,web3,txpool,admin,miner,personal,debug
Environment=GYDS_WS_API=eth,net,web3,txpool,admin
ExecStart=${GYDS_BIN}/${BINARY} start
ExecReload=/bin/kill -HUP \$MAINPID
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/genesis.log
StandardError=append:${LOG_DIR}/genesis-error.log
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${DATA_DIR} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gyds-genesis
systemctl restart gyds-genesis
sleep 3

NODE_OK=false
for i in 1 2 3; do
  curl -sf --max-time 4 "http://localhost:${RPC_PORT}/health" &>/dev/null && NODE_OK=true && break
  sleep 4
done

SERVER_IP=$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         GYDSchain GENESIS NODE — DEPLOYED                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
$NODE_OK && echo "  Status       : ✅ RUNNING" || echo "  Status       : ⚠️  NOT RESPONDING — check logs"
echo ""
echo "  Binary       : ${GYDS_BIN}/${BINARY}"
echo "  Service      : gyds-genesis.service"
echo "  Data         : ${DATA_DIR}"
echo "  Logs         : ${LOG_DIR}/genesis.log"
echo "  Founder key  : ${FOUNDER_KEY}  ⚠️  CRITICAL — BACK THIS UP"
echo "  Genesis JSON : ${GENESIS_FILE}"
echo "  Founder addr : ${GENESIS_ADDR}"
echo ""
echo "  RPC          : http://${SERVER_IP}:${RPC_PORT}"
echo "  P2P          : tcp://${SERVER_IP}:${GENESIS_PORT}"
echo "  Chain ID     : ${CHAIN_ID}  |  Block time: 5s"
echo ""
echo "  Set this as GYDS_BOOTSTRAP_NODES for all other nodes:"
echo "    ${SERVER_IP}:${GENESIS_PORT}"
echo ""
echo "  systemctl status gyds-genesis"
echo "  journalctl -u gyds-genesis -f"
echo ""
