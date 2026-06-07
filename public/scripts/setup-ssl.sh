#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  GYDSchain — SSL Certificate Setup
#  Installs TLS certificates for your domain using Let's Encrypt (certbot).
#
#  Supports two certificate methods:
#   1. HTTP-01 challenge  — simple, works without Cloudflare API key
#   2. DNS-01 challenge   — required if port 80 is blocked (Cloudflare proxy)
#
#  Usage:
#    Basic (HTTP challenge):
#      DOMAIN=yourdomain.com EMAIL=admin@yourdomain.com sudo -E bash setup-ssl.sh
#
#    With Cloudflare DNS challenge:
#      DOMAIN=yourdomain.com EMAIL=admin@yourdomain.com \
#      CF_API_TOKEN=your_cloudflare_api_token \
#      sudo -E bash setup-ssl.sh
#
#    Multi-domain (SAN cert):
#      DOMAIN=yourdomain.com EMAIL=admin@yourdomain.com \
#      EXTRA_DOMAINS="rpc.yourdomain.com,explorer.yourdomain.com,ws.yourdomain.com" \
#      CF_API_TOKEN=your_cloudflare_api_token \
#      sudo -E bash setup-ssl.sh
#
#    Cloudflare Origin Certificate (no Let's Encrypt needed):
#      DOMAIN=yourdomain.com EMAIL=admin@yourdomain.com \
#      CF_ORIGIN_CERT=1 CF_API_TOKEN=your_cloudflare_api_token \
#      sudo -E bash setup-ssl.sh
#
#  Environment variables:
#    DOMAIN             Main domain (required)  e.g. netlifegy.com
#    EMAIL              Your email for cert expiry notices (required)
#    EXTRA_DOMAINS      Comma-separated additional domains/subdomains
#    CF_API_TOKEN       Cloudflare API token (enables DNS-01 challenge)
#    CF_ORIGIN_CERT     Set to 1 to issue a Cloudflare Origin Certificate
#    STAGING            Set to 1 to use Let's Encrypt staging (test without rate limits)
#    WEBROOT_PATH       Nginx webroot for HTTP challenge (default: /var/www/html)
#    NGINX_CONF_DIR     Nginx config dir (default: /etc/nginx/sites-available)
#    CERT_DIR           Where certs will live (default: /etc/letsencrypt/live/$DOMAIN)
#    AUTO_RELOAD_NGINX  Set to 0 to skip nginx reload after cert issue (default: 1)
#
#  After running, nginx is automatically configured with:
#    - TLS 1.2 / 1.3 only
#    - HSTS (max-age 1 year, includeSubDomains)
#    - OCSP stapling
#    - Auto-renewal cron (certbot renew)
#
#  Tested on: Ubuntu 22.04 LTS
# ═══════════════════════════════════════════════════════════════════════════

set -Eeuo pipefail
IFS=$'\n\t'

# ── Colour helpers ────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
step()    { echo -e "\n${BOLD}──── $* ────${NC}"; }

# ── Defaults ──────────────────────────────────────────────────────────────
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
EXTRA_DOMAINS="${EXTRA_DOMAINS:-}"
CF_API_TOKEN="${CF_API_TOKEN:-}"
CF_ORIGIN_CERT="${CF_ORIGIN_CERT:-0}"
STAGING="${STAGING:-0}"
WEBROOT_PATH="${WEBROOT_PATH:-/var/www/html}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/etc/nginx/sites-available}"
AUTO_RELOAD_NGINX="${AUTO_RELOAD_NGINX:-1}"

# ── Validate ──────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Run as root: sudo -E bash $0"
[[ -z "$DOMAIN" ]]  && error "DOMAIN is required. e.g. DOMAIN=yourdomain.com"
[[ -z "$EMAIL" ]]   && error "EMAIL is required.  e.g. EMAIL=admin@yourdomain.com"

CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

echo -e """
${BOLD}╔══════════════════════════════════════════════╗
║        GYDSchain SSL Certificate Setup        ║
╚══════════════════════════════════════════════╝${NC}

  Domain  : ${CYAN}${DOMAIN}${NC}
  Email   : ${EMAIL}
  Method  : $([ -n "$CF_API_TOKEN" ] && [ "$CF_ORIGIN_CERT" = "1" ] && echo "Cloudflare Origin Cert" || ( [ -n "$CF_API_TOKEN" ] && echo "DNS-01 (Cloudflare)" || echo "HTTP-01 (webroot)" ))
  Staging : $([ "$STAGING" = "1" ] && echo "${YELLOW}YES (test mode)${NC}" || echo "No (production)")
  Extra   : ${EXTRA_DOMAINS:-none}
"""

# ── Step 1: System packages ───────────────────────────────────────────────
step "Installing dependencies"
apt-get update -qq
apt-get install -y -qq curl wget nginx openssl jq software-properties-common
success "Base packages ready"

# ── Step 2: Install certbot ───────────────────────────────────────────────
step "Installing certbot"
if ! command -v certbot &>/dev/null; then
  snap install --classic certbot 2>/dev/null || \
  apt-get install -y -qq certbot python3-certbot-nginx || \
  { add-apt-repository -y ppa:certbot/certbot; apt-get install -y -qq certbot python3-certbot-nginx; }
  ln -sf "$(command -v certbot)" /usr/local/bin/certbot 2>/dev/null || true
  success "certbot installed"
else
  success "certbot already installed ($(certbot --version 2>&1 | head -1))"
fi

# ── Step 3: Cloudflare DNS plugin (if CF token provided) ──────────────────
if [[ -n "$CF_API_TOKEN" && "$CF_ORIGIN_CERT" != "1" ]]; then
  step "Installing certbot Cloudflare DNS plugin"
  pip3 install certbot-dns-cloudflare -q 2>/dev/null || \
  apt-get install -y -qq python3-certbot-dns-cloudflare || \
  snap install certbot-dns-cloudflare 2>/dev/null || true

  CF_CREDS_FILE="/root/.certbot-cloudflare.ini"
  cat >"$CF_CREDS_FILE" <<EOF
dns_cloudflare_api_token = ${CF_API_TOKEN}
EOF
  chmod 600 "$CF_CREDS_FILE"
  success "Cloudflare credentials written to $CF_CREDS_FILE"
fi

# ── Step 4: Stop nginx briefly for HTTP challenge (if no CF token) ────────
if [[ -z "$CF_API_TOKEN" || "$CF_ORIGIN_CERT" = "1" ]]; then
  if systemctl is-active --quiet nginx 2>/dev/null; then
    info "Briefly stopping nginx for HTTP challenge..."
    systemctl stop nginx
    RESTART_NGINX=1
  else
    RESTART_NGINX=0
  fi
fi

# ── Step 5: Issue certificate ─────────────────────────────────────────────
step "Issuing TLS certificate"

# Build domain flags
DOMAIN_FLAGS="-d ${DOMAIN}"
if [[ -n "$EXTRA_DOMAINS" ]]; then
  while IFS=',' read -ra ADDR; do
    for d in "${ADDR[@]}"; do
      d="${d// /}"
      [[ -n "$d" ]] && DOMAIN_FLAGS="$DOMAIN_FLAGS -d $d"
    done
  done <<< "$EXTRA_DOMAINS"
fi

STAGING_FLAG=""
[[ "$STAGING" = "1" ]] && STAGING_FLAG="--staging" && warn "Using Let's Encrypt STAGING environment"

if [[ "$CF_ORIGIN_CERT" = "1" && -n "$CF_API_TOKEN" ]]; then
  # ── Cloudflare Origin Certificate (15-year cert, Cloudflare-signed) ──
  step "Generating Cloudflare Origin Certificate via API"
  CF_ZONE_NAME="$DOMAIN"
  HOSTNAMES="[\"${DOMAIN}\",\"*.${DOMAIN}\"]"

  if [[ -n "$EXTRA_DOMAINS" ]]; then
    while IFS=',' read -ra ADDR; do
      for d in "${ADDR[@]}"; do
        d="${d// /}"
        [[ -n "$d" ]] && HOSTNAMES="${HOSTNAMES%]},\"${d}\"]"
      done
    done <<< "$EXTRA_DOMAINS"
  fi

  ORIGIN_CERT_JSON=$(curl -s -X POST "https://api.cloudflare.com/client/v4/certificates" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"hostnames\":${HOSTNAMES},\"requested_validity\":5475,\"request_type\":\"origin-rsa\",\"csr\":\"\"}")

  CF_SUCCESS=$(echo "$ORIGIN_CERT_JSON" | jq -r '.success')
  if [[ "$CF_SUCCESS" != "true" ]]; then
    warn "Cloudflare Origin Cert API failed. Falling back to Let's Encrypt DNS challenge."
    CF_ORIGIN_CERT=0
  else
    mkdir -p "$CERT_DIR"
    echo "$ORIGIN_CERT_JSON" | jq -r '.result.certificate'  > "${CERT_DIR}/fullchain.pem"
    echo "$ORIGIN_CERT_JSON" | jq -r '.result.private_key'  > "${CERT_DIR}/privkey.pem"
    cp "${CERT_DIR}/fullchain.pem" "${CERT_DIR}/chain.pem"
    chmod 600 "${CERT_DIR}/privkey.pem"
    success "Cloudflare Origin Certificate issued (valid 15 years)"
    SKIP_CERTBOT=1
  fi
else
  SKIP_CERTBOT=0
fi

if [[ "${SKIP_CERTBOT:-0}" = "0" ]]; then
  if [[ -n "$CF_API_TOKEN" ]]; then
    # DNS-01 challenge via Cloudflare
    certbot certonly \
      --dns-cloudflare \
      --dns-cloudflare-credentials /root/.certbot-cloudflare.ini \
      --dns-cloudflare-propagation-seconds 30 \
      $STAGING_FLAG \
      $DOMAIN_FLAGS \
      --email "$EMAIL" \
      --agree-tos \
      --non-interactive \
      --keep-until-expiring
  else
    # HTTP-01 webroot challenge
    mkdir -p "$WEBROOT_PATH"
    certbot certonly \
      --standalone \
      $STAGING_FLAG \
      $DOMAIN_FLAGS \
      --email "$EMAIL" \
      --agree-tos \
      --non-interactive \
      --keep-until-expiring
  fi
  success "Certificate issued and saved to $CERT_DIR"
fi

# ── Restart nginx if we stopped it ───────────────────────────────────────
if [[ "${RESTART_NGINX:-0}" = "1" ]]; then
  systemctl start nginx 2>/dev/null || true
fi

# ── Step 6: Generate DH params (if not present) ──────────────────────────
step "Generating DH parameters (this may take ~60 seconds)"
DH_FILE="/etc/ssl/dhparam.pem"
if [[ ! -f "$DH_FILE" ]]; then
  openssl dhparam -out "$DH_FILE" 2048 2>/dev/null
  success "DH params generated"
else
  success "DH params already exist"
fi

# ── Step 7: Write nginx TLS config ───────────────────────────────────────
step "Writing nginx HTTPS configuration"
mkdir -p "$NGINX_CONF_DIR"
NGINX_SITE="${NGINX_CONF_DIR}/${DOMAIN}"

# Build server_name line
SERVER_NAME="$DOMAIN"
if [[ -n "$EXTRA_DOMAINS" ]]; then
  while IFS=',' read -ra ADDR; do
    for d in "${ADDR[@]}"; do
      d="${d// /}"
      [[ -n "$d" ]] && SERVER_NAME="$SERVER_NAME $d"
    done
  done <<< "$EXTRA_DOMAINS"
fi

cat >"$NGINX_SITE" <<NGINXCONF
# GYDSchain — ${DOMAIN} — managed by setup-ssl.sh
# Generated: $(date -u)

# Redirect HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS — main site
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${SERVER_NAME};

    # ── TLS certificates ──────────────────────────────────────────────
    ssl_certificate     ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;

    # ── TLS hardening ─────────────────────────────────────────────────
    ssl_protocols             TLSv1.2 TLSv1.3;
    ssl_ciphers               'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers off;
    ssl_session_cache         shared:SSL:10m;
    ssl_session_timeout       1d;
    ssl_session_tickets       off;
    ssl_dhparam               /etc/ssl/dhparam.pem;
    ssl_stapling              on;
    ssl_stapling_verify       on;
    resolver                  1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout          5s;

    # ── Security headers ──────────────────────────────────────────────
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-Frame-Options           "SAMEORIGIN" always;
    add_header X-XSS-Protection          "1; mode=block" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "geolocation=(), camera=(), microphone=()" always;
    add_header Content-Security-Policy   "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:; font-src 'self'; frame-ancestors 'none';" always;

    # ── Root / app ────────────────────────────────────────────────────
    root /var/www/${DOMAIN}/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Static asset caching
    location ~* \\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|otf|eot)$ {
        expires     1y;
        add_header  Cache-Control "public, immutable";
        access_log  off;
    }

    # Block shell scripts from being served
    location ~* \\.sh$ {
        deny all;
        return 403;
    }

    # Health endpoint
    location = /health {
        access_log  off;
        add_header  Content-Type text/plain;
        return      200 "ok\\n";
    }

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript
               image/svg+xml;

    access_log  /var/log/nginx/${DOMAIN}-access.log;
    error_log   /var/log/nginx/${DOMAIN}-error.log;
}
NGINXCONF
success "nginx config written to $NGINX_SITE"

# Enable site
ENABLED_LINK="/etc/nginx/sites-enabled/${DOMAIN}"
if [[ ! -L "$ENABLED_LINK" ]]; then
  ln -sf "$NGINX_SITE" "$ENABLED_LINK"
  success "Site enabled"
fi

# Test nginx config
nginx -t && success "nginx config syntax OK" || error "nginx config test FAILED — check $NGINX_SITE"

# ── Step 8: Reload nginx ─────────────────────────────────────────────────
if [[ "$AUTO_RELOAD_NGINX" = "1" ]]; then
  step "Reloading nginx"
  systemctl reload nginx && success "nginx reloaded" || systemctl restart nginx
fi

# ── Step 9: Auto-renewal cron ────────────────────────────────────────────
step "Setting up auto-renewal"
if [[ "${SKIP_CERTBOT:-0}" = "0" ]]; then
  # certbot installs its own timer — verify it's enabled
  if systemctl list-timers --all 2>/dev/null | grep -q certbot; then
    success "Certbot systemd timer already active"
  else
    # Fallback: cron entry
    CRON_LINE="0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx' >> /var/log/certbot-renew.log 2>&1"
    (crontab -l 2>/dev/null | grep -v certbot; echo "$CRON_LINE") | crontab -
    success "Auto-renewal cron added (daily at 03:00)"
  fi
else
  warn "Cloudflare Origin Certs are valid for 15 years — no renewal needed."
  warn "Reminder: re-run this script a few months before expiry to reissue."
fi

# ── Step 10: Firewall (ufw) ──────────────────────────────────────────────
step "Configuring firewall"
if command -v ufw &>/dev/null; then
  ufw allow 80/tcp  comment "HTTP (redirect to HTTPS)" >/dev/null 2>&1 || true
  ufw allow 443/tcp comment "HTTPS"                    >/dev/null 2>&1 || true
  success "ufw rules added for ports 80 and 443"
else
  warn "ufw not found — open ports 80 and 443 manually"
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo -e """
${GREEN}${BOLD}════════════════════════════════════════════
  SSL Setup Complete!
════════════════════════════════════════════${NC}

  Certificate : ${CERT_DIR}/fullchain.pem
  Private key : ${CERT_DIR}/privkey.pem
  nginx site  : ${NGINX_SITE}
  Renews      : $([ "${SKIP_CERTBOT:-0}" = "0" ] && echo "Automatically (certbot)" || echo "15 years (Cloudflare Origin Cert)")

  Test your site:
    ${CYAN}curl -I https://${DOMAIN}/health${NC}

  Check SSL grade:
    ${CYAN}https://www.ssllabs.com/ssltest/analyze.html?d=${DOMAIN}${NC}

${YELLOW}If using Cloudflare Proxy (orange cloud):${NC}
  - Make sure SSL/TLS mode is set to 'Full (strict)' in Cloudflare dashboard
  - Enable HSTS in Cloudflare (Edge Certificates → HSTS)
  - Add a Page Rule: http://${DOMAIN}/* → Always Use HTTPS
"""
