#!/usr/bin/env bash
# ============================================================
# GYDSchain — pgAdmin 4 (web mode) installer for Ubuntu
# ============================================================
# Optional companion to setup-postgres-ubuntu.sh.
# Installs pgAdmin 4 in web mode, served by Apache on 127.0.0.1
# and reverse-proxied by nginx at https://<host>/pgadmin
# (CloudPanel-friendly: nothing is published on 0.0.0.0 directly).
#
# Usage:
#   sudo bash install-pgadmin.sh
#
# Optional env vars:
#   PGADMIN_EMAIL     — login email     (default: admin@<DOMAIN>)
#   PGADMIN_PASSWORD  — login password  (default: auto-generated)
#   PGADMIN_PORT      — local bind port (default: 5050)
#   PGADMIN_PATH      — nginx path      (default: /pgadmin)
#   DOMAIN            — your domain     (default: netlifegy.com)
#   SKIP_NGINX        — "true" to skip the nginx snippet
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $*"; }
step() { echo -e "\n${BOLD}══ $* ══${NC}"; }

[[ $EUID -eq 0 ]] || err "Run as root: sudo bash install-pgadmin.sh"

DOMAIN="${DOMAIN:-netlifegy.com}"
PGADMIN_EMAIL="${PGADMIN_EMAIL:-admin@${DOMAIN}}"
PGADMIN_PASSWORD="${PGADMIN_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 20)}"
PGADMIN_PORT="${PGADMIN_PORT:-5050}"
PGADMIN_PATH="${PGADMIN_PATH:-/pgadmin}"
SKIP_NGINX="${SKIP_NGINX:-false}"
CREDS_FILE="/opt/gydschain/.pgadmin-credentials"

mkdir -p /opt/gydschain

# ═══ 1/4 — Install pgAdmin 4 web ═══════════════════════════
step "1/4 — Install pgAdmin 4 (web)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg apache2-utils >/dev/null

if ! command -v /usr/pgadmin4/bin/setup-web.sh &>/dev/null; then
  curl -fsSL https://www.pgadmin.org/static/packages_pgadmin_org.pub \
    | gpg --dearmor -o /usr/share/keyrings/packages-pgadmin-org.gpg
  echo "deb [signed-by=/usr/share/keyrings/packages-pgadmin-org.gpg] https://ftp.postgresql.org/pub/pgadmin/pgadmin4/apt/$(lsb_release -cs) pgadmin4 main" \
    > /etc/apt/sources.list.d/pgadmin4.list
  apt-get update -qq
  apt-get install -y -qq pgadmin4-web || err "pgAdmin package install failed"
  log "pgAdmin 4 installed"
else
  info "pgAdmin 4 already installed — reconfiguring"
fi

# ═══ 2/4 — Configure web mode (non-interactive) ════════════
step "2/4 — Configure pgAdmin web mode"
export PGADMIN_SETUP_EMAIL="$PGADMIN_EMAIL"
export PGADMIN_SETUP_PASSWORD="$PGADMIN_PASSWORD"
/usr/pgadmin4/bin/setup-web.sh --yes >/dev/null 2>&1 || warn "setup-web.sh reported issues (may already be configured)"
log "pgAdmin login: ${PGADMIN_EMAIL}"

# ═══ 3/4 — Bind Apache to localhost only ═══════════════════
step "3/4 — Bind Apache to 127.0.0.1:${PGADMIN_PORT}"
if [ -f /etc/apache2/ports.conf ]; then
  # Never expose pgAdmin's Apache publicly — nginx/CloudPanel fronts it.
  if ! grep -q "127.0.0.1:${PGADMIN_PORT}" /etc/apache2/ports.conf; then
    sed -i "s/^Listen 80$/Listen 127.0.0.1:${PGADMIN_PORT}/" /etc/apache2/ports.conf
    grep -q "^Listen 127.0.0.1:${PGADMIN_PORT}" /etc/apache2/ports.conf \
      || echo "Listen 127.0.0.1:${PGADMIN_PORT}" >> /etc/apache2/ports.conf
  fi
  for vh in /etc/apache2/sites-enabled/*.conf; do
    [ -f "$vh" ] && sed -i "s/<VirtualHost \*:80>/<VirtualHost 127.0.0.1:${PGADMIN_PORT}>/" "$vh"
  done
  systemctl enable apache2 >/dev/null 2>&1 || true
  systemctl restart apache2 || warn "apache2 restart failed — check 'journalctl -u apache2'"
  log "Apache bound to 127.0.0.1:${PGADMIN_PORT}"
fi

command -v ufw &>/dev/null && ufw deny "${PGADMIN_PORT}"/tcp >/dev/null 2>&1 || true

# ═══ 4/4 — nginx reverse proxy snippet ═════════════════════
step "4/4 — nginx reverse proxy"
if [[ "$SKIP_NGINX" != "true" ]] && command -v nginx &>/dev/null; then
  mkdir -p /etc/nginx/snippets
  cat > /etc/nginx/snippets/gyds-pgadmin.conf <<EOF
# GYDSchain — pgAdmin 4 reverse proxy (include this inside a server block)
location ${PGADMIN_PATH}/ {
    proxy_pass         http://127.0.0.1:${PGADMIN_PORT}${PGADMIN_PATH}/;
    proxy_set_header   Host \$host;
    proxy_set_header   X-Real-IP \$remote_addr;
    proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto \$scheme;
    proxy_set_header   X-Script-Name ${PGADMIN_PATH};
    proxy_read_timeout 300s;
}
EOF
  log "Snippet written: /etc/nginx/snippets/gyds-pgadmin.conf"
  info "Add to your site (or CloudPanel vhost 'Additional Nginx Settings'):"
  echo -e "    ${CYAN}include /etc/nginx/snippets/gyds-pgadmin.conf;${NC}"
  nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
else
  info "nginx step skipped — proxy 127.0.0.1:${PGADMIN_PORT} from CloudPanel yourself"
fi

# ─── Credentials ───────────────────────────────────────────
cat > "$CREDS_FILE" <<EOF
PGADMIN_URL=https://${DOMAIN}${PGADMIN_PATH}/
PGADMIN_EMAIL=${PGADMIN_EMAIL}
PGADMIN_PASSWORD=${PGADMIN_PASSWORD}
PGADMIN_LOCAL=http://127.0.0.1:${PGADMIN_PORT}${PGADMIN_PATH}/
EOF
chmod 600 "$CREDS_FILE"

echo ""
echo -e "${BOLD}═══ pgAdmin Ready ═══${NC}"
echo -e "  URL:      ${CYAN}https://${DOMAIN}${PGADMIN_PATH}/${NC}"
echo -e "  Email:    ${CYAN}${PGADMIN_EMAIL}${NC}"
echo -e "  Password: ${CYAN}${PGADMIN_PASSWORD}${NC}"
echo -e "  Saved to: ${CYAN}${CREDS_FILE}${NC} (chmod 600)"
echo ""
echo -e "  Connect to the local database with host ${BOLD}127.0.0.1${NC}, port ${BOLD}5432${NC}."
log "pgAdmin installation complete 🐘"
