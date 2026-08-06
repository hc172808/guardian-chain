#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain — Local Network Node Installer (Ubuntu 22.04)
#
#  Designed for a home/office LAN with NO domain name.
#  - Everything binds to your local IP (no SSL, no certbot)
#  - Dashboard served on HTTP port 80 at http://<local-ip>
#  - RPC on port 8546, WS on 8547, P2P on 30303
#  - Cloudflare Tunnel can be added later to expose it publicly over HTTPS
#
#  Usage:
#    sudo bash install-localnode.sh
#
#  Optional env overrides:
#    ENABLE_MINING=false          disable mining on this node
#    NODE_TYPE=fullnode            default; also: litenode, rpc, validator
#    REPO_URL=https://...          override the guardian-chain source repo
#    CHAIN_ID=198282                mainnet; testnet=13371  devnet=13372
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
GYDS_VERSION="2.1.0"
GYDS_USER="${GYDS_USER:-gydschain}"
GYDS_HOME="${GYDS_HOME:-/var/lib/gydschain}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-/var/log/gydschain}"
GO_VERSION="${GO_VERSION:-1.22.5}"

NODE_TYPE="${NODE_TYPE:-fullnode}"
RPC_PORT="${RPC_PORT:-8546}"
WS_PORT="${WS_PORT:-8547}"
P2P_PORT="${P2P_PORT:-30303}"
CHAIN_ID="${CHAIN_ID:-198282}"
BLOCK_TIME="${BLOCK_TIME:-120}"
ENABLE_MINING="${ENABLE_MINING:-true}"

REPO_URL="${REPO_URL:-https://github.com/hc172808/guardian-chain.git}"
REPO_DIR="${REPO_DIR:-/opt/guardian-chain}"
SRC_DIR="${SRC_DIR:-$(cd "$(dirname "$0")/../blockchain-go" 2>/dev/null && pwd || echo "")}"

DASHBOARD_DIR="${DASHBOARD_DIR:-/var/www/gydschain}"
NGINX_CONF="/etc/nginx/sites-available/gydschain-local"
SERVICE_NAME="gyds-${NODE_TYPE}"

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
step() { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain LOCAL NODE Installer v${GYDS_VERSION}                             ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Node: ${NODE_TYPE}  |  No domain required          ║"
echo "║   Ready for Cloudflare Tunnel when you want public access            ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || { err "Run as root: sudo bash $0"; exit 1; }

# Detect local IP early (used throughout)
LOCAL_IP="$(hostname -I | awk '{print $1}')"
[[ -n "$LOCAL_IP" ]] || { err "Could not detect local IP. Check network interface."; exit 1; }
log "Detected local IP: ${LOCAL_IP}"

# ── Step 1: System packages ───────────────────────────────────────────────────
step "1/8  System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  build-essential git curl wget jq \
  ufw fail2ban nginx openssl \
  ca-certificates unzip logrotate

# ── Step 2: Go ────────────────────────────────────────────────────────────────
step "2/8  Go ${GO_VERSION}"
if ! command -v go >/dev/null 2>&1 || [[ "$(go version | awk '{print $3}')" < "go${GO_VERSION}" ]]; then
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tgz
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tgz
  rm /tmp/go.tgz
  log "Go installed to /usr/local/go"
else
  log "Go $(go version | awk '{print $3}') already present"
fi
export PATH="/usr/local/go/bin:${PATH}"

# ── Step 3: Source code ───────────────────────────────────────────────────────
step "3/8  Source code"
if [[ -z "$SRC_DIR" || ! -d "$SRC_DIR/cmd/${NODE_TYPE}" ]]; then
  warn "SRC_DIR not set — cloning from ${REPO_URL}..."
  if [[ -d "${REPO_DIR}/.git" ]]; then
    log "Repo already present at ${REPO_DIR} — pulling..."
    git -C "${REPO_DIR}" pull --ff-only
  else
    git clone --depth=1 "${REPO_URL}" "${REPO_DIR}"
  fi
  SRC_DIR="${REPO_DIR}/public/blockchain-go"
fi

if [[ ! -d "${SRC_DIR}/cmd/${NODE_TYPE}" ]]; then
  err "cmd/${NODE_TYPE} not found at ${SRC_DIR}"
  err "Override: NODE_TYPE=litenode sudo bash $0"
  exit 1
fi
log "Source: ${SRC_DIR}"

# ── Step 4: Build binary ──────────────────────────────────────────────────────
step "4/8  Build gyds-${NODE_TYPE}"
BUILD_TMP="$(mktemp -d)"
cp -r "${SRC_DIR}" "${BUILD_TMP}/blockchain-go"
pushd "${BUILD_TMP}/blockchain-go" >/dev/null
  go build -o "${GYDS_BIN}/gyds-${NODE_TYPE}" ./cmd/"${NODE_TYPE}"/...
popd >/dev/null
rm -rf "${BUILD_TMP}"
log "Binary: ${GYDS_BIN}/gyds-${NODE_TYPE}"

# ── Step 5: System user + directories ─────────────────────────────────────────
step "5/8  System user + directories"
if ! id "${GYDS_USER}" &>/dev/null; then
  useradd -r -s /usr/sbin/nologin -d "${GYDS_HOME}" "${GYDS_USER}"
fi
mkdir -p "${GYDS_HOME}/data" "${GYDS_HOME}/config" "${LOG_DIR}" "${DASHBOARD_DIR}"
chown -R "${GYDS_USER}:${GYDS_USER}" "${GYDS_HOME}" "${LOG_DIR}"

# ── Step 6: Node config ───────────────────────────────────────────────────────
step "6/8  Node configuration"
cat > "${GYDS_HOME}/config/node.toml" <<EOF
[chain]
id          = ${CHAIN_ID}
block_time  = ${BLOCK_TIME}

[rpc]
# Bind to all local interfaces — firewall restricts external access
host        = "0.0.0.0"
port        = ${RPC_PORT}
cors_origins = ["*"]
enable_ws   = true
ws_port     = ${WS_PORT}

[p2p]
port        = ${P2P_PORT}
# No public advertise address — LAN only until Cloudflare Tunnel is configured
max_peers   = 25

[mining]
enabled     = ${ENABLE_MINING}
threads     = 2

[storage]
data_dir    = "${GYDS_HOME}/data"
EOF
chown "${GYDS_USER}:${GYDS_USER}" "${GYDS_HOME}/config/node.toml"
log "Config: ${GYDS_HOME}/config/node.toml"

# ── Step 7: Systemd service ───────────────────────────────────────────────────
step "7/8  Systemd service"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=GYDSchain ${NODE_TYPE} (local network)
After=network.target
Wants=network-online.target

[Service]
User=${GYDS_USER}
Group=${GYDS_USER}
ExecStart=${GYDS_BIN}/gyds-${NODE_TYPE} \\
  --config=${GYDS_HOME}/config/node.toml \\
  --datadir=${GYDS_HOME}/data \\
  --chain-id=${CHAIN_ID} \\
  --rpc=http://${LOCAL_IP}:${RPC_PORT} \\
  --ws=ws://${LOCAL_IP}:${WS_PORT} \\
  --no-discovery
Restart=always
RestartSec=5
StandardOutput=append:${LOG_DIR}/${NODE_TYPE}.log
StandardError=append:${LOG_DIR}/${NODE_TYPE}.log
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"
log "Service: ${SERVICE_NAME}.service"

# ── Step 8: nginx — HTTP only (no SSL) ───────────────────────────────────────
step "8/8  nginx (HTTP only — Cloudflare Tunnel will add HTTPS later)"
cat > "${NGINX_CONF}" <<EOF
# GYDSchain local dashboard — HTTP only
# Cloudflare Tunnel will terminate HTTPS externally when you're ready.
server {
    listen 80;
    listen [::]:80;
    server_name ${LOCAL_IP} localhost _;

    root ${DASHBOARD_DIR};
    index index.html;

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy RPC requests so the dashboard can reach the node
    location /rpc {
        proxy_pass http://127.0.0.1:${RPC_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_http_version 1.1;
    }

    # Proxy WebSocket endpoint
    location /ws {
        proxy_pass http://127.0.0.1:${WS_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    # Basic security headers (no HSTS — not using HTTPS yet)
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";

    access_log /var/log/nginx/gydschain_access.log;
    error_log  /var/log/nginx/gydschain_error.log;
}
EOF

# Remove default site if present
rm -f /etc/nginx/sites-enabled/default
ln -sf "${NGINX_CONF}" /etc/nginx/sites-enabled/gydschain-local
nginx -t && systemctl reload nginx || { err "nginx config test failed"; nginx -t; exit 1; }
log "nginx: serving dashboard at http://${LOCAL_IP}"

# ── Firewall (UFW) — LAN-only access ─────────────────────────────────────────
log "Configuring firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp     comment 'HTTP dashboard (local network)'
ufw allow "${RPC_PORT}/tcp"  comment 'GYDS RPC (local network)'
ufw allow "${WS_PORT}/tcp"   comment 'GYDS WebSocket (local network)'
ufw allow "${P2P_PORT}/tcp"  comment 'GYDS P2P'
ufw allow "${P2P_PORT}/udp"  comment 'GYDS P2P'
# Restrict RPC/WS to LAN subnet only (adjust to match your network)
LAN_CIDR="${LAN_CIDR:-192.168.0.0/16}"
ufw allow from "${LAN_CIDR}" to any port "${RPC_PORT}" comment 'RPC LAN only'
ufw allow from "${LAN_CIDR}" to any port "${WS_PORT}"  comment 'WS LAN only'

# ── Logrotate ─────────────────────────────────────────────────────────────────
cat > "/etc/logrotate.d/gydschain" <<EOF
${LOG_DIR}/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    sharedscripts
    postrotate
        systemctl reload ${SERVICE_NAME} 2>/dev/null || true
    endscript
}
EOF

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║   ✅ GYDSchain Local Node installed successfully                      ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
cat <<EOF
  Node type:     ${NODE_TYPE}
  Chain ID:      ${CHAIN_ID}
  Binary:        ${GYDS_BIN}/gyds-${NODE_TYPE}
  Service:       ${SERVICE_NAME}.service
  Data dir:      ${GYDS_HOME}/data
  Config:        ${GYDS_HOME}/config/node.toml
  Logs:          ${LOG_DIR}/${NODE_TYPE}.log

  ── Access (local network) ───────────────────────────────────────────────
  Dashboard:     http://${LOCAL_IP}
  RPC:           http://${LOCAL_IP}:${RPC_PORT}
  WebSocket:     ws://${LOCAL_IP}:${WS_PORT}
  P2P:           ${LOCAL_IP}:${P2P_PORT}

  ── Service management ───────────────────────────────────────────────────
  systemctl status ${SERVICE_NAME}
  journalctl -u ${SERVICE_NAME} -f
  tail -f ${LOG_DIR}/${NODE_TYPE}.log

  ── Later: add Cloudflare Tunnel for public HTTPS access ─────────────────
  1. Install cloudflared:
       curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | \\
         sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
       echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \\
         https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | \\
         sudo tee /etc/apt/sources.list.d/cloudflared.list
       sudo apt-get update && sudo apt-get install cloudflared

  2. Authenticate:
       cloudflared tunnel login

  3. Create & run tunnel:
       cloudflared tunnel create gydschain
       cloudflared tunnel route dns gydschain <your-hostname>
       cloudflared tunnel run --url http://localhost:80 gydschain

  Once the tunnel is running your dashboard will be available at
  https://<your-hostname> without any changes to this server.
EOF
echo ""
