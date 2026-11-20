#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  GYDSchain RPC Node Installer
#  Source:   local node-fixes/rpcnode bundle
#  OS:       Ubuntu 20.04/22.04/24.04 | Debian 11/12 | CentOS/RHEL/AlmaLinux
#  Chain IDs: 198282 (mainnet), 198281 (testnet)  |  Domain: netlifegy.com
#  Run:      sudo bash install-rpcnode.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Load shared config (written by deploy-dashboard.sh — all values skippable) ─
GYDS_CONF="${GYDS_CONF:-/var/www/gydschain/gyds-config.env}"
# shellcheck disable=SC1090
[[ -f "$GYDS_CONF" ]] && { source "$GYDS_CONF"; echo "[config] Loaded shared config from $GYDS_CONF"; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/node-network.sh"
PROJECT_ROOT="${PROJECT_ROOT:-}"
if [[ -z "$PROJECT_ROOT" ]]; then
  if [[ -f "$SCRIPT_DIR/../../node-fixes/rpcnode/go.mod" ]]; then
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  else
    PROJECT_ROOT="/var/www/gydschain"
  fi
fi

# ── Config ────────────────────────────────────────────────────────────────────
GYDS_VERSION="1.0.0"
BINARY="gyds-rpcnode"
APP_USER="${APP_USER:-gyds}"
APP_DIR="${APP_DIR:-/opt/gyds-rpcnode}"
DATA_DIR="${DATA_DIR:-/var/lib/gyds-rpcnode}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-${DATA_DIR}/logs}"
GO_VERSION="${GO_VERSION:-1.25.0}"

CHAIN_ID="${GYDS_CHAIN_ID:-${CHAIN_ID:-198282}}"
CHAIN_ID="${CHAIN_ID//$'\r'/}"
CHAIN_ID="${CHAIN_ID//[[:space:]]/}"
RPC_PORT="${GYDS_RPC_PORT:-8545}"
WS_PORT="${GYDS_WS_PORT:-8546}"
P2P_PORT="${GYDS_P2P_PORT:-30305}"   # different P2P port for RPC nodes
LOG_LEVEL="${GYDS_LOG_LEVEL:-info}"
RATE_LIMIT="${RATE_LIMIT:-100}"
BOOTSTRAP="${GYDS_BOOTSTRAP_NODES:-}"
DOMAIN="${DOMAIN:-rpc.netlifegy.com}"

NODE_SOURCE_DIR="${NODE_SOURCE_DIR:-${PROJECT_ROOT}/node-fixes/rpcnode}"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

case "${CHAIN_ID,,}" in
  mainnet) CHAIN_ID="198282"; NETWORK="mainnet" ;;
  testnet) CHAIN_ID="198281"; NETWORK="testnet" ;;
  198282) NETWORK="mainnet" ;;
  198281) NETWORK="testnet" ;;
  *) die "Unrecognized chain ID '${CHAIN_ID}'. The bundled RPC node supports GYDS mainnet (198282) and testnet (198281)." ;;
esac

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain RPC NODE Installer v${GYDS_VERSION}                    ║"
echo "║   Chain: ${NETWORK} (${CHAIN_ID})  |  Domain: ${DOMAIN}   ║"
echo "║   Source: local node-fixes/rpcnode                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0"

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rpc-port)        RPC_PORT="$2";   shift 2 ;;
    --ws-port)         WS_PORT="$2";    shift 2 ;;
    --p2p-port)        P2P_PORT="$2";   shift 2 ;;
    --domain)          DOMAIN="$2";     shift 2 ;;
    --rate-limit)      RATE_LIMIT="$2"; shift 2 ;;
    --data-dir)        DATA_DIR="$2";   shift 2 ;;
    --log-level)       LOG_LEVEL="$2";  shift 2 ;;
    --bootstrap-nodes) BOOTSTRAP="$2";  shift 2 ;;
    *) warn "Unknown flag: $1"; shift ;;
  esac
done

# ── OS detection ──────────────────────────────────────────────────────────────
. /etc/os-release 2>/dev/null || die "Cannot read /etc/os-release"
OS_ID="${ID:-unknown}"
OS_LIKE="${ID_LIKE:-}"
is_debian() { case "$OS_ID" in ubuntu|debian) return 0;; esac; [[ "$OS_LIKE" == *debian* || "$OS_LIKE" == *ubuntu* ]] && return 0; return 1; }
is_rhel()   { case "$OS_ID" in rhel|centos|fedora|almalinux|rocky|ol) return 0;; esac; [[ "$OS_LIKE" == *rhel* || "$OS_LIKE" == *centos* ]] && return 0; return 1; }
is_debian || is_rhel || die "Unsupported OS: $OS_ID"

ARCH=$(uname -m)
case "$ARCH" in
  x86_64)        GO_ARCH="amd64" ;;
  aarch64|arm64) GO_ARCH="arm64" ;;
  *) die "Unsupported arch: $ARCH" ;;
esac

# ── System packages ───────────────────────────────────────────────────────────
log "[1/7] Installing system packages..."
if is_debian; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    build-essential git curl wget jq ufw fail2ban nginx \
    certbot python3-certbot-nginx ca-certificates openssl net-tools
elif is_rhel; then
  rpm -q epel-release &>/dev/null || dnf install -y epel-release 2>/dev/null || true
  dnf install -y gcc git curl wget jq firewalld fail2ban nginx certbot python3-certbot-nginx \
    ca-certificates openssl net-tools 2>/dev/null || \
  yum install -y gcc git curl wget jq firewalld fail2ban nginx ca-certificates openssl net-tools
fi

# ── Go ────────────────────────────────────────────────────────────────────────
log "[2/7] Installing Go ${GO_VERSION}..."
export PATH="$PATH:/usr/local/go/bin"
CURRENT_GO=$(go version 2>/dev/null | awk '{print $3}' | sed 's/go//' || echo "none")
if [[ "$CURRENT_GO" != "$GO_VERSION" ]]; then
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" -O /tmp/go.tar.gz || die "Failed to download Go"
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  rm -f /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
  ln -sf /usr/local/go/bin/go    /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
fi
log "    $(go version)"

# ── Validate bundled local source ─────────────────────────────────────────────
log "[3/7] Checking local RPC node source..."
[[ -f "$NODE_SOURCE_DIR/go.mod" ]] || die "Local RPC source not found at $NODE_SOURCE_DIR. Set PROJECT_ROOT to the checked-out project directory."
grep -Fqx "module github.com/gydschain/rpcnode" "$NODE_SOURCE_DIR/go.mod" || \
  die "Unexpected Go module in $NODE_SOURCE_DIR/go.mod; refusing to build another node source."

# ── Build binary ──────────────────────────────────────────────────────────────
log "[4/7] Building ${BINARY}..."
( cd "$NODE_SOURCE_DIR" && go mod download && \
  go build -ldflags="-s -w -X main.version=${GYDS_VERSION}" -o "/tmp/${BINARY}" . )
install -m 0755 -o root -g root "/tmp/${BINARY}" "${GYDS_BIN}/${BINARY}"
rm -f "/tmp/${BINARY}"
log "    Installed: ${GYDS_BIN}/${BINARY}"

# ── User & dirs ───────────────────────────────────────────────────────────────
log "[5/7] Creating user and directories..."
id "$APP_USER" &>/dev/null || \
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER" 2>/dev/null || \
  adduser --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "${DATA_DIR}"/{state.db,logs} "${LOG_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}" "${LOG_DIR}"

# ── Firewall ──────────────────────────────────────────────────────────────────
log "[6/7] Configuring node network access..."
node_network_resolve_p2p_host || die "Could not determine a reachable P2P address."
node_network_allow_p2p_tcp "$P2P_PORT"
node_network_allow_tcp_port 80 "GYDS RPC HTTP proxy"
node_network_allow_tcp_port 443 "GYDS RPC HTTPS proxy"

# Fail2ban
if command -v fail2ban-server &>/dev/null; then
  cat > /etc/fail2ban/jail.d/gyds-rpcnode.conf <<EOF
[sshd]
enabled  = true
maxretry = 5
bantime  = 3600

[nginx-http-auth]
enabled  = true
maxretry = 10
bantime  = 600
EOF
  systemctl enable fail2ban &>/dev/null && systemctl restart fail2ban &>/dev/null || true
fi

# ── Nginx + optional TLS ──────────────────────────────────────────────────────
log "[7/7] Configuring Nginx reverse proxy..."
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
cat > /etc/nginx/sites-available/gyds-rpcnode <<EOF
# Rate limiting zone
limit_req_zone \$binary_remote_addr zone=rpc_limit:10m rate=${RATE_LIMIT}r/s;

server {
    listen 80;
    server_name ${DOMAIN};

    # JSON-RPC endpoint
    location / {
        limit_req zone=rpc_limit burst=200 nodelay;

        proxy_pass         http://127.0.0.1:${RPC_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;

        add_header Access-Control-Allow-Origin  "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        if (\$request_method = OPTIONS) { return 204; }
    }

    # WebSocket endpoint
    location /ws {
        proxy_pass         http://127.0.0.1:${RPC_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 86400s;
    }

    # Health check
    location /health {
        access_log off;
        proxy_pass http://127.0.0.1:${RPC_PORT}/health;
    }

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options         "DENY"   always;
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/gyds-rpcnode /etc/nginx/sites-enabled/
nginx -t && systemctl enable nginx && systemctl restart nginx

# TLS via Certbot
if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@${DOMAIN}" 2>/dev/null; then
  log "    TLS certificate issued for ${DOMAIN}"
else
  warn "    Certbot failed — HTTP only. Re-run once DNS points to this server."
fi

# ── systemd service ───────────────────────────────────────────────────────────
# RPC node binds to localhost:8545; nginx proxies externally
cat > /etc/systemd/system/gyds-rpcnode.service <<EOF
[Unit]
Description=GYDSchain RPC Node v${GYDS_VERSION}
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${DATA_DIR}
Environment=GYDS_CHAIN_ID=${CHAIN_ID}
Environment=GYDS_NODE_MODE=rpc
Environment=GYDS_RPC_PORT=${RPC_PORT}
Environment=GYDS_RPC_HOST=127.0.0.1
Environment=GYDS_P2P_PORT=${P2P_PORT}
Environment=GYDS_P2P_ADVERTISE_HOST=${GYDS_P2P_ADVERTISE_HOST}
Environment=GYDS_DATA_DIR=${DATA_DIR}
Environment=GYDS_LOG_LEVEL=${LOG_LEVEL}
Environment=GYDS_LOG_FORMAT=json
Environment=GYDS_HTTP_API=eth,net,web3,txpool,admin,miner,personal,debug
Environment=GYDS_WS_API=eth,net,web3,txpool,admin
$([ -n "$BOOTSTRAP" ] && echo "Environment=GYDS_BOOTSTRAP_NODES=${BOOTSTRAP}")
ExecStart=${GYDS_BIN}/${BINARY} start
ExecReload=/bin/kill -HUP \$MAINPID
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/rpcnode.log
StandardError=append:${LOG_DIR}/rpcnode-error.log
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${DATA_DIR} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gyds-rpcnode
systemctl restart gyds-rpcnode
sleep 3

# ── Health check ──────────────────────────────────────────────────────────────
NODE_OK=false
for i in 1 2 3 4 5; do
  RESP=$(curl -sf --max-time 4 "http://localhost:${RPC_PORT}/health" 2>/dev/null || true)
  [[ -n "$RESP" ]] && NODE_OK=true && break
  warn "    Attempt $i/5: waiting for node... (5s)"
  sleep 5
done

node_network_report_tcp_listener "$P2P_PORT"
SERVER_IP="${GYDS_P2P_ADVERTISE_HOST}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         GYDSchain RPC NODE — DEPLOYED                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
$NODE_OK && echo "  Status  : ✅ RUNNING" || echo "  Status  : ⚠️  NOT RESPONDING — check logs"
echo ""
echo "  Binary  : ${GYDS_BIN}/${BINARY}"
echo "  Service : gyds-rpcnode.service"
echo "  Data    : ${DATA_DIR}"
echo "  Logs    : ${LOG_DIR}/rpcnode.log"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PUBLIC ENDPOINTS (via Nginx)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  JSON-RPC (HTTPS) : https://${DOMAIN}"
echo "  WebSocket (WSS)  : wss://${DOMAIN}/ws"
echo "  Health check     : https://${DOMAIN}/health"
echo "  Internal RPC     : http://127.0.0.1:${RPC_PORT}"
echo "  P2P              : tcp://${SERVER_IP}:${P2P_PORT}"
node_network_report_p2p "$P2P_PORT"
echo "  Rate limit       : ${RATE_LIMIT} req/s per IP"
echo "  Chain ID         : ${CHAIN_ID}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MANAGEMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  systemctl status gyds-rpcnode"
echo "  journalctl -u gyds-rpcnode -f"
echo "  tail -f ${LOG_DIR}/rpcnode.log"
echo ""
echo "  RPC test:"
echo "  curl -s -X POST http://localhost:${RPC_PORT} \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}'"
echo ""
