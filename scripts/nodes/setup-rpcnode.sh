#!/usr/bin/env bash
# ============================================================
# GYDS Chain — RPC Node Setup (Ubuntu 22.04)
# An RPC node exposes full Ethereum-compatible JSON-RPC and
# WebSocket endpoints, rate-limited behind nginx.
# Usage: sudo bash setup-rpcnode.sh
# ============================================================
set -euo pipefail

GYDS_USER="${GYDS_USER:-gyds}"
GYDS_DATADIR="${GYDS_DATADIR:-/var/lib/gyds-rpcnode}"
GYDS_CHAIN_ID="${GYDS_CHAIN_ID:-1337}"
GYDS_RPC_PORT="${GYDS_RPC_PORT:-8545}"
GYDS_WS_PORT="${GYDS_WS_PORT:-8546}"
GYDS_P2P_PORT="${GYDS_P2P_PORT:-30305}"
NGINX_PORT="${NGINX_PORT:-80}"
NGINX_SSL_PORT="${NGINX_SSL_PORT:-443}"
DOMAIN="${GYDS_DOMAIN:-rpc.example.com}"
GO_VERSION="1.22.4"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[RPC]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && die "Run as root: sudo bash $0"

log "Installing system dependencies..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  curl wget git build-essential ca-certificates jq ufw \
  nginx certbot python3-certbot-nginx

log "Installing Go ${GO_VERSION}..."
if ! command -v go &>/dev/null; then
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
  rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile.d/go.sh
  rm /tmp/go.tar.gz
fi
export PATH=$PATH:/usr/local/go/bin

id "${GYDS_USER}" &>/dev/null || useradd -r -m -s /bin/bash "${GYDS_USER}"
mkdir -p "${GYDS_DATADIR}"/{chaindata,logs}
chown -R "${GYDS_USER}:${GYDS_USER}" "${GYDS_DATADIR}"

log "Building/installing GYDS node binary..."
REPO_DIR=$(mktemp -d)
rsync -a --exclude=bin --exclude=data artifacts/gyds-litenode/ "${REPO_DIR}/" 2>/dev/null || true
cd "${REPO_DIR}"
go build -ldflags="-s -w" -o /usr/local/bin/gyds-rpcnode . 2>/dev/null || \
  warn "Build failed — copy binary manually to /usr/local/bin/gyds-rpcnode"
cd - && rm -rf "${REPO_DIR}"
chmod +x /usr/local/bin/gyds-rpcnode 2>/dev/null || true

log "Configuring nginx reverse proxy..."
cat > /etc/nginx/sites-available/gyds-rpc <<NGINX
upstream gyds_rpc {
    server 127.0.0.1:${GYDS_RPC_PORT};
    keepalive 32;
}
upstream gyds_ws {
    server 127.0.0.1:${GYDS_WS_PORT};
    keepalive 32;
}

limit_req_zone \$binary_remote_addr zone=rpc_limit:10m rate=60r/m;

server {
    listen ${NGINX_PORT};
    server_name ${DOMAIN};

    location / {
        limit_req zone=rpc_limit burst=20 nodelay;
        proxy_pass         http://gyds_rpc;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_connect_timeout 30s;
        proxy_read_timeout    60s;
        proxy_send_timeout    60s;
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        if (\$request_method = OPTIONS) { return 204; }
    }

    location /ws {
        proxy_pass         http://gyds_ws;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 3600s;
    }

    location /health {
        proxy_pass http://gyds_rpc/health;
        access_log off;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/gyds-rpc /etc/nginx/sites-enabled/gyds-rpc
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
log "nginx configured and restarted"

cat > /etc/systemd/system/gyds-rpcnode.service <<SERVICE
[Unit]
Description=GYDS Chain RPC Node
After=network-online.target
Wants=network-online.target

[Service]
User=${GYDS_USER}
Group=${GYDS_USER}
Type=simple
Restart=on-failure
RestartSec=10
Environment=GYDS_CHAIN_ID=${GYDS_CHAIN_ID}
Environment=GYDS_RPC_PORT=${GYDS_RPC_PORT}
Environment=GYDS_P2P_PORT=${GYDS_P2P_PORT}
Environment=GYDS_DATA_DIR=${GYDS_DATADIR}
Environment=GYDS_NODE_MODE=full
ExecStart=/usr/local/bin/gyds-rpcnode start
StandardOutput=append:${GYDS_DATADIR}/logs/rpcnode.log
StandardError=append:${GYDS_DATADIR}/logs/rpcnode-error.log
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable gyds-rpcnode
systemctl start gyds-rpcnode

ufw --force enable
ufw allow 22/tcp
ufw allow "${NGINX_PORT}/tcp"
ufw allow "${NGINX_SSL_PORT}/tcp"
ufw allow "${GYDS_P2P_PORT}/tcp"
ufw allow "${GYDS_P2P_PORT}/udp"

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  GYDS RPC Node Setup Complete!           ${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "  JSON-RPC : http://${DOMAIN}/"
echo "  WebSocket: ws://${DOMAIN}/ws"
echo "  Health   : http://${DOMAIN}/health"
echo ""
echo "  SSL (optional): certbot --nginx -d ${DOMAIN}"
