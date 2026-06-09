#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain RPC Node Installer
#  Clones from: https://github.com/hc172808/rpcnode.git
#  A public-facing JSON-RPC endpoint node for GydsChain.
#  Target OS: Ubuntu 22.04 LTS  |  Chain ID 13370  |  Domain: netlifegy.com
#  Run:  sudo bash install-rpcnode.sh
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GYDS_VERSION="2.1.0"
GYDS_USER="${GYDS_USER:-gydschain}"
GYDS_HOME="${GYDS_HOME:-/var/lib/gydschain-rpc}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-/var/log/gydschain}"
GO_VERSION="${GO_VERSION:-1.22.5}"

RPC_PORT="${RPC_PORT:-8545}"
WS_PORT="${WS_PORT:-8546}"
P2P_PORT="${P2P_PORT:-30305}"
STORAGE_SIZE="${STORAGE_SIZE:-200}"
CHAIN_ID="${CHAIN_ID:-13370}"
RATE_LIMIT="${RATE_LIMIT:-100}"

DOMAIN="${DOMAIN:-rpc.netlifegy.com}"
UPSTREAM_RPC="https://rpc.netlifegy.com"

REPO_URL="${REPO_URL:-https://github.com/hc172808/rpcnode.git}"
REPO_DIR="${REPO_DIR:-/opt/gyds-rpcnode}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain RPC NODE Installer v${GYDS_VERSION}                               ║"
echo "║   Chain ID: ${CHAIN_ID}  |  netlifegy.com                            ║"
echo "║   Repo: github.com/hc172808/rpcnode                                 ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || { err "Run as root (sudo)."; exit 1; }

# ─── 0. Clone repo ───────────────────────────────────────────────────────────
log "[0/8] Fetching rpcnode source from ${REPO_URL}..."
if [[ -d "$REPO_DIR/.git" ]]; then
    git -C "$REPO_DIR" pull --ff-only
else
    git clone --depth=1 "$REPO_URL" "$REPO_DIR"
fi
[[ -f "$REPO_DIR/go.mod" ]] || { err "go.mod not found in ${REPO_DIR}"; exit 1; }

# ─── 1. System packages ──────────────────────────────────────────────────────
log "[1/8] Installing packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq build-essential git curl wget jq ufw fail2ban nginx certbot python3-certbot-nginx openssl ca-certificates

# ─── 2. Go ───────────────────────────────────────────────────────────────────
log "[2/8] Installing Go ${GO_VERSION}..."
if ! command -v go >/dev/null || [[ "$(go version | awk '{print $3}')" != "go${GO_VERSION}" ]]; then
    cd /tmp
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O go.tgz
    rm -rf /usr/local/go && tar -C /usr/local -xzf go.tgz && rm go.tgz
    ln -sf /usr/local/go/bin/go /usr/local/bin/go
fi
log "    $(go version)"

# ─── 3. User & dirs ──────────────────────────────────────────────────────────
log "[3/8] Setting up ${GYDS_USER} user..."
id -u "$GYDS_USER" >/dev/null 2>&1 || useradd --system -m -d "$GYDS_HOME" -s /bin/bash "$GYDS_USER"
mkdir -p "$GYDS_HOME"/{data,logs,config} "$LOG_DIR"
chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME" "$LOG_DIR"

# ─── 4. Build binary ─────────────────────────────────────────────────────────
log "[4/8] Building gyds-rpcnode..."
BUILD_TMP="$(mktemp -d)"
cp -r "$REPO_DIR" "$BUILD_TMP/rpcnode-src"
chown -R "$GYDS_USER:$GYDS_USER" "$BUILD_TMP"

CMD_PATH="."
[[ -d "$BUILD_TMP/rpcnode-src/cmd/rpcnode" ]] && CMD_PATH="./cmd/rpcnode"

sudo -u "$GYDS_USER" -H env HOME="$GYDS_HOME" PATH="$PATH" \
    bash -c "cd '$BUILD_TMP/rpcnode-src' && go mod download && go build -ldflags '-s -w -X main.Version=${GYDS_VERSION}' -o '$BUILD_TMP/gyds-rpcnode' ${CMD_PATH}"
install -m 0755 -o root -g root "$BUILD_TMP/gyds-rpcnode" "$GYDS_BIN/gyds-rpcnode"
rm -rf "$BUILD_TMP"
log "    Installed: $GYDS_BIN/gyds-rpcnode"

# ─── 5. Firewall ─────────────────────────────────────────────────────────────
log "[5/8] Configuring firewall..."
ufw allow ssh >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow "$P2P_PORT/tcp" comment 'GYDS RPC P2P' >/dev/null
ufw allow "$P2P_PORT/udp" comment 'GYDS RPC P2P' >/dev/null
ufw --force enable >/dev/null

# Bind RPC port to localhost only (proxied by nginx)
cat >> /etc/ufw/before.rules <<'UFWEOF' 2>/dev/null || true
# Block direct external access to RPC port (use nginx proxy)
UFWEOF

# ─── 6. Nginx reverse proxy ──────────────────────────────────────────────────
log "[6/8] Configuring Nginx RPC reverse proxy..."
NGINX_CONF="/etc/nginx/sites-available/gyds-rpc"
tee "$NGINX_CONF" > /dev/null << EOF
# Rate limiting zone
limit_req_zone \$binary_remote_addr zone=rpc_limit:10m rate=${RATE_LIMIT}r/s;

server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        limit_req zone=rpc_limit burst=200 nodelay;

        proxy_pass         http://127.0.0.1:${RPC_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;

        # CORS for dApps
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        if (\$request_method = OPTIONS) { return 204; }
    }

    location /ws {
        proxy_pass         http://127.0.0.1:${WS_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 86400s;
    }

    location /health {
        access_log off;
        add_header Content-Type "application/json";
        return 200 '{"status":"ok","chain":${CHAIN_ID},"node":"rpc"}';
    }

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
}
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx

# ─── 7. systemd unit ─────────────────────────────────────────────────────────
log "[7/8] Installing systemd service..."
cat > /etc/systemd/system/gyds-rpcnode.service <<EOF
[Unit]
Description=GYDSchain RPC Node v${GYDS_VERSION}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${GYDS_USER}
Group=${GYDS_USER}
WorkingDirectory=${GYDS_HOME}
ExecStart=${GYDS_BIN}/gyds-rpcnode \
    --datadir=${GYDS_HOME}/data \
    --rpcport=${RPC_PORT} \
    --wsport=${WS_PORT} \
    --p2pport=${P2P_PORT} \
    --chain-id=${CHAIN_ID} \
    --rpc-bind=127.0.0.1 \
    --upstream=${UPSTREAM_RPC}
Restart=always
RestartSec=10
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/rpcnode.log
StandardError=append:${LOG_DIR}/rpcnode-error.log
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
ReadWritePaths=${GYDS_HOME} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable gyds-rpcnode >/dev/null 2>&1

# ─── 8. Config file ──────────────────────────────────────────────────────────
log "[8/8] Writing node config..."
cat > "$GYDS_HOME/config/node.toml" <<EOF
[node]
type     = "rpcnode"
chain_id = ${CHAIN_ID}
version  = "${GYDS_VERSION}"

[rpc]
port     = ${RPC_PORT}
bind     = "127.0.0.1"
upstream = "${UPSTREAM_RPC}"

[websocket]
port = ${WS_PORT}

[network]
p2p_port  = ${P2P_PORT}
max_peers = 100

[rate_limit]
requests_per_second = ${RATE_LIMIT}

[storage]
data_dir    = "${GYDS_HOME}/data"
max_size_gb = ${STORAGE_SIZE}
EOF
chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME"
systemctl restart gyds-rpcnode || true

LOCAL_IP="$(hostname -I | awk '{print $1}')"
cat <<EOF

╔═══════════════════════════════════════════════════════════════════════╗
║   ✅ GYDSchain RPC Node installed                                     ║
╚═══════════════════════════════════════════════════════════════════════╝
  Repo:        ${REPO_URL}
  Binary:      ${GYDS_BIN}/gyds-rpcnode
  Service:     gyds-rpcnode.service
  Data dir:    ${GYDS_HOME}/data
  Logs:        ${LOG_DIR}/rpcnode.log

  Public RPC:  https://${DOMAIN}         (via nginx)
  Public WS:   wss://${DOMAIN}/ws        (via nginx)
  Internal:    http://127.0.0.1:${RPC_PORT}
  P2P:         ${LOCAL_IP}:${P2P_PORT}
  Chain ID:    ${CHAIN_ID}
  Rate limit:  ${RATE_LIMIT} req/s per IP

  Manage:
    systemctl status gyds-rpcnode
    journalctl -u gyds-rpcnode -f
EOF
