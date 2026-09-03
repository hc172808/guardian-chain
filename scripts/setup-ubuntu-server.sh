#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain — Ubuntu 22.04 LTS Server Setup
#  Prepares a bare server: hardens OS, installs deps, builds node binary.
#  Run:  sudo bash setup-ubuntu-server.sh [options]
#
#  Options:
#    --domain DOMAIN        Your domain (default: netlifegy.com)
#    --email  EMAIL         SSL cert email (default: admin@netlifegy.com)
#    --cloudflare-tunnel    Use Cloudflare Tunnel (skips SSL, HTTP-only nginx)
#    --skip-nginx           Skip nginx install/config
#    --skip-ssl             Skip Let's Encrypt SSL
#    --skip-wireguard       Skip WireGuard VPN install
#    --with-postgres        Also install & configure PostgreSQL 16 (local DB)
#    --with-pgadmin         Also install pgAdmin 4 web UI (implies --with-postgres)
#    --non-interactive      Use defaults, no prompts
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
GYDS_VERSION="2.1.0"
GO_VERSION="1.22.5"
GYDS_USER="${GYDS_USER:-gydschain}"
GYDS_HOME="${GYDS_HOME:-/var/lib/gydschain}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-/var/log/gydschain}"
CHAIN_ID="198282"
RPC_PORT="${RPC_PORT:-8546}"
P2P_PORT="${P2P_PORT:-30303}"
WG_PORT="${WG_PORT:-51820}"
DOMAIN="${DOMAIN:-netlifegy.com}"
SSL_EMAIL="${SSL_EMAIL:-admin@netlifegy.com}"
SKIP_NGINX=false
SKIP_SSL=false
SKIP_WIREGUARD=false
WITH_POSTGRES="${WITH_POSTGRES:-false}"
WITH_PGADMIN="${WITH_PGADMIN:-false}"
NON_INTERACTIVE=false
CLOUDFLARE_TUNNEL=false

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
log()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()   { echo -e "${YELLOW}[!]${NC} $*"; }
err()    { echo -e "${RED}[✗]${NC} $*" >&2; }
info()   { echo -e "${CYAN}[i]${NC} $*"; }
header() { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════${NC}"; \
           echo -e "${BOLD}  $*${NC}"; \
           echo -e "${BOLD}${CYAN}══════════════════════════════════════${NC}\n"; }

# ─── Parse args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)             DOMAIN="$2";          shift 2 ;;
    --email)              SSL_EMAIL="$2";        shift 2 ;;
    --cloudflare-tunnel)  CLOUDFLARE_TUNNEL=true; SKIP_SSL=true; shift ;;
    --skip-nginx)         SKIP_NGINX=true;       shift ;;
    --skip-ssl)           SKIP_SSL=true;         shift ;;
    --skip-wireguard)     SKIP_WIREGUARD=true;   shift ;;
    --with-postgres)      WITH_POSTGRES=true;    shift ;;
    --with-pgadmin)       WITH_PGADMIN=true; WITH_POSTGRES=true; shift ;;
    --non-interactive)    NON_INTERACTIVE=true;  shift ;;
    --help|-h)
      grep '^#  ' "$0" | sed 's/^#  //'
      exit 0 ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Root check ──────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || { err "Run as root: sudo bash $0"; exit 1; }

# ─── Banner ──────────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
cat << 'EOF'
   ██████╗ ██╗   ██╗██████╗ ███████╗ ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗
  ██╔════╝ ╚██╗ ██╔╝██╔══██╗██╔════╝██╔════╝██║  ██║██╔══██╗██║████╗  ██║
  ██║  ███╗ ╚████╔╝ ██║  ██║███████╗██║     ███████║███████║██║██╔██╗ ██║
  ██║   ██║  ╚██╔╝  ██║  ██║╚════██║██║     ██╔══██║██╔══██║██║██║╚██╗██║
  ╚██████╔╝   ██║   ██████╔╝███████║╚██████╗██║  ██║██║  ██║██║██║ ╚████║
   ╚═════╝    ╚═╝   ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝
EOF
echo -e "${NC}${BOLD}  Ubuntu 22.04 Server Setup — Chain ID ${CHAIN_ID} — ${DOMAIN}${NC}"
[[ "$CLOUDFLARE_TUNNEL" == "true" ]] && \
  echo -e "${CYAN}  Mode: Cloudflare Tunnel (HTTP-only origin, TLS handled by CF)${NC}"
echo ""

# ─── Locate source dir ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="${SRC_DIR:-$REPO_ROOT/public/blockchain-go}"

if [[ ! -d "$SRC_DIR/cmd/fullnode" ]]; then
  warn "blockchain-go source not found at: $SRC_DIR"
  warn "Binary build will be skipped. Set SRC_DIR=/path/to/blockchain-go to override."
  BUILD_BINARY=false
else
  BUILD_BINARY=true
  log "Source found: $SRC_DIR"
fi

# ═════════════════════════════════════════════════════════════════════════════
header "Step 1/8 — System Update & Core Packages"
# ═════════════════════════════════════════════════════════════════════════════
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  build-essential git curl wget jq ufw fail2ban unzip openssl ca-certificates \
  htop tmux net-tools dnsutils lsof rsync logrotate \
  nginx \
  postgresql-client \
  wireguard wireguard-tools \
  prometheus-node-exporter 2>/dev/null || true

# Only install certbot when not using Cloudflare Tunnel
if [[ "$CLOUDFLARE_TUNNEL" == "false" ]]; then
  apt-get install -y -qq certbot python3-certbot-nginx 2>/dev/null || true
fi

log "Core packages installed"

# ═════════════════════════════════════════════════════════════════════════════
header "Step 2/8 — Go ${GO_VERSION}"
# ═════════════════════════════════════════════════════════════════════════════
INSTALLED_GO="$(go version 2>/dev/null | awk '{print $3}' || true)"
if [[ "$INSTALLED_GO" != "go${GO_VERSION}" ]]; then
  info "Installing Go ${GO_VERSION}..."
  cd /tmp
  wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O go.tgz
  rm -rf /usr/local/go
  tar -C /usr/local -xzf go.tgz
  rm go.tgz
  ln -sf /usr/local/go/bin/go    /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile.d/golang.sh
  log "Go installed: $(go version)"
else
  log "Go already at ${GO_VERSION}"
fi

# ═════════════════════════════════════════════════════════════════════════════
header "Step 3/8 — System User & Directories"
# ═════════════════════════════════════════════════════════════════════════════
if ! id -u "$GYDS_USER" >/dev/null 2>&1; then
  useradd --system -m -d "$GYDS_HOME" -s /bin/bash "$GYDS_USER"
  log "Created user: $GYDS_USER"
else
  log "User already exists: $GYDS_USER"
fi

mkdir -p \
  "$GYDS_HOME"/{data,logs,keys,config,backups} \
  "$LOG_DIR"

chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME" "$LOG_DIR"
log "Directories ready: $GYDS_HOME"

# ═════════════════════════════════════════════════════════════════════════════
header "Step 4/8 — Build Binary"
# ═════════════════════════════════════════════════════════════════════════════
if [[ "$BUILD_BINARY" == "true" ]]; then
  info "Building gyds-fullnode from $SRC_DIR ..."
  BUILD_TMP="$(mktemp -d)"
  cp -r "$SRC_DIR" "$BUILD_TMP/blockchain-go"
  chown -R "$GYDS_USER:$GYDS_USER" "$BUILD_TMP"

  sudo -u "$GYDS_USER" -H env HOME="$GYDS_HOME" PATH="$PATH" \
    bash -c "cd '$BUILD_TMP/blockchain-go' && go mod download && \
             go build -ldflags '-s -w -X main.Version=${GYDS_VERSION}' \
             -o '$BUILD_TMP/gyds-fullnode' ./cmd/fullnode && \
             go build -ldflags '-s -w' \
             -o '$BUILD_TMP/gyds-litenode' ./cmd/litenode && \
             go build -ldflags '-s -w' \
             -o '$BUILD_TMP/gyds-bootnode' ./cmd/bootnode"

  install -m 0755 -o root -g root "$BUILD_TMP/gyds-fullnode"  "$GYDS_BIN/gyds-fullnode"
  install -m 0755 -o root -g root "$BUILD_TMP/gyds-litenode"  "$GYDS_BIN/gyds-litenode"
  install -m 0755 -o root -g root "$BUILD_TMP/gyds-bootnode"  "$GYDS_BIN/gyds-bootnode"
  rm -rf "$BUILD_TMP"
  log "Binaries installed to $GYDS_BIN"
else
  warn "Skipping binary build (source not found). Install binaries manually."
fi

# ═════════════════════════════════════════════════════════════════════════════
header "Step 5/8 — Firewall (ufw)"
# ═════════════════════════════════════════════════════════════════════════════
ufw --force reset >/dev/null 2>&1 || true
ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null
ufw allow ssh              >/dev/null
ufw limit ssh/tcp          >/dev/null

if [[ "$CLOUDFLARE_TUNNEL" == "true" ]]; then
  # Cloudflare Tunnel connects outbound — no need to expose 80/443 publicly.
  # Only open what peers and miners need to reach directly.
  info "Cloudflare Tunnel mode: skipping public 80/443 (tunnel is outbound)"
else
  ufw allow 80/tcp  comment 'HTTP'  >/dev/null
  ufw allow 443/tcp comment 'HTTPS' >/dev/null
fi

ufw allow "$P2P_PORT/tcp" comment 'GYDS P2P TCP'  >/dev/null
ufw allow "$P2P_PORT/udp" comment 'GYDS P2P UDP'  >/dev/null
ufw allow "$RPC_PORT/tcp" comment 'GYDS RPC'      >/dev/null
ufw allow "$WG_PORT/udp"  comment 'WireGuard VPN' >/dev/null
ufw allow 9100/tcp comment 'Prometheus node exporter' >/dev/null
ufw --force enable >/dev/null
log "Firewall configured (ufw)"

# ═════════════════════════════════════════════════════════════════════════════
header "Step 6/8 — Fail2ban"
# ═════════════════════════════════════════════════════════════════════════════
cat > /etc/fail2ban/jail.d/gydschain.conf <<EOF
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled  = true
maxretry = 5
bantime  = 86400

[gyds-rpc]
enabled  = true
port     = ${RPC_PORT}
filter   = gyds-rpc
logpath  = ${LOG_DIR}/fullnode.log
maxretry = 20
bantime  = 1800
findtime = 300
EOF

cat > /etc/fail2ban/filter.d/gyds-rpc.conf <<'EOF'
[Definition]
failregex = rate limit exceeded.*<HOST>
            unauthorized.*<HOST>
            invalid request.*<HOST>
ignoreregex =
EOF

systemctl enable fail2ban --quiet
systemctl restart fail2ban
log "Fail2ban configured"

# ═════════════════════════════════════════════════════════════════════════════
header "Step 7/8 — Nginx"
# ═════════════════════════════════════════════════════════════════════════════
if [[ "$SKIP_NGINX" == "false" ]]; then

  if [[ "$CLOUDFLARE_TUNNEL" == "true" ]]; then
    # ── Cloudflare Tunnel mode ────────────────────────────────────────────────
    # Nginx listens on plain HTTP (0.0.0.0:80).
    # Cloudflare terminates TLS and forwards HTTP to localhost:80 via the tunnel.
    # Real visitor IPs are restored from the CF-Connecting-IP header.
    cat > /etc/nginx/sites-available/gydschain <<EOF
# GYDSchain — ${DOMAIN}
# Cloudflare Tunnel mode: HTTP origin only, TLS terminated by Cloudflare
# Generated by setup-ubuntu-server.sh --cloudflare-tunnel

# Restore real visitor IP from Cloudflare headers
set_real_ip_from 0.0.0.0/0;
real_ip_header   CF-Connecting-IP;

limit_req_zone  \$binary_remote_addr zone=rpc_limit:10m rate=10r/s;
limit_conn_zone \$binary_remote_addr zone=conn_limit:10m;

upstream gyds_rpc {
    server 127.0.0.1:${RPC_PORT};
    keepalive 32;
}

# ── RPC endpoints (rpc.* rpc2.* rpc3.*) ───────────────────────────────────
server {
    listen 0.0.0.0:80;
    server_name rpc.${DOMAIN} rpc2.${DOMAIN} rpc3.${DOMAIN};

    location / {
        limit_req zone=rpc_limit burst=30 nodelay;
        limit_conn conn_limit 20;

        proxy_pass http://gyds_rpc;
        proxy_http_version 1.1;
        proxy_set_header Host             \$host;
        proxy_set_header X-Real-IP        \$remote_addr;
        proxy_set_header X-Forwarded-For  \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout    30s;
        proxy_connect_timeout  5s;

        add_header Access-Control-Allow-Origin  "*" always;
        add_header Access-Control-Allow-Methods "POST, GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        if (\$request_method = 'OPTIONS') { return 204; }
    }
}

# ── WebSocket endpoint (ws.*) ──────────────────────────────────────────────
server {
    listen 0.0.0.0:80;
    server_name ws.${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${RPC_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade          \$http_upgrade;
        proxy_set_header Connection       "upgrade";
        proxy_set_header Host             \$host;
        proxy_set_header X-Real-IP        \$remote_addr;
        proxy_set_header X-Forwarded-For  \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 3600s;
    }
}

# ── Dashboard / main domain ────────────────────────────────────────────────
server {
    listen 0.0.0.0:80;
    server_name ${DOMAIN} www.${DOMAIN};

    root  /var/www/gydschain;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3030/;
        proxy_set_header Host            \$host;
        proxy_set_header X-Real-IP       \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
}
EOF

  else
    # ── Standard mode (direct IP / Let's Encrypt) ─────────────────────────────
    cat > /etc/nginx/sites-available/gydschain <<EOF
# GYDSchain — ${DOMAIN}
# Generated by setup-ubuntu-server.sh

limit_req_zone \$binary_remote_addr zone=rpc_limit:10m rate=10r/s;
limit_conn_zone \$binary_remote_addr zone=conn_limit:10m;

upstream gyds_rpc {
    server 127.0.0.1:${RPC_PORT};
    keepalive 32;
}

server {
    listen 80;
    server_name rpc.${DOMAIN} rpc2.${DOMAIN} rpc3.${DOMAIN}
                ws.${DOMAIN} ${DOMAIN} www.${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name rpc.${DOMAIN} rpc2.${DOMAIN} rpc3.${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/rpc.${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rpc.${DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location / {
        limit_req zone=rpc_limit burst=30 nodelay;
        limit_conn conn_limit 20;

        proxy_pass http://gyds_rpc;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
        proxy_connect_timeout 5s;

        add_header Access-Control-Allow-Origin  "*" always;
        add_header Access-Control-Allow-Methods "POST, GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        if (\$request_method = 'OPTIONS') { return 204; }
    }
}

server {
    listen 443 ssl http2;
    server_name ws.${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/ws.${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ws.${DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:${RPC_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;
    }
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    root /var/www/gydschain;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3030/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
}
EOF
  fi

  ln -sf /etc/nginx/sites-available/gydschain /etc/nginx/sites-enabled/gydschain
  rm -f /etc/nginx/sites-enabled/default
  mkdir -p /var/www/gydschain
  nginx -t 2>/dev/null && systemctl reload nginx || warn "Nginx config error — check manually"
  log "Nginx configured for ${DOMAIN}"
else
  warn "Nginx skipped (--skip-nginx)"
fi

# ═════════════════════════════════════════════════════════════════════════════
header "Step 8/8 — SSL (Let's Encrypt)"
# ═════════════════════════════════════════════════════════════════════════════
if [[ "$CLOUDFLARE_TUNNEL" == "true" ]]; then
  info "Cloudflare Tunnel mode: SSL is handled by Cloudflare — skipping certbot"
elif [[ "$SKIP_SSL" == "false" ]]; then
  if [[ "$NON_INTERACTIVE" == "false" ]]; then
    read -rp "  Issue SSL certificates for ${DOMAIN}? (y/N): " DO_SSL
    [[ "$DO_SSL" =~ ^[Yy]$ ]] || SKIP_SSL=true
  fi

  if [[ "$SKIP_SSL" == "false" ]]; then
    for SUB in "" "www" "rpc" "rpc2" "rpc3" "ws"; do
      FQDN="${SUB:+${SUB}.}${DOMAIN}"
      certbot certonly --nginx --non-interactive --agree-tos \
        --email "$SSL_EMAIL" -d "$FQDN" 2>/dev/null && \
        log "SSL issued: $FQDN" || warn "SSL failed for $FQDN (DNS may not be set yet)"
    done
    systemctl enable certbot.timer --quiet 2>/dev/null || true
    log "Auto-renewal enabled"
  fi
else
  warn "SSL skipped (--skip-ssl)"
fi

# ─── WireGuard (optional) ────────────────────────────────────────────────────
if [[ "$SKIP_WIREGUARD" == "false" ]]; then
  if [[ ! -f /etc/wireguard/wg0.conf ]]; then
    WG_PRIVATE="$(wg genkey)"
    WG_PUBLIC="$(echo "$WG_PRIVATE" | wg pubkey)"
    cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address    = 10.0.0.1/24
ListenPort = ${WG_PORT}
PrivateKey = ${WG_PRIVATE}

# Add peers with:
# [Peer]
# PublicKey  = <client-pubkey>
# AllowedIPs = 10.0.0.x/32
EOF
    chmod 600 /etc/wireguard/wg0.conf
    systemctl enable wg-quick@wg0 --quiet 2>/dev/null || true
    systemctl start  wg-quick@wg0 2>/dev/null || true
    log "WireGuard VPN configured (server pubkey: $WG_PUBLIC)"
    echo "  ↳ Save this public key → give to peers: ${BOLD}${WG_PUBLIC}${NC}"
  else
    log "WireGuard already configured"
  fi
else
  warn "WireGuard skipped (--skip-wireguard)"
fi

# ─── Log rotation ────────────────────────────────────────────────────────────
cat > /etc/logrotate.d/gydschain <<EOF
${LOG_DIR}/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        systemctl kill -s HUP gyds-fullnode 2>/dev/null || true
    endscript
}
EOF
log "Log rotation configured"

# ─── System tuning ───────────────────────────────────────────────────────────
cat >> /etc/sysctl.d/99-gydschain.conf <<'EOF'
# GYDSchain network tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.core.netdev_max_backlog = 65535
fs.file-max = 2097152
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
EOF
sysctl -p /etc/sysctl.d/99-gydschain.conf >/dev/null 2>&1 || true

cat >> /etc/security/limits.d/gydschain.conf <<EOF
${GYDS_USER} soft nofile 65535
${GYDS_USER} hard nofile 65535
EOF
log "System limits tuned"

# ─── Summary ─────────────────────────────────────────────────────────────────
PUB_IP="$(curl -fsS4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"

echo ""
echo -e "${BOLD}${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║   ✅  GYDSchain Server Setup Complete                                 ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  ${BOLD}Server IP:${NC}     ${PUB_IP}"
echo -e "  ${BOLD}Domain:${NC}        ${DOMAIN}"
echo -e "  ${BOLD}Chain ID:${NC}      ${CHAIN_ID}"
echo -e "  ${BOLD}GYDS User:${NC}     ${GYDS_USER}  (home: ${GYDS_HOME})"
echo ""

if [[ "$CLOUDFLARE_TUNNEL" == "true" ]]; then
  echo -e "  ${BOLD}${CYAN}Mode: Cloudflare Tunnel${NC}"
  echo -e "  Nginx listens on ${BOLD}0.0.0.0:80${NC} (plain HTTP)."
  echo -e "  Cloudflare handles HTTPS — no certs needed on this server."
  echo ""
  echo -e "  ${BOLD}Ports open:${NC}"
  echo -e "    22/tcp       SSH"
  echo -e "    ${RPC_PORT}/tcp     GYDS RPC  (also routed via CF tunnel)"
  echo -e "    ${P2P_PORT}/tcp+udp GYDS P2P"
  echo -e "    ${WG_PORT}/udp     WireGuard VPN"
  echo ""
  echo -e "  ${BOLD}Next steps — Cloudflare Tunnel:${NC}"
  echo -e "    1. Install cloudflared:"
  echo -e "       ${CYAN}curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb${NC}"
  echo -e "       ${CYAN}dpkg -i /tmp/cloudflared.deb${NC}"
  echo ""
  echo -e "    2. Authenticate (opens a browser link — run on your local machine if headless):"
  echo -e "       ${CYAN}cloudflared tunnel login${NC}"
  echo ""
  echo -e "    3. Create the tunnel:"
  echo -e "       ${CYAN}cloudflared tunnel create gydschain${NC}"
  echo ""
  echo -e "    4. Create /etc/cloudflared/config.yml:"
  echo -e "       ${CYAN}tunnel: gydschain${NC}"
  echo -e "       ${CYAN}credentials-file: /root/.cloudflared/<TUNNEL-ID>.json${NC}"
  echo -e "       ${CYAN}ingress:${NC}"
  echo -e "       ${CYAN}  - hostname: ${DOMAIN}${NC}"
  echo -e "       ${CYAN}    service: http://localhost:80${NC}"
  echo -e "       ${CYAN}  - hostname: rpc.${DOMAIN}${NC}"
  echo -e "       ${CYAN}    service: http://localhost:80${NC}"
  echo -e "       ${CYAN}  - hostname: ws.${DOMAIN}${NC}"
  echo -e "       ${CYAN}    service: http://localhost:80${NC}"
  echo -e "       ${CYAN}  - service: http_status:404${NC}"
  echo ""
  echo -e "    5. Install & start tunnel as a service:"
  echo -e "       ${CYAN}cloudflared service install${NC}"
  echo -e "       ${CYAN}systemctl enable --now cloudflared${NC}"
  echo ""
  echo -e "    6. In Cloudflare dashboard → DNS: the tunnel creates CNAME records automatically."
  echo -e "       Set SSL/TLS mode to ${BOLD}Full${NC} (not Full Strict) for http-origin."
  echo ""
  echo -e "    7. Run:  ${CYAN}sudo bash scripts/setup-validator-node.sh${NC}"
  echo -e "    8. Monitor: ${CYAN}journalctl -u gyds-fullnode -f${NC}"
else
  echo -e "  ${BOLD}Ports open:${NC}"
  echo -e "    80/443     HTTP/HTTPS (nginx)"
  echo -e "    ${RPC_PORT}/tcp     GYDS RPC"
  echo -e "    ${P2P_PORT}/tcp+udp GYDS P2P"
  echo -e "    ${WG_PORT}/udp     WireGuard VPN"
  echo ""
  echo -e "  ${BOLD}Next steps:${NC}"
  echo -e "    1. Point DNS → ${PUB_IP}  (A records for ${DOMAIN}, rpc.*, ws.*)"
  echo -e "    2. Run:  ${CYAN}sudo bash scripts/setup-validator-node.sh${NC}"
  echo -e "    3. Monitor: ${CYAN}journalctl -u gyds-fullnode -f${NC}"
fi
echo ""
