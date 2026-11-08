#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Full Node Installer — FOUNDER ONLY
#  Repo:     https://github.com/hc172808/fullnode.git
#  OS:       Ubuntu 20.04/22.04/24.04 | Debian 11/12 | CentOS/RHEL/AlmaLinux
#  Chain ID: 198282  |  Block time: 5s  |  Domain: netlifegy.com
#  Run:      sudo bash install-fullnode.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Load shared config (written by deploy-dashboard.sh — all values skippable) ─
GYDS_CONF="${GYDS_CONF:-/var/www/gydschain/gyds-config.env}"
# shellcheck disable=SC1090
[[ -f "$GYDS_CONF" ]] && { source "$GYDS_CONF"; echo "[config] Loaded shared config from $GYDS_CONF"; }
GYDS_SHARED_CONFIG_LOADED=0
[[ -f "$GYDS_CONF" ]] && GYDS_SHARED_CONFIG_LOADED=1
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/node-profile.sh"
load_node_profile

# ── Config ────────────────────────────────────────────────────────────────────
GYDS_VERSION="1.0.0"
NODE_ROLE="${NODE_ROLE:-full}"
case "$NODE_ROLE" in full|rpc) ;; *) echo "Unsupported node role" >&2; exit 1;; esac
SERVICE_NAME="gyds-${NODE_ROLE}node"
BINARY="$SERVICE_NAME"
APP_USER="${APP_USER:-gyds}"
APP_DIR="${NODE_SOURCE_DIR:-/opt/${SERVICE_NAME}}"
DATA_DIR="${GYDS_DATA_DIR:-/var/lib/${SERVICE_NAME}}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-${DATA_DIR}/logs}"
GO_VERSION="${GO_VERSION:-1.25.0}"

CHAIN_ID="${GYDS_CHAIN_ID:-198282}"
RPC_PORT="${GYDS_RPC_PORT:-8545}"
WS_PORT="${GYDS_WS_PORT:-8546}"
P2P_PORT="${GYDS_P2P_PORT:-30303}"
LOG_LEVEL="${GYDS_LOG_LEVEL:-info}"
BOOTSTRAP="${GYDS_BOOTSTRAP_NODES:-}"
DOMAIN="${DOMAIN:-}"
RPC_DOMAIN="${GYDS_RPC_DOMAIN:-}"
if [[ -z "$RPC_DOMAIN" && -n "$DOMAIN" ]]; then
  if [[ "$GYDS_SHARED_CONFIG_LOADED" == "1" ]]; then
    RPC_DOMAIN="rpc.${DOMAIN}"
  else
    RPC_DOMAIN="$DOMAIN"
  fi
fi

REPO_URL="${REPO_URL:-https://github.com/hc172808/fullnode.git}"
BRANCH="main"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain FULL NODE Installer v${GYDS_VERSION} — FOUNDER          ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Block time: 5s  |  netlifegy.com  ║"
echo "║   Repo: github.com/hc172808/fullnode                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0"

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rpc-port)        RPC_PORT="$2";    shift 2 ;;
    --ws-port)         WS_PORT="$2";     shift 2 ;;
    --p2p-port)        P2P_PORT="$2";    shift 2 ;;
    --data-dir)        DATA_DIR="$2";    shift 2 ;;
    --domain)          DOMAIN="$2"; RPC_DOMAIN="$2"; shift 2 ;;
    --log-level)       LOG_LEVEL="$2";   shift 2 ;;
    --bootstrap-nodes) BOOTSTRAP="$2";   shift 2 ;;
    --no-wizard)       shift ;;
    *) warn "Unknown flag: $1"; shift ;;
  esac
done

[[ -z "${GYDS_NODE_MODE:-}" || "$GYDS_NODE_MODE" == "$NODE_ROLE" ]] || die "Profile role does not match $NODE_ROLE"
for port in "$RPC_PORT" "$WS_PORT" "$P2P_PORT"; do
  [[ "$port" =~ ^[0-9]{1,5}$ ]] && (( 10#$port >= 1 && 10#$port <= 65535 )) || die "Invalid node port"
done
[[ "$RPC_PORT" != "$P2P_PORT" ]] || die "RPC and P2P ports must differ"

# ── OS detection ──────────────────────────────────────────────────────────────
. /etc/os-release 2>/dev/null || die "Cannot read /etc/os-release"
OS_ID="${ID:-unknown}"
OS_LIKE="${ID_LIKE:-}"

is_debian() { case "$OS_ID" in ubuntu|debian) return 0;; esac; [[ "$OS_LIKE" == *debian* || "$OS_LIKE" == *ubuntu* ]] && return 0; return 1; }
is_rhel()   { case "$OS_ID" in rhel|centos|fedora|almalinux|rocky|ol) return 0;; esac; [[ "$OS_LIKE" == *rhel* || "$OS_LIKE" == *centos* ]] && return 0; return 1; }

is_debian || is_rhel || die "Unsupported OS: $OS_ID"
log "OS: $OS_ID $VERSION_ID"

# ── Detect arch ───────────────────────────────────────────────────────────────
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)        GO_ARCH="amd64" ;;
  aarch64|arm64) GO_ARCH="arm64" ;;
  *) die "Unsupported architecture: $ARCH" ;;
esac

# ── System packages ───────────────────────────────────────────────────────────
log "[1/7] Installing system dependencies..."
if is_debian; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    build-essential git curl wget jq ufw fail2ban nginx certbot python3-certbot-nginx \
    ca-certificates openssl net-tools lsof
elif is_rhel; then
  rpm -q epel-release &>/dev/null || dnf install -y epel-release 2>/dev/null || true
  dnf install -y gcc git curl wget jq firewalld fail2ban nginx certbot python3-certbot-nginx \
    ca-certificates openssl net-tools lsof 2>/dev/null || \
  yum install -y gcc git curl wget jq firewalld fail2ban nginx ca-certificates openssl net-tools lsof
fi

# ── Go ────────────────────────────────────────────────────────────────────────
log "[2/7] Installing Go ${GO_VERSION}..."
export PATH="$PATH:/usr/local/go/bin"
CURRENT_GO=$(go version 2>/dev/null | awk '{print $3}' | sed 's/go//' || echo "none")
if [[ "$CURRENT_GO" != "$GO_VERSION" ]]; then
  GO_URL="https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
  wget -q "$GO_URL" -O /tmp/go.tar.gz || die "Failed to download Go from $GO_URL"
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  rm -f /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
  chmod +x /etc/profile.d/go.sh
  ln -sf /usr/local/go/bin/go    /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
fi
log "    $(go version)"

# ── Clone / update repo ───────────────────────────────────────────────────────
log "[3/7] Fetching source from ${REPO_URL}..."
if [[ -d "$APP_DIR/.git" ]]; then
  log "    Existing install found — pulling latest..."
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" merge --ff-only "origin/$BRANCH"
else
  git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
[[ -f "$APP_DIR/go.mod" ]] || die "go.mod not found in $APP_DIR — check repo layout"

# ── Build binary ──────────────────────────────────────────────────────────────
log "[4/7] Building $BINARY..."
( cd "$APP_DIR" && go mod download && \
  go build -ldflags="-s -w -X main.version=${GYDS_VERSION}" -o "/tmp/${BINARY}" . )
install -m 0755 -o root -g root "/tmp/${BINARY}" "${GYDS_BIN}/${BINARY}"
rm -f "/tmp/${BINARY}"
log "    Installed: ${GYDS_BIN}/${BINARY} ($(du -h "${GYDS_BIN}/${BINARY}" | cut -f1))"

# ── User & directories ────────────────────────────────────────────────────────
log "[5/7] Creating system user and directories..."
id "$APP_USER" &>/dev/null || \
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER" 2>/dev/null || \
  adduser --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"

mkdir -p "${DATA_DIR}"/{keystore,logs} "${LOG_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}" "${LOG_DIR}"
chmod 700 "${DATA_DIR}/keystore"

# ── Firewall ──────────────────────────────────────────────────────────────────
log "[6/7] Configuring firewall..."
if is_debian && command -v ufw &>/dev/null; then
  # Preserve CloudPanel rules and the active SSH port.
  SSH_PORT="${GYDS_SSH_PORT:-${SSH_CONNECTION:-}}"
  SSH_PORT="${SSH_PORT##* }"
  [[ "$SSH_PORT" =~ ^[0-9]+$ ]] && ufw allow "${SSH_PORT}/tcp" >/dev/null
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw limit 22/tcp    comment "SSH (rate-limited)" >/dev/null
  ufw allow 80/tcp    comment "HTTP"               >/dev/null
  ufw allow 443/tcp   comment "HTTPS"              >/dev/null
  ufw allow "${RPC_PORT}/tcp" comment "GYDS RPC"   >/dev/null
  ufw allow "${WS_PORT}/tcp"  comment "GYDS WS"    >/dev/null
  ufw allow "${P2P_PORT}/tcp" comment "GYDS P2P"   >/dev/null
  ufw allow "${P2P_PORT}/udp" comment "GYDS P2P"   >/dev/null
  ufw allow 51820/udp comment "WireGuard"          >/dev/null
  ufw --force enable >/dev/null
  log "    UFW enabled"
elif is_rhel && command -v firewall-cmd &>/dev/null; then
  systemctl enable --now firewalld
  firewall-cmd --permanent --add-port=22/tcp
  firewall-cmd --permanent --add-port=80/tcp
  firewall-cmd --permanent --add-port=443/tcp
  firewall-cmd --permanent --add-port="${RPC_PORT}/tcp"
  firewall-cmd --permanent --add-port="${WS_PORT}/tcp"
  firewall-cmd --permanent --add-port="${P2P_PORT}/tcp"
  firewall-cmd --permanent --add-port="${P2P_PORT}/udp"
  firewall-cmd --reload
  log "    firewalld configured"
fi

# Fail2ban for SSH + RPC
if command -v fail2ban-server &>/dev/null; then
  cat > /etc/fail2ban/jail.d/gyds-fullnode.conf <<EOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
maxretry = 5
bantime  = 3600

[gyds-rpc]
enabled  = true
port     = ${RPC_PORT}
maxretry = 30
bantime  = 1800
findtime = 300
EOF
  systemctl enable fail2ban &>/dev/null && systemctl restart fail2ban &>/dev/null || true
fi

# ── systemd service ───────────────────────────────────────────────────────────
log "[7/7] Installing systemd service..."

# Build environment block
ENV_BLOCK="Environment=GYDS_CHAIN_ID=${CHAIN_ID}
Environment=GYDS_NODE_MODE=${NODE_ROLE}
Environment=GYDS_RPC_PORT=${RPC_PORT}
Environment=GYDS_RPC_HOST=${GYDS_RPC_HOST:-127.0.0.1}
Environment=GYDS_DASHBOARD_ENABLED=false
Environment=GYDS_P2P_PORT=${P2P_PORT}
Environment=GYDS_DATA_DIR=${DATA_DIR}
Environment=GYDS_LOG_LEVEL=${LOG_LEVEL}
Environment=GYDS_LOG_FORMAT=json"
[[ -n "$BOOTSTRAP" ]] && ENV_BLOCK+="
Environment=GYDS_BOOTSTRAP_NODES=${BOOTSTRAP}"

PROFILE_FILE="/etc/${SERVICE_NAME}.env"
write_node_profile "$PROFILE_FILE"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=GYDSchain Full Node v${GYDS_VERSION}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${DATA_DIR}
${ENV_BLOCK}
EnvironmentFile=${PROFILE_FILE}
Environment=GYDS_HTTP_API=eth,net,web3,txpool,admin,miner,personal,debug
Environment=GYDS_WS_API=eth,net,web3,txpool,admin
ExecStart=${GYDS_BIN}/${BINARY} start
ExecReload=/bin/kill -HUP \$MAINPID
Restart=on-failure
RestartSec=10
TimeoutStopSec=30
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/fullnode.log
StandardError=append:${LOG_DIR}/fullnode-error.log
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${DATA_DIR} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF

# Nginx reverse proxy (optional RPC domain)
if [[ -n "$RPC_DOMAIN" ]]; then
  mkdir -p /etc/nginx/conf.d

  # limit_req_zone is only valid in nginx's http context, not inside a server
  # vhost. conf.d/*.conf is included from http{} by the standard distro configs.
  cat > /etc/nginx/conf.d/gyds-fullnode-ratelimit.conf <<'EOF'
limit_req_zone $binary_remote_addr zone=gyds_fullnode_rpc_limit:10m rate=100r/s;
EOF

  # Ubuntu/Debian enable sites-enabled; RHEL/Fedora use conf.d directly.
  if grep -Eq '^[[:space:]]*include[[:space:]]+/etc/nginx/sites-enabled/\*;' /etc/nginx/nginx.conf 2>/dev/null; then
    mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
    NGINX_SITE="/etc/nginx/sites-available/${SERVICE_NAME}"
  else
    NGINX_SITE="/etc/nginx/conf.d/${SERVICE_NAME}.conf"
  fi

  cat > "$NGINX_SITE" <<EOF

server {
    listen 80;
    server_name ${RPC_DOMAIN};

    location / {
        limit_req zone=gyds_fullnode_rpc_limit burst=200 nodelay;
        proxy_pass         http://127.0.0.1:${RPC_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
        add_header Access-Control-Allow-Origin  "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        if (\$request_method = OPTIONS) { return 204; }
    }
    location /ws {
        proxy_pass         http://127.0.0.1:${RPC_PORT}/api/ws;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_read_timeout 86400s;
    }
    location /health {
        access_log off;
        proxy_pass http://127.0.0.1:${RPC_PORT}/api/health;
    }
}
EOF
  if [[ "$NGINX_SITE" == /etc/nginx/sites-available/* ]]; then
    rm -f /etc/nginx/sites-enabled/default
    ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/${SERVICE_NAME}
  fi
  nginx -t && systemctl enable nginx && systemctl restart nginx

  # TLS via certbot
  if certbot --nginx -d "$RPC_DOMAIN" --non-interactive --agree-tos -m "admin@${RPC_DOMAIN}" 2>/dev/null; then
    log "    TLS certificate issued for ${RPC_DOMAIN}"
  else
    warn "    Certbot failed — HTTP only for now. Re-run after DNS is configured."
  fi
fi

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# setup-node.sh is a terminal-only profile generator, not a binary command.
echo "Installed ${SERVICE_NAME}. Profile: ${PROFILE_FILE}"
echo "To reconfigure: run upstream setup-node.sh --output, then set GYDS_NODE_ENV and rerun."
GENERATED_ENV="${PROFILE_FILE}"

# Start the systemd service
systemctl restart "$SERVICE_NAME"
sleep 3

# ── Health check ──────────────────────────────────────────────────────────────
# Read RPC port from generated env if available
if [[ -f "$GENERATED_ENV" ]]; then
  WIZARD_RPC=$(grep "^GYDS_RPC_PORT=" "$GENERATED_ENV" | cut -d= -f2 | tr -d ' ' || echo "")
  [[ -n "$WIZARD_RPC" ]] && RPC_PORT="$WIZARD_RPC"
fi

NODE_OK=false
for i in 1 2 3 4 5; do
  RESP=$(curl -sf --max-time 4 "http://localhost:${RPC_PORT}/api/health" 2>/dev/null || true)
  if [[ -n "$RESP" ]]; then NODE_OK=true; break; fi
  warn "    Attempt $i/5: waiting for node... (5s)"
  sleep 5
done

SERVER_IP=$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
WIZARD_DOMAIN=""
[[ -f "$GENERATED_ENV" ]] && WIZARD_DOMAIN=$(grep "^DOMAIN=" "$GENERATED_ENV" | cut -d= -f2 | tr -d ' ' || echo "")
[[ -n "$WIZARD_DOMAIN" ]] && DOMAIN="$WIZARD_DOMAIN"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         GYDSchain FULL NODE — RUNNING                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
$NODE_OK && echo "  Status  : ✅ RUNNING" || echo "  Status  : ⚠️  NOT RESPONDING — check logs"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ENDPOINTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ -n "$RPC_DOMAIN" ]]; then
  echo "  RPC (HTTPS) : https://${RPC_DOMAIN}"
  echo "  WS  (WSS)   : wss://${RPC_DOMAIN}/ws"
else
  echo "  RPC (HTTP)  : http://${SERVER_IP}:${RPC_PORT}"
  echo "  WS  (WS)    : ws://${SERVER_IP}:${RPC_PORT}/api/ws"
fi
echo "  P2P         : tcp://${SERVER_IP}:${P2P_PORT}"
echo "  Chain ID    : ${CHAIN_ID}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MANAGEMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Reconfigure    : run setup-node.sh --output, then set GYDS_NODE_ENV and rerun installer"
echo "  Service status : systemctl status ${SERVICE_NAME}"
echo "  Live logs      : journalctl -u ${SERVICE_NAME} -f"
echo "  Log file       : tail -f ${LOG_DIR}/fullnode.log"
echo ""
echo "  RPC test:"
echo "  curl -s -X POST http://localhost:${RPC_PORT} \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ADD TO METAMASK / WALLET"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Network Name : GYDS Chain"
echo "  Chain ID     : ${CHAIN_ID}"
[[ -n "$RPC_DOMAIN" ]] && echo "  RPC URL      : https://${RPC_DOMAIN}" || echo "  RPC URL      : http://${SERVER_IP}:${RPC_PORT}"
echo "  Currency     : GYDS"
echo ""
