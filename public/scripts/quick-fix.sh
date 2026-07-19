#!/usr/bin/env bash
# ============================================================
#  GYDSchain — Nginx Quick-Fix Script
#  Fixes the "Welcome to nginx!" page on Ubuntu servers.
#  Also updates the app code and restarts PM2 when needed.
#
#  Usage:
#    sudo bash quick-fix.sh
#    sudo bash quick-fix.sh --domain app.netlifegy.com
#    sudo bash quick-fix.sh --ip          (catch-all IP mode)
#    sudo bash quick-fix.sh --status      (diagnose only, no changes)
#    sudo bash quick-fix.sh --update      (git pull + build + PM2 reload)
#
#  What it does:
#    1. Diagnoses why Nginx shows the default page
#    2. Removes the default nginx site if present
#    3. Creates / repairs the GYDSchain nginx site config
#    4. Sets server_name to catch-all (_) when no domain given
#    5. Verifies PM2 process is running + API responds on :5001
#    6. Reloads Nginx
# ============================================================
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✔${RESET}  $*"; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }
err()  { echo -e "${RED}✖${RESET}  $*"; }
info() { echo -e "${CYAN}ℹ${RESET}  $*"; }
hdr()  { echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}"; }

# ── Defaults ─────────────────────────────────────────────────
DOMAIN=""
STATUS_ONLY=false
APP_DIR="${APP_DIR:-/var/www/gydschain}"
NGINX_SITE="gydschain"
NGINX_AVAILABLE="/etc/nginx/sites-available/${NGINX_SITE}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${NGINX_SITE}"
APP_PORT="${APP_PORT:-5001}"
UPDATE_ONLY=false

# ── Arg parse ────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --ip)     DOMAIN="_"; shift ;;
    --status) STATUS_ONLY=true; shift ;;
    --update) UPDATE_ONLY=true; shift ;;
    -h|--help)
      grep '^#  ' "$0" | sed 's/^#  //'
      exit 0 ;;
    *) warn "Unknown argument: $1"; shift ;;
  esac
done

# ── Root check ───────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root (sudo bash quick-fix.sh)"
  exit 1
fi

# ── UPDATE mode: git pull + npm build + PM2 reload ───────────
if $UPDATE_ONLY; then
  hdr "Updating GYDSchain app"
  if [[ ! -d "${APP_DIR}/.git" ]]; then
    err "No git repo found at ${APP_DIR}. Run setup-server.sh first."
    exit 1
  fi
  cd "${APP_DIR}"
  APP_USER="$(stat -c '%U' .)"
  info "Pulling latest code…"
  sudo -u "$APP_USER" git pull --ff-only
  info "Installing dependencies…"
  sudo -u "$APP_USER" npm ci --prefer-offline 2>&1 | tail -3
  info "Building frontend…"
  sudo -u "$APP_USER" npm run build 2>&1 | tail -5
  info "Reloading PM2…"
  pm2 reload gydschain --update-env 2>/dev/null \
    || pm2 restart gydschain --update-env 2>/dev/null \
    || true
  pm2 save 2>/dev/null || true
  sleep 3
  if curl -sf "http://localhost:${APP_PORT}/api/auth/captcha" \
       | grep -q 'challengeId\|hcaptcha'; then
    ok "Captcha endpoint is working ✓"
    ok "Update complete — refresh your browser."
  else
    warn "Captcha endpoint still not responding."
    warn "Check PM2 logs: pm2 logs gydschain --lines 30"
  fi
  exit 0
fi

# ── 1. DIAGNOSE ──────────────────────────────────────────────
hdr "Diagnosing Nginx issue"

NGINX_INSTALLED=false
PM2_RUNNING=false
API_ALIVE=false
DEFAULT_SITE_ACTIVE=false
GYDS_SITE_EXISTS=false
GYDS_SITE_ENABLED=false
SERVER_NAME_MISMATCH=false
SERVER_IP=""

command -v nginx &>/dev/null && NGINX_INSTALLED=true
command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "gydschain" && PM2_RUNNING=true
curl -sf "http://localhost:${APP_PORT}/api/health" &>/dev/null && API_ALIVE=true
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")

[[ -f /etc/nginx/sites-enabled/default ]] && DEFAULT_SITE_ACTIVE=true
[[ -f "$NGINX_AVAILABLE" ]] && GYDS_SITE_EXISTS=true
[[ -L "$NGINX_ENABLED" ]] && GYDS_SITE_ENABLED=true

if $GYDS_SITE_EXISTS && [[ -n "$SERVER_IP" ]] && [[ "$SERVER_IP" != "unknown" ]]; then
  current_server_name=$(grep -Po '(?<=server_name ).*?(?=;)' "$NGINX_AVAILABLE" 2>/dev/null | head -1 || echo "")
  if [[ -n "$current_server_name" && "$current_server_name" != "_" ]]; then
    SERVER_NAME_MISMATCH=true
    info "Current server_name: ${current_server_name}"
    info "Server IP:           ${SERVER_IP}"
  fi
fi

echo ""
echo -e "  Nginx installed:         $( $NGINX_INSTALLED && echo "${GREEN}Yes${RESET}" || echo "${RED}No${RESET}")"
echo -e "  PM2 app running:         $( $PM2_RUNNING   && echo "${GREEN}Yes${RESET}" || echo "${RED}No${RESET} ← app not started")"
echo -e "  API alive on :${APP_PORT}:       $( $API_ALIVE     && echo "${GREEN}Yes${RESET}" || echo "${RED}No${RESET} ← app may be crashed")"
echo -e "  Default site active:     $( $DEFAULT_SITE_ACTIVE && echo "${RED}Yes ← THIS IS THE PROBLEM${RESET}" || echo "${GREEN}No${RESET}")"
echo -e "  GYDSchain site exists:   $( $GYDS_SITE_EXISTS  && echo "${GREEN}Yes${RESET}" || echo "${YELLOW}No${RESET} ← needs creation")"
echo -e "  GYDSchain site enabled:  $( $GYDS_SITE_ENABLED && echo "${GREEN}Yes${RESET}" || echo "${YELLOW}No${RESET} ← needs symlink")"
echo -e "  server_name mismatch:    $( $SERVER_NAME_MISMATCH && echo "${YELLOW}Yes ← accessing by IP but config has domain${RESET}" || echo "${GREEN}No${RESET}")"
echo ""

if $STATUS_ONLY; then
  info "Status-only mode — no changes made."
  exit 0
fi

# ── 2. FIX NGINX ─────────────────────────────────────────────
if ! $NGINX_INSTALLED; then
  err "Nginx is not installed. Install it first:"
  echo "  apt update && apt install -y nginx"
  exit 1
fi

hdr "Fixing Nginx configuration"

# Remove default site
if $DEFAULT_SITE_ACTIVE; then
  rm -f /etc/nginx/sites-enabled/default
  ok "Removed default Nginx site"
else
  ok "Default site already removed"
fi

# Determine server_name value
if [[ -z "$DOMAIN" ]]; then
  # Auto-detect: if GYDS site exists and has a domain that isn't _, keep it
  if $GYDS_SITE_EXISTS; then
    existing_name=$(grep -Po '(?<=server_name ).*?(?=;)' "$NGINX_AVAILABLE" 2>/dev/null | head -1 | xargs || echo "_")
    if [[ "$existing_name" == "_" || -z "$existing_name" ]]; then
      DOMAIN="_"
    else
      info "Keeping existing server_name: ${existing_name}"
      DOMAIN="$existing_name"
    fi
  else
    DOMAIN="_"
    warn "No domain specified — using catch-all (server_name _). Pass --domain yourdomain.com to use a specific domain."
  fi
fi

# Build / overwrite the Nginx site config
cat > "$NGINX_AVAILABLE" <<NGINXCONF
# GYDSchain Dashboard — generated by quick-fix.sh
# Re-run: sudo bash quick-fix.sh --domain your.domain.com

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Static files from the Vite build
    root ${APP_DIR}/dist;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Health endpoint
    location /health {
        return 200 '{"status":"ok"}';
        add_header Content-Type application/json;
    }

    # Proxy API + WebSocket to Express on :${APP_PORT}
    location /api/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # WebSocket upgrade for blockchain node
    location /ws {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # SPA fallback — serve index.html for all client-side routes
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }
}
NGINXCONF
ok "Wrote Nginx config: ${NGINX_AVAILABLE}"
info "  server_name = ${DOMAIN}"

# Enable site (symlink)
if [[ ! -L "$NGINX_ENABLED" ]]; then
  ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  ok "Enabled site: ${NGINX_ENABLED}"
else
  ok "Site symlink already exists"
fi

# ── 3. FIX PM2 ───────────────────────────────────────────────
hdr "Checking PM2 / application"

if ! $PM2_RUNNING; then
  warn "PM2 process 'gydschain' is not running."
  if [[ -f "${APP_DIR}/ecosystem.config.cjs" ]]; then
    info "Starting app with: pm2 start ${APP_DIR}/ecosystem.config.cjs"
    pm2 start "${APP_DIR}/ecosystem.config.cjs" --env production 2>/dev/null || true
    pm2 save 2>/dev/null || true
    ok "PM2 start attempted"
  elif [[ -f "${APP_DIR}/dist/server.js" ]]; then
    info "Starting app with: pm2 start ${APP_DIR}/dist/server.js --name gydschain"
    pm2 start "${APP_DIR}/dist/server.js" --name gydschain 2>/dev/null || true
    pm2 save 2>/dev/null || true
    ok "PM2 start attempted"
  else
    warn "Could not find ecosystem.config.cjs or dist/server.js in ${APP_DIR}"
    warn "Start the app manually: cd ${APP_DIR} && pm2 start ecosystem.config.cjs"
  fi
else
  ok "PM2 app is running"
fi

# Wait for app to be ready (up to 10s)
API_READY=false
for i in $(seq 1 10); do
  if curl -sf "http://localhost:${APP_PORT}/api/health" &>/dev/null; then
    API_READY=true
    break
  fi
  sleep 1
done

if $API_READY; then
  ok "API responds on port ${APP_PORT}"
else
  warn "API not responding on port ${APP_PORT} — check PM2 logs:"
  echo "       pm2 logs gydschain --lines 30"
fi

# ── 4. TEST + RELOAD NGINX ───────────────────────────────────
hdr "Testing and reloading Nginx"

nginx -t 2>&1 | while IFS= read -r line; do
  if echo "$line" | grep -q "successful"; then
    ok "$line"
  elif echo "$line" | grep -q "error"; then
    err "$line"
  else
    info "$line"
  fi
done

if nginx -t &>/dev/null; then
  systemctl reload nginx
  ok "Nginx reloaded"
else
  err "Nginx config has errors — fix them before reloading"
  nginx -t
  exit 1
fi

# ── 5. SUMMARY ───────────────────────────────────────────────
hdr "Result"

# Re-test after reload
if curl -sf "http://localhost:80" &>/dev/null 2>&1; then
  RESPONSE=$(curl -sf --max-time 3 "http://localhost:80" 2>/dev/null || echo "")
  if echo "$RESPONSE" | grep -qi "welcome to nginx"; then
    err "Still seeing 'Welcome to nginx' — try hard-refreshing or check firewall rules"
  elif echo "$RESPONSE" | grep -qi "chaincore\|gyds\|<!DOCTYPE"; then
    ok "App is now served by Nginx on port 80 ✓"
  else
    ok "Nginx responded (not the default page) ✓"
  fi
else
  info "Could not reach port 80 locally — check UFW: sudo ufw allow 'Nginx Full'"
fi

echo ""
echo -e "${BOLD}Next steps:${RESET}"
if [[ "$DOMAIN" == "_" ]]; then
  echo "  • Visit http://${SERVER_IP} in your browser"
  echo "  • For a domain: sudo bash quick-fix.sh --domain app.netlifegy.com"
else
  echo "  • Visit http://${DOMAIN} in your browser"
  echo "  • For HTTPS: sudo certbot --nginx -d ${DOMAIN}"
fi
echo "  • PM2 status:  pm2 status"
echo "  • PM2 logs:    pm2 logs gydschain --lines 50"
echo "  • Nginx error: sudo tail -f /var/log/nginx/error.log"
echo ""
ok "quick-fix.sh completed"
