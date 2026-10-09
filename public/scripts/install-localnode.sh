#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain — Local Network Node Installer (Ubuntu 22.04)
#
#  Designed for a home/office LAN with NO domain name.
#  - Everything binds to your local IP (no SSL, no certbot)
#  - Dashboard served on HTTP port 80 at http://<local-ip>
#  - RPC on port 8546, WebSocket at /api/ws, P2P on 30303
#  - Cloudflare Tunnel can be added later to expose it publicly over HTTPS
#
#  Usage:
#    sudo bash install-localnode.sh
#
#  Optional env overrides:
#    NODE_TYPE=fullnode            default; also: litenode, rpc
#    REPO_URL=https://...          override the canonical fullnode source repo
#    GYDS_BOOTSTRAP_NODES=host:30303[,host:30303...]
#    CHAIN_ID=198282                mainnet; testnet=198281
#    Validator setup remains on scripts/setup-validator-node.sh until the
#    canonical fullnode PoS engine consumes its configured signing key.
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
GYDS_VERSION="2.1.0"
GYDS_USER="${GYDS_USER:-gydschain}"
GYDS_HOME="${GYDS_HOME:-/var/lib/gydschain}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-/var/log/gydschain}"
GO_VERSION="${GO_VERSION:-1.25.0}"

NODE_TYPE="${NODE_TYPE:-fullnode}"
NODE_MODE=""
RPC_PORT="${RPC_PORT:-8546}"
P2P_PORT="${P2P_PORT:-30303}"
CHAIN_ID="${CHAIN_ID:-198282}"
BLOCK_TIME="${BLOCK_TIME:-120}"
BOOTSTRAP_NODES="${GYDS_BOOTSTRAP_NODES:-}"

REPO_URL="${REPO_URL:-https://github.com/hc172808/fullnode.git}"
REPO_DIR="${REPO_DIR:-/opt/gyds-fullnode}"
SRC_DIR="${SRC_DIR:-}"
DATA_DIR="${GYDS_DATA_DIR:-${GYDS_HOME}/data-fullnode}"

DASHBOARD_DIR="${DASHBOARD_DIR:-/var/www/gydschain}"
NGINX_CONF="/etc/nginx/sites-available/gydschain-local"
SERVICE_NAME="gyds-${NODE_TYPE}"

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
step() { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

case "$NODE_TYPE" in
  fullnode) NODE_MODE="full" ;;
  litenode) NODE_MODE="lite" ;;
  rpc)      NODE_MODE="rpc" ;;
  validator)
    err "Validator mode remains on the dedicated setup script until fullnode.git uses GYDS_VALIDATOR_KEY for block signing."
    err "No validator binary was changed or started."
    exit 1
    ;;
  *)
    err "Unsupported NODE_TYPE '$NODE_TYPE'. Use fullnode, litenode, or rpc."
    exit 1
    ;;
esac

case "$CHAIN_ID" in
  198282) NETWORK="mainnet" ;;
  198281) NETWORK="testnet" ;;
  *)
    err "Unsupported CHAIN_ID '$CHAIN_ID'. Canonical fullnode supports 198282 (mainnet) or 198281 (testnet)."
    exit 1
    ;;
esac

if [[ -n "$BOOTSTRAP_NODES" && ! "$BOOTSTRAP_NODES" =~ ^[A-Za-z0-9:./,_-]+$ ]]; then
  err "GYDS_BOOTSTRAP_NODES may contain only host:port entries separated by commas."
  exit 1
fi

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
if [[ -z "$SRC_DIR" ]]; then
  if [[ -d "${REPO_DIR}/.git" ]]; then
    ORIGIN_URL="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"
    if [[ -z "$ORIGIN_URL" || "${ORIGIN_URL%.git}" != "${REPO_URL%.git}" ]]; then
      err "Existing checkout at ${REPO_DIR} does not match ${REPO_URL}; refusing to build from another repository."
      exit 1
    fi
    log "Canonical repo exists at ${REPO_DIR} — fast-forwarding main..."
    git -C "${REPO_DIR}" pull --ff-only origin main
  else
    log "Cloning canonical fullnode source from ${REPO_URL}..."
    git clone --depth=1 --branch main "${REPO_URL}" "${REPO_DIR}"
  fi
  SRC_DIR="$REPO_DIR"
fi

if [[ ! -f "${SRC_DIR}/go.mod" ]] || ! grep -Eq '^module[[:space:]]+github\.com/gydschain/fullnode([[:space:]]|$)' "${SRC_DIR}/go.mod"; then
  err "Expected the canonical module github.com/gydschain/fullnode at ${SRC_DIR}."
  err "Set SRC_DIR only to a checkout of https://github.com/hc172808/fullnode.git."
  exit 1
fi
log "Source: ${SRC_DIR}"
if [[ "$NODE_MODE" != "rpc" && -z "$BOOTSTRAP_NODES" ]]; then
  warn "No bootstrap peers configured. The node will run isolated until GYDS_BOOTSTRAP_NODES is set."
fi

# ── Step 4: Build binary ──────────────────────────────────────────────────────
step "4/8  Build gyds-${NODE_TYPE}"
BUILD_TMP="$(mktemp -d)"
trap 'rm -rf "${BUILD_TMP:-}"' EXIT
( cd "${SRC_DIR}" && go mod download && \
  go build -ldflags="-s -w -X main.version=${GYDS_VERSION}" \
    -o "${BUILD_TMP}/gyds-fullnode" . )
install -m 0755 "${BUILD_TMP}/gyds-fullnode" "${GYDS_BIN}/gyds-fullnode"
if [[ "$NODE_TYPE" != "fullnode" ]]; then
  ln -sfn "gyds-fullnode" "${GYDS_BIN}/gyds-${NODE_TYPE}"
fi
rm -rf "${BUILD_TMP}"
trap - EXIT
log "Canonical binary: ${GYDS_BIN}/gyds-fullnode (mode: ${NODE_MODE})"

# ── Step 5: System user + directories ─────────────────────────────────────────
step "5/8  System user + directories"
if ! id "${GYDS_USER}" &>/dev/null; then
  useradd -r -s /usr/sbin/nologin -d "${GYDS_HOME}" "${GYDS_USER}"
fi
mkdir -p "${DATA_DIR}" "${GYDS_HOME}/config" "${LOG_DIR}" "${DASHBOARD_DIR}"
chown -R "${GYDS_USER}:${GYDS_USER}" "${DATA_DIR}" "${GYDS_HOME}/config" "${LOG_DIR}"
if [[ -d "${GYDS_HOME}/data" && "${DATA_DIR}" != "${GYDS_HOME}/data" ]]; then
  warn "Canonical data uses ${DATA_DIR}; legacy data at ${GYDS_HOME}/data is untouched. Back up first; a fresh sync may be required."
fi

# ── Step 6: Node config ───────────────────────────────────────────────────────
step "6/8  Node configuration"
cat > "${GYDS_HOME}/config/node.env" <<EOF
GYDS_NODE_MODE=${NODE_MODE}
GYDS_NETWORK=${NETWORK}
GYDS_CHAIN_ID=${CHAIN_ID}
GYDS_RPC_HOST=0.0.0.0
GYDS_RPC_PORT=${RPC_PORT}
GYDS_P2P_PORT=${P2P_PORT}
GYDS_DASHBOARD_PORT=5000
GYDS_BLOCK_TIME=${BLOCK_TIME}
GYDS_DATA_DIR=${DATA_DIR}
GYDS_BOOTSTRAP_NODES=${BOOTSTRAP_NODES}
GYDS_LOG_FORMAT=json
EOF
chown "${GYDS_USER}:${GYDS_USER}" "${GYDS_HOME}/config/node.env"
chmod 0640 "${GYDS_HOME}/config/node.env"
log "Config: ${GYDS_HOME}/config/node.env"

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
WorkingDirectory=${GYDS_HOME}
EnvironmentFile=${GYDS_HOME}/config/node.env
ExecStart=${GYDS_BIN}/gyds-fullnode start
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
        proxy_pass http://127.0.0.1:${RPC_PORT}/api/ws;
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
ufw allow "${P2P_PORT}/tcp"  comment 'GYDS P2P'
ufw allow "${P2P_PORT}/udp"  comment 'GYDS P2P'
# Restrict RPC to LAN subnet only (adjust to match your network)
LAN_CIDR="${LAN_CIDR:-192.168.0.0/16}"
ufw allow from "${LAN_CIDR}" to any port "${RPC_PORT}" comment 'RPC LAN only'

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
  Node mode:     ${NODE_MODE}
  Binary:        ${GYDS_BIN}/gyds-fullnode
  Service:       ${SERVICE_NAME}.service
  Data dir:      ${DATA_DIR}
  Legacy data:   ${GYDS_HOME}/data (left untouched)
  Config:        ${GYDS_HOME}/config/node.env
  Logs:          ${LOG_DIR}/${NODE_TYPE}.log

  ── Access (local network) ───────────────────────────────────────────────
  Dashboard:     http://${LOCAL_IP}
  RPC:           http://${LOCAL_IP}:${RPC_PORT}
  WebSocket:     ws://${LOCAL_IP}/ws (proxied to RPC /api/ws)
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
