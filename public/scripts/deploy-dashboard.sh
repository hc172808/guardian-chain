#!/usr/bin/env bash
# GydsChain Dashboard Deployment Script v2.2.0
# Deploys the ChainCore frontend dashboard to an Ubuntu/Debian server
# Domain: netlifegy.com | Chain ID: 13370
#
# Usage:
#   DOMAIN=netlifegy.com GYDS_SSL_EMAIL=admin@netlifegy.com bash deploy-dashboard.sh
#
# Prerequisites:
#   - Ubuntu 22.04 LTS
#   - Run as root or with sudo
#   - DNS for DOMAIN must point to this server
#   - VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Configuration ────────────────────────────────────────────
DOMAIN="${DOMAIN:-netlifegy.com}"
SSL_EMAIL="${GYDS_SSL_EMAIL:-${EMAIL:-}}"
APP_DIR="${APP_DIR:-/opt/gydschain-dashboard}"
NODE_USER="${SUDO_USER:-$USER}"
REPO_URL="${REPO_URL:-https://github.com/gydschain/chaincore.git}"

# Supabase credentials (required)
VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-}"
VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"
VITE_SUPABASE_PROJECT_ID="${VITE_SUPABASE_PROJECT_ID:-}"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     ChainCore Dashboard Deployment v2.2.0                    ║"
echo "║     netlifegy.com | Chain ID: 13370                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Pre-flight Checks ─────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Error: This script must be run as root or with sudo.${NC}"
    exit 1
fi

if [[ -z "$VITE_SUPABASE_URL" ]] || [[ -z "$VITE_SUPABASE_PUBLISHABLE_KEY" ]]; then
    echo -e "${RED}Error: Supabase credentials are required.${NC}"
    echo "  export VITE_SUPABASE_URL=https://your-project.supabase.co"
    echo "  export VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key"
    exit 1
fi

if [[ -z "$SSL_EMAIL" ]]; then
    echo -e "${YELLOW}Warning: GYDS_SSL_EMAIL not set. SSL certificate registration will need an email.${NC}"
    read -rp "Enter email for SSL certificate: " SSL_EMAIL
    [[ -n "$SSL_EMAIL" ]] || { echo -e "${RED}Email required${NC}"; exit 1; }
fi

echo -e "${CYAN}Deployment Configuration:${NC}"
echo -e "  Domain:     $DOMAIN"
echo -e "  App Dir:    $APP_DIR"
echo -e "  SSL Email:  $SSL_EMAIL"
echo -e "  Supabase:   $VITE_SUPABASE_URL"
echo ""
read -rp "Continue? (y/n) " -n 1
echo
[[ $REPLY =~ ^[Yy]$ ]] || exit 0

# ─── Step 1: Update system & install dependencies ──────────────
echo -e "\n${GREEN}[1/6]${NC} Installing dependencies..."
apt-get update -qq
apt-get install -y -qq \
    git curl build-essential \
    nginx certbot python3-certbot-nginx \
    ufw

# Node.js LTS
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y -qq nodejs
fi
echo -e "  Node.js: $(node --version) | npm: $(npm --version)"

# ─── Step 2: Clone / update repo ───────────────────────────────
echo -e "\n${GREEN}[2/6]${NC} Deploying application..."
if [[ -d "$APP_DIR/.git" ]]; then
    git -C "$APP_DIR" pull --ff-only
else
    rm -rf "$APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$NODE_USER:$NODE_USER" "$APP_DIR"

# ─── Step 3: Build frontend ─────────────────────────────────────
echo -e "\n${GREEN}[3/6]${NC} Building frontend..."
cd "$APP_DIR"
npm ci --production=false

VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
VITE_SUPABASE_PROJECT_ID="$VITE_SUPABASE_PROJECT_ID" \
npm run build

echo -e "  Build complete: $APP_DIR/dist"

# ─── Step 4: Configure Nginx ────────────────────────────────────
echo -e "\n${GREEN}[4/6]${NC} Configuring Nginx..."
NGINX_CONF="/etc/nginx/sites-available/gydschain-dashboard"

tee "$NGINX_CONF" > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    root $APP_DIR/dist;
    index index.html;

    # SPA routing
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Static assets with long-lived caching
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|avif)\$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Health check
    location /health {
        access_log off;
        add_header Content-Type "application/json";
        return 200 '{"status":"ok","service":"gyds-dashboard"}';
    }

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Block sensitive files
    location ~ /\\. { deny all; }
    location ~ \\.(env|key|pem|sh|sql)\$ { deny all; return 404; }

    error_page 404 /index.html;
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
echo -e "  Nginx configured for $DOMAIN"

# ─── Step 5: Firewall ───────────────────────────────────────────
echo -e "\n${GREEN}[5/6]${NC} Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
echo -e "  UFW enabled: SSH + HTTP + HTTPS"

# ─── Step 6: SSL Certificate ────────────────────────────────────
echo -e "\n${GREEN}[6/6]${NC} Obtaining SSL certificate..."
certbot --nginx \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "$SSL_EMAIL" \
    --redirect \
    --hsts \
    --staple-ocsp || {
    echo -e "${YELLOW}SSL certificate failed — site is live over HTTP.${NC}"
    echo -e "${YELLOW}Run again once DNS is fully propagated.${NC}"
}

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Deployment complete!                                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Dashboard:${NC}  https://$DOMAIN"
echo -e "${CYAN}App Dir:${NC}    $APP_DIR"
echo -e "${CYAN}Health:${NC}     https://$DOMAIN/health"
echo ""
echo -e "${CYAN}To update in future:${NC}"
echo -e "  DOMAIN=$DOMAIN GYDS_SSL_EMAIL=$SSL_EMAIL bash deploy-dashboard.sh"
