#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Genesis Node Installer — FOUNDER ONLY
#  Source:   local node-fixes/genesis bundle
#  Sets up the genesis/bootstrap node that starts the GYDSchain network.
#  Target OS: Ubuntu 20.04/22.04/24.04 | Debian 11/12  |  Chain ID 198282
#  Run:  sudo bash install-genesis.sh
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/node-network.sh"
PROJECT_ROOT="${PROJECT_ROOT:-}"
if [[ -z "$PROJECT_ROOT" ]]; then
  if [[ -f "$SCRIPT_DIR/../../node-fixes/genesis/go.mod" ]]; then
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  else
    PROJECT_ROOT="/var/www/gydschain"
  fi
fi

# ── Load shared config (written by deploy-dashboard.sh) ───────────────────────
GYDS_CONF="${GYDS_CONF:-/var/www/gydschain/gyds-config.env}"
if [[ -f "$GYDS_CONF" ]]; then
  # shellcheck disable=SC1090
  source "$GYDS_CONF"
  echo "[config] Loaded shared config from $GYDS_CONF"
fi

GYDS_VERSION="1.0.0"
BINARY="gyds-genesis"
APP_USER="${APP_USER:-gyds}"
APP_DIR="${APP_DIR:-/opt/gyds-genesis}"
DATA_DIR="${DATA_DIR:-/var/lib/gyds-genesis}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-${DATA_DIR}/logs}"
GO_VERSION="${GO_VERSION:-1.25.0}"

GENESIS_PORT="${GENESIS_PORT:-30300}"
RPC_PORT="${GYDS_RPC_PORT:-8544}"
CHAIN_ID="${GYDS_CHAIN_ID:-198282}"
STORAGE_SIZE="${STORAGE_SIZE:-500}"
RPC_DOMAIN="${GYDS_RPC_DOMAIN:-${DOMAIN:-}}"

NODE_SOURCE_DIR="${NODE_SOURCE_DIR:-${PROJECT_ROOT}/node-fixes/genesis}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain GENESIS NODE Installer v${GYDS_VERSION} — FOUNDER       ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Block time: 5s  |  netlifegy.com  ║"
echo "║   Source: local node-fixes/genesis                         ║"
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
apt-get install -y --no-install-recommends build-essential git curl wget jq ufw fail2ban nginx certbot python3-certbot-nginx ca-certificates openssl

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

# ─── 3. Validate local source ─────────────────────────────────────────────────
log "[3/7] Checking local genesis source..."
[[ -f "$NODE_SOURCE_DIR/go.mod" ]] || die "Local source not found at $NODE_SOURCE_DIR. Set PROJECT_ROOT to the checked-out project directory."
grep -Fqx "module github.com/gydschain/genesis" "$NODE_SOURCE_DIR/go.mod" || \
  die "Unexpected Go module in $NODE_SOURCE_DIR/go.mod; refusing to build another node source."

log "[4/7] Building ${BINARY}..."
( cd "$NODE_SOURCE_DIR" && go mod download && \
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
node_network_resolve_p2p_host || { err "Could not determine a reachable P2P address."; exit 1; }
node_network_allow_p2p_tcp "$GENESIS_PORT"
if [[ -n "$RPC_DOMAIN" ]]; then
  [[ "$RPC_DOMAIN" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || { err "GYDS_RPC_DOMAIN must be a hostname without a scheme or path."; exit 1; }
  node_network_allow_tcp_port 80 "GYDS RPC HTTP proxy"
  node_network_allow_tcp_port 443 "GYDS RPC HTTPS proxy"
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  cat > /etc/nginx/sites-available/gyds-genesis <<EOF
server {
    listen 80;
    server_name ${RPC_DOMAIN};

    location /ws {
        proxy_pass http://127.0.0.1:${RPC_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400s;
    }
    location /health {
        proxy_pass http://127.0.0.1:${RPC_PORT}/health;
        access_log off;
    }
    location / {
        proxy_pass http://127.0.0.1:${RPC_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/gyds-genesis /etc/nginx/sites-enabled/gyds-genesis
  nginx -t && systemctl enable nginx && systemctl restart nginx
  certbot --nginx -d "$RPC_DOMAIN" --non-interactive --agree-tos -m "admin@${RPC_DOMAIN}" 2>/dev/null \
    || warn "TLS setup failed; check DNS for ${RPC_DOMAIN}, then rerun Certbot."
fi

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
Environment=GYDS_NODE_MODE=genesis
Environment=GYDS_RPC_PORT=${RPC_PORT}
Environment=GYDS_RPC_HOST=127.0.0.1
Environment=GYDS_P2P_PORT=${GENESIS_PORT}
Environment=GYDS_P2P_ADVERTISE_HOST=${GYDS_P2P_ADVERTISE_HOST}
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
for _ in 1 2 3; do
  curl -sf --max-time 4 "http://localhost:${RPC_PORT}/health" &>/dev/null && NODE_OK=true && break
  sleep 4
done

node_network_report_tcp_listener "$GENESIS_PORT"
SERVER_IP="${GYDS_P2P_ADVERTISE_HOST}"

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
if [[ -n "$RPC_DOMAIN" ]]; then
  echo "  RPC          : https://${RPC_DOMAIN}"
  echo "  WS           : wss://${RPC_DOMAIN}/ws"
else
  echo "  RPC/WS       : localhost:${RPC_PORT} (local only; set GYDS_RPC_DOMAIN for HTTPS access)"
fi
echo "  P2P          : tcp://${SERVER_IP}:${GENESIS_PORT}"
node_network_report_p2p "$GENESIS_PORT"
echo "  Chain ID     : ${CHAIN_ID}  |  Block time: 5s"
echo ""
echo "  Set this as GYDS_BOOTSTRAP_NODES for all other nodes:"
echo "    ${SERVER_IP}:${GENESIS_PORT}"
echo ""
echo "  systemctl status gyds-genesis"
echo "  journalctl -u gyds-genesis -f"
echo ""
