#!/usr/bin/env bash
# GydsChain Dashboard Deployment Script v3.0.0
# Deploys the ChainCore frontend dashboard + API backend to an Ubuntu/Debian server
# Target web root: /var/www/gydschain
# Domain: netlifegy.com | Chain ID: 13370
#
# Usage:
#   DOMAIN=netlifegy.com GYDS_SSL_EMAIL=admin@netlifegy.com bash deploy-dashboard.sh
#
# Prerequisites:
#   - Ubuntu 22.04 LTS
#   - Run as root or with sudo
#   - DNS for DOMAIN must point to this server
#
# Optional env overrides:
#   REPO_URL      — git repo to clone   (default: https://github.com/hc172808/guardian-chain.git)
#   APP_DIR       — install directory   (default: /var/www/gydschain)
#   DATABASE_URL  — Postgres DSN        (default: local postgres)
#   PORT_API      — API server port     (default: 5001)
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
banner() { echo -e "${CYAN}$*${NC}"; }

# ─── Configuration ────────────────────────────────────────────────────────────
DOMAIN="${DOMAIN:-netlifegy.com}"
SSL_EMAIL="${GYDS_SSL_EMAIL:-${EMAIL:-}}"
APP_DIR="${APP_DIR:-/var/www/gydschain}"          # ← server web root
REPO_URL="${REPO_URL:-https://github.com/hc172808/guardian-chain.git}"
NODE_USER="${SUDO_USER:-$USER}"
PORT_API="${PORT_API:-5001}"
PORT_FRONTEND="${PORT_FRONTEND:-5000}"
DATABASE_URL="${DATABASE_URL:-postgresql://gydschain:gydschain@localhost/gydschain}"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"
NODE_ENV="${NODE_ENV:-production}"

banner "
╔══════════════════════════════════════════════════════════════╗
║     ChainCore Dashboard Deployment v3.0.0                    ║
║     netlifegy.com | Chain ID: 13370 | /var/www/gydschain     ║
╚══════════════════════════════════════════════════════════════╝"

# ─── Pre-flight Checks ────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || { err "Run as root (sudo bash deploy-dashboard.sh)"; exit 1; }

if [[ -z "$SSL_EMAIL" ]]; then
    warn "GYDS_SSL_EMAIL not set."
    read -rp "Enter email for SSL certificate: " SSL_EMAIL
    [[ -n "$SSL_EMAIL" ]] || { err "Email required"; exit 1; }
fi

echo -e "${CYAN}Deployment Configuration:${NC}"
echo -e "  Domain:      $DOMAIN"
echo -e "  App Dir:     $APP_DIR"
echo -e "  Repo:        $REPO_URL"
echo -e "  SSL Email:   $SSL_EMAIL"
echo -e "  API Port:    $PORT_API"
echo -e "  DB:          ${DATABASE_URL:0:30}..."
echo ""
read -rp "Continue? (y/n) " -n 1; echo
[[ $REPLY =~ ^[Yy]$ ]] || exit 0

# ─── Step 1: System packages ──────────────────────────────────────────────────
log "[1/8] Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    git curl build-essential \
    nginx certbot python3-certbot-nginx \
    postgresql postgresql-contrib \
    ufw fail2ban

# Node.js LTS
if ! command -v node &>/dev/null; then
    log "  Installing Node.js LTS..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y -qq nodejs
fi
log "  Node.js: $(node --version) | npm: $(npm --version)"

# pnpm (optional but faster)
npm install -g pm2 --silent

# ─── Step 2: PostgreSQL ───────────────────────────────────────────────────────
log "[2/8] Setting up PostgreSQL..."
systemctl enable postgresql --now || true
PG_DBNAME="${PG_DBNAME:-gydschain}"
PG_USER="${PG_USER:-gydschain}"
PG_PASS="${PG_PASS:-$(openssl rand -hex 16)}"

su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'\" | grep -q 1 || psql -c \"CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';\"" 2>/dev/null || true
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${PG_DBNAME}'\" | grep -q 1 || psql -c \"CREATE DATABASE ${PG_DBNAME} OWNER ${PG_USER};\"" 2>/dev/null || true
DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@localhost/${PG_DBNAME}"
log "  Database: ${PG_DBNAME} (user: ${PG_USER})"

# ─── Step 3: Clone / update repo ─────────────────────────────────────────────
log "[3/8] Deploying from $REPO_URL → $APP_DIR..."

# Configure git to use GITHUB_TOKEN if set (enables auto push/pull)
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    REPO_WITH_TOKEN="${REPO_URL/https:\/\//https:\/\/${GITHUB_TOKEN}@}"
    log "  GitHub token detected — auth'd push/pull enabled"
else
    REPO_WITH_TOKEN="$REPO_URL"
    warn "  GITHUB_TOKEN not set — pushes will require manual auth"
fi

if [[ -d "$APP_DIR/.git" ]]; then
    log "  Pulling latest from GitHub..."
    git -C "$APP_DIR" config pull.rebase false
    git -C "$APP_DIR" fetch origin
    git -C "$APP_DIR" pull --ff-only origin "$(git -C "$APP_DIR" branch --show-current)" || \
        git -C "$APP_DIR" pull --ff-only origin main || \
        git -C "$APP_DIR" pull --ff-only origin master
    log "  Pull complete: $(git -C "$APP_DIR" log -1 --format='%h %s' 2>/dev/null)"
else
    log "  Cloning repository..."
    git clone "$REPO_WITH_TOKEN" "$APP_DIR"
    # Store remote URL with token for future pulls
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
        git -C "$APP_DIR" remote set-url origin "$REPO_WITH_TOKEN"
    fi
fi
chown -R "$NODE_USER:$NODE_USER" "$APP_DIR"

# Install git auto-pull cron (pulls every 5 minutes if GITHUB_TOKEN is set)
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    CRON_CMD="*/5 * * * * root cd $APP_DIR && git pull --ff-only origin \$(git branch --show-current) >> /var/log/gydschain/git-pull.log 2>&1"
    echo "$CRON_CMD" > /etc/cron.d/gydschain-git-pull
    chmod 644 /etc/cron.d/gydschain-git-pull
    log "  Auto-pull cron installed: every 5 minutes"
fi

# ─── Step 4: Build frontend + backend ────────────────────────────────────────
log "[4/8] Installing dependencies and building..."
cd "$APP_DIR"
npm ci

# Write .env for the build + runtime
cat > "$APP_DIR/.env" <<ENVEOF
NODE_ENV=${NODE_ENV}
PORT=${PORT_API}
DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=${SESSION_SECRET}
REPLIT_DOMAINS=${DOMAIN},www.${DOMAIN}
ENVEOF
chown "$NODE_USER:$NODE_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# Push DB schema
log "  Pushing database schema..."
cd "$APP_DIR" && npm run db:push || warn "db:push failed — schema may need manual migration"

# Build the Vite frontend
npm run build
log "  Build complete: $APP_DIR/dist"

# ─── Step 5: PM2 service ─────────────────────────────────────────────────────
log "[5/8] Configuring PM2 (API server)..."
cat > "$APP_DIR/ecosystem.config.cjs" <<PM2EOF
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
      REPLIT_DOMAINS: '${DOMAIN},www.${DOMAIN}'
    },
    watch: false,
    max_memory_restart: '512M',
    error_file: '/var/log/gydschain/api-error.log',
    out_file: '/var/log/gydschain/api-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
PM2EOF

mkdir -p /var/log/gydschain
chown "$NODE_USER:$NODE_USER" /var/log/gydschain

su - "$NODE_USER" -c "pm2 delete gydschain-api 2>/dev/null || true; pm2 start '$APP_DIR/ecosystem.config.cjs'; pm2 save"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$NODE_USER" --hp "/home/$NODE_USER" | bash || true

# ─── Step 6: Nginx ───────────────────────────────────────────────────────────
log "[6/8] Configuring Nginx..."
NGINX_CONF="/etc/nginx/sites-available/gydschain"

tee "$NGINX_CONF" > /dev/null << EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    # ── Proxy API requests to Express ──
    location /api/ {
        proxy_pass         http://127.0.0.1:${PORT_API};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
    }

    # ── Proxy auth callback to Express ──
    location /api/auth/ {
        proxy_pass         http://127.0.0.1:${PORT_API};
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    # ── Serve built React SPA ──
    root ${APP_DIR}/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|avif)\$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location /health {
        access_log off;
        add_header Content-Type "application/json";
        return 200 '{"status":"ok","service":"gyds-dashboard","chain":13370}';
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ~ /\. { deny all; }
    location ~ \.(env|key|pem|sh|sql)\$ { deny all; return 404; }

    error_page 404 /index.html;
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
log "  Nginx configured for $DOMAIN → serves $APP_DIR/dist, proxies /api → :${PORT_API}"

# ─── Step 7: Firewall ─────────────────────────────────────────────────────────
log "[7/8] Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
log "  UFW: SSH + HTTP + HTTPS open"

# ─── Step 8: SSL Certificate ─────────────────────────────────────────────────
log "[8/8] Obtaining SSL certificate..."
certbot --nginx \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "$SSL_EMAIL" \
    --redirect \
    --hsts \
    --staple-ocsp || warn "SSL failed — run again once DNS is propagated"

# ─── Done ─────────────────────────────────────────────────────────────────────
LOCAL_IP="$(hostname -I | awk '{print $1}')"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅  ChainCore deployed to /var/www/gydschain                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Dashboard:${NC}   https://$DOMAIN"
echo -e "${CYAN}API:${NC}         https://$DOMAIN/api/"
echo -e "${CYAN}Health:${NC}      https://$DOMAIN/health"
echo -e "${CYAN}App Dir:${NC}     $APP_DIR"
echo -e "${CYAN}DB:${NC}          $DATABASE_URL"
echo -e "${CYAN}Logs:${NC}        /var/log/gydschain/"
echo ""
echo -e "${CYAN}Manage API:${NC}"
echo -e "  pm2 status"
echo -e "  pm2 logs gydschain-api"
echo -e "  pm2 restart gydschain-api"
echo ""
echo -e "${CYAN}Update in future:${NC}"
echo -e "  cd $APP_DIR && git pull && npm run build && pm2 restart gydschain-api && nginx -s reload"
echo ""
echo -e "${CYAN}Git auto-pull:${NC}"
echo -e "  GITHUB_TOKEN=your_token bash deploy-dashboard.sh  ← enables 5-min auto-pull cron"
echo -e "  tail -f /var/log/gydschain/git-pull.log           ← watch auto-pull logs"
echo ""
echo -e "${YELLOW}⚠  Save these credentials:${NC}"
echo -e "  DB Password: $PG_PASS"
echo -e "  Session Secret: $SESSION_SECRET"
echo -e "  (written to $APP_DIR/.env)"
