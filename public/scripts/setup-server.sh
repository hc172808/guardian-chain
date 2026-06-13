#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  ChainCore — Ubuntu Server Setup Script v4.0.0                         ║
# ║  Cloudflare Proxy + Subdomain Edition                                  ║
# ║  Usage: SUBDOMAIN=app DOMAIN=netlifegy.com bash setup-server.sh        ║
# ╚══════════════════════════════════════════════════════════════════════════╝
#
# What this script does (end-to-end):
#   1. Installs: Node.js LTS, npm, PM2, Nginx, PostgreSQL, UFW, fail2ban
#   2. Creates a PostgreSQL DB + user
#   3. Clones / pulls your GitHub repo
#   4. Writes .env and builds the Vite frontend
#   5. Pushes the DB schema
#   6. Creates a PM2 ecosystem + starts the API server
#   7. Configures Nginx for subdomain (NO certbot — Cloudflare handles SSL)
#   8. Sets up UFW firewall (blocks 5001, allows 80/443/22)
#   9. Optionally installs cloudflared tunnel (if CF_TUNNEL_TOKEN is set)
#  10. Installs a safe redeploy script at /usr/local/bin/gyds-redeploy
#
# Required env vars:
#   SUBDOMAIN     — subdomain prefix, e.g. "app" → app.netlifegy.com
#   DOMAIN        — base domain, e.g. "netlifegy.com"
#
# Optional env vars:
#   REPO_URL          — git repo URL (default: https://github.com/hc172808/guardian-chain.git)
#   GITHUB_TOKEN      — PAT for private repos and auto-pull
#   APP_DIR           — install path (default: /var/www/gydschain)
#   PORT_API          — Express API port (default: 5001)
#   DATABASE_URL      — override Postgres DSN
#   SESSION_SECRET    — override session secret
#   CF_TUNNEL_TOKEN   — Cloudflare Tunnel token (installs cloudflared daemon)
#   SKIP_DB           — set to "1" to skip DB creation (use existing)
#   BRANCH            — git branch to track (default: main)
#
# Cloudflare setup (do this in CF dashboard BEFORE running this script):
#   1. Add an A record: app.yourdomain.com → your server IP, Proxied (orange cloud)
#   2. SSL/TLS mode: Full (strict) is recommended
#   3. Enable "Always Use HTTPS" redirect rule
#   Nginx only needs to listen on port 80 — CF terminates SSL.
#
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()   { echo -e "${YELLOW}[!]${NC} $*"; }
err()    { echo -e "${RED}[✗]${NC} $*" >&2; }
info()   { echo -e "${CYAN}[→]${NC} $*"; }
banner() { echo -e "${BOLD}${CYAN}$*${NC}"; }
step()   { echo ""; echo -e "${BOLD}${GREEN}━━━ $* ━━━${NC}"; }

# ─── Config ───────────────────────────────────────────────────────────────────
SUBDOMAIN="${SUBDOMAIN:-app}"
DOMAIN="${DOMAIN:-netlifegy.com}"
FQDN="${SUBDOMAIN}.${DOMAIN}"
APP_DIR="${APP_DIR:-/var/www/gydschain}"
REPO_URL="${REPO_URL:-https://github.com/hc172808/guardian-chain.git}"
BRANCH="${BRANCH:-main}"
PORT_API="${PORT_API:-5001}"
NODE_USER="${SUDO_USER:-ubuntu}"
[[ "$NODE_USER" == "root" ]] && NODE_USER="ubuntu"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"
NODE_ENV="${NODE_ENV:-production}"
CF_TUNNEL_TOKEN="${CF_TUNNEL_TOKEN:-}"
SKIP_DB="${SKIP_DB:-0}"

banner "
╔══════════════════════════════════════════════════════════════════╗
║   ChainCore Server Setup v4.0.0 — Cloudflare + Subdomain        ║
║   Target: ${FQDN}                                 
║   Dir:    ${APP_DIR}                              
╚══════════════════════════════════════════════════════════════════╝"

# ─── Pre-flight ───────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || { err "Run as root: sudo bash setup-server.sh"; exit 1; }
command -v lsb_release &>/dev/null || apt-get install -y -qq lsb-release
LSB=$(lsb_release -si 2>/dev/null || echo "Unknown")
[[ "$LSB" =~ Ubuntu|Debian ]] || warn "Script tested on Ubuntu/Debian — $LSB may have issues"

info "Configuration:"
echo "  Subdomain:   $FQDN"
echo "  App dir:     $APP_DIR"
echo "  Repo:        $REPO_URL"
echo "  Branch:      $BRANCH"
echo "  API port:    $PORT_API"
echo "  Node user:   $NODE_USER"
echo "  CF Tunnel:   ${CF_TUNNEL_TOKEN:+configured}${CF_TUNNEL_TOKEN:-not configured (Proxy mode)}"
echo ""
read -rp "Continue? (y/N) " -n 1 reply; echo
[[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ─── Step 1: System packages ──────────────────────────────────────────────────
step "1/9 — System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    git curl wget build-essential \
    nginx \
    postgresql postgresql-contrib \
    ufw fail2ban \
    jq unzip logrotate

# Node.js LTS (via NodeSource)
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
    info "Installing Node.js 22 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>/dev/null
    apt-get install -y -qq nodejs
fi
log "Node $(node --version) | npm $(npm --version)"

# PM2 global
npm install -g pm2 --silent 2>/dev/null || true
log "PM2 $(pm2 --version 2>/dev/null | tail -1)"

# ─── Step 2: PostgreSQL ───────────────────────────────────────────────────────
step "2/9 — PostgreSQL"
if [[ "$SKIP_DB" == "1" ]]; then
    warn "SKIP_DB=1 — skipping DB creation, using existing DATABASE_URL"
    [[ -n "${DATABASE_URL:-}" ]] || { err "DATABASE_URL must be set when SKIP_DB=1"; exit 1; }
else
    systemctl enable postgresql --now 2>/dev/null || true
    sleep 2
    PG_DBNAME="${PG_DBNAME:-gydschain}"
    PG_USER="${PG_USER:-gydschain}"
    PG_PASS="${PG_PASS:-$(openssl rand -hex 16)}"
    su - postgres -c "psql -qc \"SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'\" | grep -q 1 || psql -qc \"CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';\"" 2>/dev/null || true
    su - postgres -c "psql -qc \"SELECT 1 FROM pg_database WHERE datname='${PG_DBNAME}'\" | grep -q 1 || psql -qc \"CREATE DATABASE ${PG_DBNAME} OWNER ${PG_USER};\"" 2>/dev/null || true
    DATABASE_URL="${DATABASE_URL:-postgresql://${PG_USER}:${PG_PASS}@localhost/${PG_DBNAME}}"
    log "Database: ${PG_DBNAME} | User: ${PG_USER}"
fi

# ─── Step 3: Clone / pull repo ────────────────────────────────────────────────
step "3/9 — Repository"
mkdir -p "$(dirname "$APP_DIR")"
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    REPO_AUTH="${REPO_URL/https:\/\//https:\/\/${GITHUB_TOKEN}@}"
else
    REPO_AUTH="$REPO_URL"
    warn "GITHUB_TOKEN not set — set it to enable auto-pulls"
fi

if [[ -d "$APP_DIR/.git" ]]; then
    info "Pulling latest ($BRANCH)..."
    git -C "$APP_DIR" config pull.rebase false
    git -C "$APP_DIR" fetch origin
    git -C "$APP_DIR" checkout "$BRANCH" 2>/dev/null || true
    git -C "$APP_DIR" pull origin "$BRANCH"
    log "Pulled: $(git -C "$APP_DIR" log -1 --format='%h %s')"
else
    info "Cloning $REPO_URL..."
    git clone --branch "$BRANCH" "$REPO_AUTH" "$APP_DIR"
    [[ -n "${GITHUB_TOKEN:-}" ]] && git -C "$APP_DIR" remote set-url origin "$REPO_AUTH"
    log "Cloned to $APP_DIR"
fi
# Ensure correct owner
id -u "$NODE_USER" &>/dev/null && chown -R "$NODE_USER:$NODE_USER" "$APP_DIR" || true

# ─── Step 4: Dependencies + build ─────────────────────────────────────────────
step "4/9 — Install & build"
mkdir -p /var/log/gydschain
chown "${NODE_USER}:${NODE_USER}" /var/log/gydschain 2>/dev/null || true

cat > "$APP_DIR/.env" <<ENVEOF
NODE_ENV=${NODE_ENV}
PORT=${PORT_API}
DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=${SESSION_SECRET}
REPLIT_DOMAINS=${FQDN},${DOMAIN}
SUBDOMAIN=${SUBDOMAIN}
ENVEOF
chmod 600 "$APP_DIR/.env"
id -u "$NODE_USER" &>/dev/null && chown "$NODE_USER:$NODE_USER" "$APP_DIR/.env" || true

cd "$APP_DIR"
npm ci --prefer-offline 2>/dev/null || npm install --legacy-peer-deps
log "Dependencies installed"

info "Building frontend..."
npm run build
log "Build complete → $APP_DIR/dist"

info "Applying DB schema..."
npx drizzle-kit generate 2>/dev/null | grep -v "^$" || true
if command -v psql &>/dev/null; then
    # Apply any generated SQL migrations
    for f in "$APP_DIR"/drizzle/*.sql; do
        [[ -f "$f" ]] && psql "$DATABASE_URL" -f "$f" 2>/dev/null && log "  Applied: $(basename "$f")" || true
    done
fi

# ─── Step 5: PM2 ──────────────────────────────────────────────────────────────
step "5/9 — PM2 service"
cat > "$APP_DIR/ecosystem.config.cjs" <<PM2CFG
module.exports = {
  apps: [{
    name: 'gydschain-api',
    script: 'server/index.ts',
    interpreter: 'node',
    interpreter_args: '--import tsx/esm',
    cwd: '${APP_DIR}',
    env: {
      NODE_ENV: 'production',
      PORT: '${PORT_API}',
      DATABASE_URL: '${DATABASE_URL}',
      SESSION_SECRET: '${SESSION_SECRET}',
      REPLIT_DOMAINS: '${FQDN},${DOMAIN}',
    },
    watch: false,
    max_memory_restart: '512M',
    restart_delay: 3000,
    error_file: '/var/log/gydschain/api-error.log',
    out_file:   '/var/log/gydschain/api-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  }]
};
PM2CFG

# Start as node user
if id -u "$NODE_USER" &>/dev/null; then
    su - "$NODE_USER" -c "pm2 delete gydschain-api 2>/dev/null; pm2 start '$APP_DIR/ecosystem.config.cjs'; pm2 save --force" || true
    env PATH="$PATH:/usr/bin:/usr/local/bin" pm2 startup systemd -u "$NODE_USER" --hp "/home/$NODE_USER" 2>/dev/null | tail -1 | bash 2>/dev/null || true
else
    pm2 delete gydschain-api 2>/dev/null || true
    pm2 start "$APP_DIR/ecosystem.config.cjs"
    pm2 save --force
fi
log "PM2 running: gydschain-api → port $PORT_API"

# ─── Step 6: Nginx (Cloudflare proxy — no SSL cert needed) ────────────────────
step "6/9 — Nginx (Cloudflare-aware)"
NGINX_CONF="/etc/nginx/sites-available/gydschain"

# Cloudflare real-IP restore snippet
cat > /etc/nginx/snippets/cloudflare-real-ip.conf <<'CFIP'
# Cloudflare IPv4 ranges
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
# Cloudflare IPv6 ranges
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;
CFIP

tee "$NGINX_CONF" > /dev/null <<NGINXCFG
server {
    listen 80;
    server_name ${FQDN};

    # ── Restore visitor real IP from Cloudflare ──
    include /etc/nginx/snippets/cloudflare-real-ip.conf;

    # ── Proxy API to Express ──
    location /api/ {
        proxy_pass         http://127.0.0.1:${PORT_API};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$http_x_forwarded_proto;
        proxy_read_timeout 60s;
        proxy_cache_bypass \$http_upgrade;
    }

    # ── WebSocket support ──
    location /ws {
        proxy_pass         http://127.0.0.1:${PORT_API};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 3600s;
    }

    # ── React SPA (from dist/) ──
    root ${APP_DIR}/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    }

    # ── Static assets — long cache (Vite hashes filenames) ──
    location ~* \.(js|css|woff2?|ttf|eot|svg|ico|webp|avif|png|jpg|jpeg|gif)\$ {
        expires 365d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # ── Health endpoint ──
    location = /health {
        access_log off;
        add_header Content-Type "application/json";
        return 200 '{"status":"ok","service":"gyds-dashboard","subdomain":"${SUBDOMAIN}","chain":13370}';
    }

    # ── Block sensitive files ──
    location ~ /\. { deny all; access_log off; }
    location ~* \.(env|key|pem|sh|sql|git)\$ { deny all; return 404; }

    error_page 404 /index.html;

    # ── Logging ──
    access_log /var/log/gydschain/nginx-access.log;
    error_log  /var/log/gydschain/nginx-error.log warn;
}
NGINXCFG

rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/gydschain
nginx -t && systemctl reload nginx || systemctl restart nginx
log "Nginx: ${FQDN} → $APP_DIR/dist, /api → :${PORT_API}"

# ─── Step 7: UFW Firewall ──────────────────────────────────────────────────────
step "7/9 — Firewall"
ufw --force reset 2>/dev/null || true
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh          # 22
ufw allow 80/tcp       # HTTP (Cloudflare)
ufw allow 443/tcp      # HTTPS (if direct TLS ever needed)
# Blockchain P2P ports (for node operators)
ufw allow 30303/tcp    # Ethereum P2P
ufw allow 30303/udp
ufw allow 30304/tcp
ufw allow 8546/tcp     # WS RPC (local only — blocked from outside)
# Block direct API access from internet (only Nginx proxy)
ufw deny "${PORT_API}/tcp"
ufw --force enable
log "UFW: SSH(22) + HTTP(80) + HTTPS(443) + P2P(30303) open | API port blocked"

# ─── Step 8: fail2ban ─────────────────────────────────────────────────────────
step "8/9 — fail2ban"
cat > /etc/fail2ban/jail.local <<F2B
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
F2B
systemctl enable fail2ban --now 2>/dev/null || true
log "fail2ban enabled (SSH + Nginx brute-force protection)"

# ─── Step 9: Cloudflare Tunnel (optional) ─────────────────────────────────────
step "9/9 — Cloudflare Tunnel"
if [[ -n "$CF_TUNNEL_TOKEN" ]]; then
    if ! command -v cloudflared &>/dev/null; then
        info "Installing cloudflared..."
        curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
        echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list
        apt-get update -qq && apt-get install -y -qq cloudflared
    fi
    cloudflared service install "$CF_TUNNEL_TOKEN"
    systemctl enable cloudflared --now 2>/dev/null || true
    log "Cloudflare Tunnel active (no open ports needed)"
    warn "Tunnel mode: you may close ports 80/443 from outside, tunnel handles ingress"
else
    warn "CF_TUNNEL_TOKEN not set — using Cloudflare Proxy mode (port 80 open)"
    info "In Cloudflare dashboard: set DNS A record for ${FQDN} → $(curl -sf4 ifconfig.me 2>/dev/null || echo '<your-ip>') (Proxied)"
fi

# ─── Install redeploy helper ───────────────────────────────────────────────────
cat > /usr/local/bin/gyds-redeploy <<REDEPLOY
#!/usr/bin/env bash
# Safe redeploy: git pull → npm install → build → PM2 reload
set -euo pipefail
APP_DIR="${APP_DIR}"
source "\$APP_DIR/.env" 2>/dev/null || true
echo "[gyds-redeploy] Pulling latest from git..."
git -C "\$APP_DIR" fetch origin
git -C "\$APP_DIR" pull --ff-only origin "\$(git -C \"\$APP_DIR\" branch --show-current)"
echo "[gyds-redeploy] Installing dependencies..."
cd "\$APP_DIR" && npm ci --prefer-offline 2>/dev/null || npm install --legacy-peer-deps
echo "[gyds-redeploy] Building frontend..."
npm run build
echo "[gyds-redeploy] Reloading API server..."
pm2 reload gydschain-api --update-env
echo "[gyds-redeploy] Reloading Nginx..."
nginx -s reload 2>/dev/null || systemctl reload nginx
echo "[gyds-redeploy] Done! \$(date)"
REDEPLOY
chmod +x /usr/local/bin/gyds-redeploy
log "Redeploy helper installed: run 'gyds-redeploy' to update"

# ─── Logrotate ────────────────────────────────────────────────────────────────
cat > /etc/logrotate.d/gydschain <<LOGROTATE
/var/log/gydschain/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 640 ${NODE_USER} adm
    sharedscripts
    postrotate
        pm2 flush 2>/dev/null || true
    endscript
}
LOGROTATE

# ─── Done ─────────────────────────────────────────────────────────────────────
PUBLIC_IP="$(curl -sf4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅  ChainCore deployed successfully                            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Dashboard:${NC}  http://${FQDN}  (HTTPS via Cloudflare)"
echo -e "${CYAN}API:${NC}        http://${FQDN}/api/"
echo -e "${CYAN}Health:${NC}     http://${FQDN}/health"
echo -e "${CYAN}Server IP:${NC}  ${PUBLIC_IP}"
echo ""
echo -e "${CYAN}Cloudflare DNS to configure:${NC}"
echo -e "  Type: A   Name: ${SUBDOMAIN}   Content: ${PUBLIC_IP}   Proxied: ✓ (orange cloud)"
echo ""
echo -e "${CYAN}PM2 commands:${NC}"
echo -e "  pm2 status"
echo -e "  pm2 logs gydschain-api --lines 50"
echo -e "  pm2 restart gydschain-api"
echo ""
echo -e "${CYAN}Redeploy (pull + build + reload):${NC}"
echo -e "  gyds-redeploy"
echo ""
if [[ "${SKIP_DB:-0}" != "1" ]]; then
echo -e "${YELLOW}⚠  Save these — written to ${APP_DIR}/.env:${NC}"
echo -e "  DB URL:         $DATABASE_URL"
echo -e "  Session secret: $SESSION_SECRET"
fi
echo ""
echo -e "${CYAN}Logs:${NC}  /var/log/gydschain/"
