#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  ChainCore Dashboard — Full Deploy Script v4.0.0                       ║
# ║  Supports: main domain, subdomain, Cloudflare Proxy, CF Tunnel         ║
# ║                                                                         ║
# ║  Usage examples:                                                        ║
# ║    Subdomain + Cloudflare Proxy:                                        ║
# ║      SUBDOMAIN=app DOMAIN=netlifegy.com bash deploy-dashboard.sh       ║
# ║                                                                         ║
# ║    Cloudflare Tunnel:                                                   ║
# ║      SUBDOMAIN=app DOMAIN=netlifegy.com \                              ║
# ║      CF_TUNNEL_TOKEN=<token> bash deploy-dashboard.sh                  ║
# ║                                                                         ║
# ║    Main domain + certbot SSL (no Cloudflare):                          ║
# ║      DOMAIN=netlifegy.com USE_CERTBOT=1 bash deploy-dashboard.sh       ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()   { echo -e "${YELLOW}[!]${NC} $*"; }
err()    { echo -e "${RED}[✗]${NC} $*" >&2; }
info()   { echo -e "${CYAN}[→]${NC} $*"; }
step()   { echo ""; echo -e "${BOLD}${GREEN}━━━ $* ━━━${NC}"; }

# ─── Configuration ────────────────────────────────────────────────────────────
SUBDOMAIN="${SUBDOMAIN:-}"                          # e.g. "app" → app.netlifegy.com (empty = use DOMAIN directly)
DOMAIN="${DOMAIN:-netlifegy.com}"
FQDN="${SUBDOMAIN:+${SUBDOMAIN}.}${DOMAIN}"        # app.netlifegy.com or netlifegy.com
USE_CERTBOT="${USE_CERTBOT:-0}"                     # set to 1 for direct SSL (non-Cloudflare)
SSL_EMAIL="${GYDS_SSL_EMAIL:-${EMAIL:-}}"
CF_TUNNEL_TOKEN="${CF_TUNNEL_TOKEN:-}"
APP_DIR="${APP_DIR:-/var/www/gydschain}"
REPO_URL="${REPO_URL:-https://github.com/hc172808/guardian-chain.git}"
BRANCH="${BRANCH:-main}"
NODE_USER="${SUDO_USER:-ubuntu}"
[[ "$NODE_USER" == "root" ]] && NODE_USER="ubuntu"
PORT_API="${PORT_API:-5001}"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"
NODE_ENV="${NODE_ENV:-production}"

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║   ChainCore Dashboard Deployment v4.0.0                         ║"
printf "║   Domain: %-52s ║\n" "$FQDN"
printf "║   Dir:    %-52s ║\n" "$APP_DIR"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Pre-flight ───────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || { err "Run as root: sudo bash deploy-dashboard.sh"; exit 1; }

if [[ "$USE_CERTBOT" == "1" && -z "$SSL_EMAIL" ]]; then
    warn "USE_CERTBOT=1 requires SSL_EMAIL"
    read -rp "Email for SSL cert: " SSL_EMAIL
    [[ -n "$SSL_EMAIL" ]] || { err "Email required for certbot"; exit 1; }
fi

info "Deployment configuration:"
echo "  Domain (FQDN):  $FQDN"
echo "  Subdomain:      ${SUBDOMAIN:-<root domain>}"
echo "  App dir:        $APP_DIR"
echo "  Repo:           $REPO_URL"
echo "  Branch:         $BRANCH"
echo "  API port:       $PORT_API"
echo "  CF Tunnel:      ${CF_TUNNEL_TOKEN:+yes}${CF_TUNNEL_TOKEN:-no}"
echo "  Certbot SSL:    ${USE_CERTBOT}"
echo ""
read -rp "Continue? (y/N) " -n 1 reply; echo
[[ "$reply" =~ ^[Yy]$ ]] || exit 0

# ─── Step 1: System packages ──────────────────────────────────────────────────
step "1/8 — System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
PKGS="git curl wget build-essential nginx postgresql postgresql-contrib ufw fail2ban jq"
[[ "$USE_CERTBOT" == "1" ]] && PKGS="$PKGS certbot python3-certbot-nginx"
apt-get install -y -qq $PKGS

if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
    info "Installing Node.js 22 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>/dev/null
    apt-get install -y -qq nodejs
fi
npm install -g pm2 --silent 2>/dev/null || true
log "Node $(node --version) | PM2 $(pm2 --version 2>/dev/null | tail -1)"

# ─── Step 2: PostgreSQL ───────────────────────────────────────────────────────
step "2/8 — PostgreSQL"
systemctl enable postgresql --now 2>/dev/null || true
sleep 2
PG_DBNAME="${PG_DBNAME:-gydschain}"
PG_USER="${PG_USER:-gydschain}"
PG_PASS="${PG_PASS:-$(openssl rand -hex 16)}"
su - postgres -c "psql -qc \"SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'\" | grep -q 1 || psql -qc \"CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';\"" 2>/dev/null || true
su - postgres -c "psql -qc \"SELECT 1 FROM pg_database WHERE datname='${PG_DBNAME}'\" | grep -q 1 || psql -qc \"CREATE DATABASE ${PG_DBNAME} OWNER ${PG_USER};\"" 2>/dev/null || true
DATABASE_URL="${DATABASE_URL:-postgresql://${PG_USER}:${PG_PASS}@localhost/${PG_DBNAME}}"
log "Database: ${PG_DBNAME} (user: ${PG_USER})"

# ─── Step 3: Clone / pull repo ────────────────────────────────────────────────
step "3/8 — Repository"
mkdir -p "$(dirname "$APP_DIR")"
REPO_AUTH="${REPO_URL}"
[[ -n "${GITHUB_TOKEN:-}" ]] && REPO_AUTH="${REPO_URL/https:\/\//https:\/\/${GITHUB_TOKEN}@}"

if [[ -d "$APP_DIR/.git" ]]; then
    info "Updating from $BRANCH..."
    git -C "$APP_DIR" config pull.rebase false
    git -C "$APP_DIR" fetch origin
    git -C "$APP_DIR" checkout "$BRANCH" 2>/dev/null || true
    git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
    log "Updated: $(git -C "$APP_DIR" log -1 --format='%h %s')"
else
    info "Cloning repository..."
    git clone --branch "$BRANCH" "$REPO_AUTH" "$APP_DIR"
    [[ -n "${GITHUB_TOKEN:-}" ]] && git -C "$APP_DIR" remote set-url origin "$REPO_AUTH"
    log "Cloned to $APP_DIR"
fi
id -u "$NODE_USER" &>/dev/null && chown -R "$NODE_USER:$NODE_USER" "$APP_DIR" || true

# Optional auto-pull cron (every 5 min if GITHUB_TOKEN set)
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    echo "*/5 * * * * root cd ${APP_DIR} && git pull --ff-only origin \$(git branch --show-current) >> /var/log/gydschain/git-pull.log 2>&1" > /etc/cron.d/gydschain-git-pull
    chmod 644 /etc/cron.d/gydschain-git-pull
    log "Auto-pull cron: every 5 minutes"
fi

# ─── Step 4: Install + build ──────────────────────────────────────────────────
step "4/8 — Install & build"
mkdir -p /var/log/gydschain
id -u "$NODE_USER" &>/dev/null && chown "$NODE_USER:$NODE_USER" /var/log/gydschain || true

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
npm run build
log "Build complete → $APP_DIR/dist"

info "Applying DB schema..."
npx drizzle-kit generate 2>/dev/null || true
for f in "$APP_DIR"/drizzle/*.sql; do
    [[ -f "$f" ]] && psql "$DATABASE_URL" -f "$f" 2>/dev/null && log "  Schema: $(basename "$f")" || true
done

# ─── Step 5: PM2 ──────────────────────────────────────────────────────────────
step "5/8 — PM2 service"
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

if id -u "$NODE_USER" &>/dev/null; then
    su - "$NODE_USER" -c "pm2 delete gydschain-api 2>/dev/null; pm2 start '$APP_DIR/ecosystem.config.cjs'; pm2 save --force" || true
    env PATH="$PATH:/usr/bin:/usr/local/bin" pm2 startup systemd -u "$NODE_USER" --hp "/home/$NODE_USER" 2>/dev/null | tail -1 | bash 2>/dev/null || true
else
    pm2 delete gydschain-api 2>/dev/null || true
    pm2 start "$APP_DIR/ecosystem.config.cjs"
    pm2 save --force
fi
log "PM2: gydschain-api → port $PORT_API"

# ─── Step 6: Nginx ────────────────────────────────────────────────────────────
step "6/8 — Nginx"
NGINX_CONF="/etc/nginx/sites-available/gydschain"

# Cloudflare real-IP snippet
cat > /etc/nginx/snippets/cloudflare-real-ip.conf <<'CFIP'
set_real_ip_from 103.21.244.0/22; set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;   set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;   set_real_ip_from 108.162.192.0/18;
set_real_ip_from 131.0.72.0/22;   set_real_ip_from 141.101.64.0/18;
set_real_ip_from 162.158.0.0/15;  set_real_ip_from 172.64.0.0/13;
set_real_ip_from 173.245.48.0/20; set_real_ip_from 188.114.96.0/20;
set_real_ip_from 190.93.240.0/20; set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 2400:cb00::/32;  set_real_ip_from 2606:4700::/32;
real_ip_header CF-Connecting-IP;
CFIP

# Determine if Cloudflare or direct SSL
NGINX_SERVER_NAMES="${FQDN}"
[[ -z "$SUBDOMAIN" ]] && NGINX_SERVER_NAMES="${DOMAIN} www.${DOMAIN}"

tee "$NGINX_CONF" > /dev/null <<NGINXEOF
server {
    listen 80;
    server_name ${NGINX_SERVER_NAMES};

    include /etc/nginx/snippets/cloudflare-real-ip.conf;

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
    }

    location /ws {
        proxy_pass         http://127.0.0.1:${PORT_API};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 3600s;
    }

    root ${APP_DIR}/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
    }

    location ~* \.(js|css|woff2?|ttf|eot|svg|ico|webp|avif|png|jpg|jpeg|gif)\$ {
        expires 365d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location = /health {
        access_log off;
        add_header Content-Type "application/json";
        return 200 '{"status":"ok","service":"gyds-dashboard","chain":13370}';
    }

    location ~ /\. { deny all; }
    location ~* \.(env|key|pem|sh|sql)\$ { deny all; return 404; }
    error_page 404 /index.html;

    access_log /var/log/gydschain/nginx-access.log;
    error_log  /var/log/gydschain/nginx-error.log warn;
}
NGINXEOF

rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/gydschain
nginx -t && systemctl reload nginx || systemctl restart nginx
log "Nginx: $FQDN → $APP_DIR/dist"

# ─── Step 7: UFW Firewall ──────────────────────────────────────────────────────
step "7/8 — Firewall"
ufw default deny incoming 2>/dev/null || true
ufw default allow outgoing 2>/dev/null || true
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 30303/tcp
ufw allow 30303/udp
ufw deny "${PORT_API}/tcp"
ufw --force enable
log "UFW: SSH + HTTP(80) + HTTPS(443) + P2P(30303) | API port blocked"

# ─── Step 8: SSL (certbot — only if USE_CERTBOT=1) ────────────────────────────
step "8/8 — SSL"
if [[ "$USE_CERTBOT" == "1" ]]; then
    info "Obtaining SSL cert for $FQDN..."
    CERTBOT_DOMAINS="-d $FQDN"
    [[ -z "$SUBDOMAIN" ]] && CERTBOT_DOMAINS="-d $DOMAIN -d www.$DOMAIN"
    certbot --nginx $CERTBOT_DOMAINS \
        --non-interactive --agree-tos --email "$SSL_EMAIL" \
        --redirect --hsts --staple-ocsp || warn "SSL failed — run again once DNS propagates"
elif [[ -n "$CF_TUNNEL_TOKEN" ]]; then
    info "Installing Cloudflare Tunnel..."
    if ! command -v cloudflared &>/dev/null; then
        curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
        echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list
        apt-get update -qq && apt-get install -y -qq cloudflared
    fi
    cloudflared service install "$CF_TUNNEL_TOKEN"
    systemctl enable cloudflared --now 2>/dev/null || true
    log "Cloudflare Tunnel active"
else
    warn "Skipping SSL — Cloudflare Proxy mode assumed"
    warn "In Cloudflare dashboard: DNS A record for ${FQDN} → your IP (Proxied)"
fi

# Install redeploy helper
cat > /usr/local/bin/gyds-redeploy <<RDEPLOY
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR}"
source "\$APP_DIR/.env" 2>/dev/null || true
echo "[redeploy] Pulling latest..."
git -C "\$APP_DIR" fetch origin
git -C "\$APP_DIR" pull --ff-only origin "\$(git -C \"\$APP_DIR\" branch --show-current)"
echo "[redeploy] Installing deps..."
cd "\$APP_DIR" && npm ci --prefer-offline 2>/dev/null || npm install --legacy-peer-deps
echo "[redeploy] Building..."
npm run build
echo "[redeploy] Reloading PM2..."
pm2 reload gydschain-api --update-env
echo "[redeploy] Reloading Nginx..."
nginx -s reload 2>/dev/null || systemctl reload nginx
echo "[redeploy] Done \$(date)"
RDEPLOY
chmod +x /usr/local/bin/gyds-redeploy

# Logrotate
cat > /etc/logrotate.d/gydschain <<LOGROTATE
/var/log/gydschain/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 640 ${NODE_USER} adm
    postrotate
        pm2 flush 2>/dev/null || true
    endscript
}
LOGROTATE

# ─── Done ─────────────────────────────────────────────────────────────────────
PUBLIC_IP="$(curl -sf4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅  ChainCore deployed!                                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}URL:${NC}        http://${FQDN}  (HTTPS via Cloudflare)"
echo -e "${CYAN}API:${NC}        http://${FQDN}/api/"
echo -e "${CYAN}Health:${NC}     http://${FQDN}/health"
echo -e "${CYAN}Server IP:${NC}  ${PUBLIC_IP}"
echo ""
if [[ -z "$SUBDOMAIN" ]]; then
    echo -e "${CYAN}Cloudflare DNS:${NC}"
    echo -e "  A  ${DOMAIN}      → ${PUBLIC_IP}  (Proxied)"
    echo -e "  A  www.${DOMAIN}  → ${PUBLIC_IP}  (Proxied)"
else
    echo -e "${CYAN}Cloudflare DNS:${NC}"
    echo -e "  A  ${SUBDOMAIN}.${DOMAIN}  → ${PUBLIC_IP}  (Proxied / orange cloud)"
fi
echo ""
echo -e "${CYAN}Manage:${NC}"
echo -e "  pm2 status"
echo -e "  pm2 logs gydschain-api --lines 50"
echo -e "  gyds-redeploy          ← pull + build + reload"
echo ""
echo -e "${YELLOW}⚠  Save these credentials (also in ${APP_DIR}/.env):${NC}"
echo -e "  DATABASE_URL:   $DATABASE_URL"
echo -e "  SESSION_SECRET: $SESSION_SECRET"
