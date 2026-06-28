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

# ── Optional extras (skippable) ───────────────────────────────────────────────
ADMIN_WALLET="${ADMIN_WALLET:-}"
FOUNDER_WALLET="${FOUNDER_WALLET:-}"
REWARD_ADDRESS="${REWARD_ADDRESS:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
HCAPTCHA_SITE_KEY="${HCAPTCHA_SITE_KEY:-}"
HCAPTCHA_SECRET_KEY="${HCAPTCHA_SECRET_KEY:-}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_FROM="${SMTP_FROM:-}"
WA_TOKEN="${WA_TOKEN:-}"
WA_PHONE_ID="${WA_PHONE_ID:-}"
GYDS_BOOTSTRAP_NODES="${GYDS_BOOTSTRAP_NODES:-}"

# Helper: prompt with current value shown; Enter = keep/skip
prompt_opt() {
  local varname="$1" label="$2"
  local current; current="${!varname:-}"
  if [[ -n "$current" ]]; then
    read -rp "  ${label} [${current}]: " _v || true
    [[ -n "$_v" ]] && printf -v "$varname" '%s' "$_v" || true
  else
    read -rp "  ${label} (Enter to skip): " _v || true
    [[ -n "$_v" ]] && printf -v "$varname" '%s' "$_v" || true
  fi
}

# Only prompt interactively (skip if NONINTERACTIVE=1 or piped)
if [[ "${NONINTERACTIVE:-0}" != "1" ]] && [[ -t 0 ]]; then
  echo ""
  echo -e "${BOLD}${CYAN}━━━ Optional Configuration  (press Enter to skip any) ━━━${NC}"

  echo ""
  echo -e "${YELLOW}  ▸ Wallets${NC}"
  prompt_opt ADMIN_WALLET        "Admin wallet address    (0x...)"
  prompt_opt FOUNDER_WALLET      "Founder wallet address  (0x...)"
  prompt_opt REWARD_ADDRESS      "Mining/reward wallet    (0x...)"

  echo ""
  echo -e "${YELLOW}  ▸ Repository access${NC}"
  prompt_opt GITHUB_TOKEN        "GitHub Personal Access Token"

  echo ""
  echo -e "${YELLOW}  ▸ hCaptcha (faucet protection)${NC}"
  prompt_opt HCAPTCHA_SITE_KEY   "hCaptcha site key   (public, sent to browser)"
  prompt_opt HCAPTCHA_SECRET_KEY "hCaptcha secret key (server-side only)"

  echo ""
  echo -e "${YELLOW}  ▸ Telegram alerts${NC}"
  prompt_opt TELEGRAM_BOT_TOKEN  "Telegram bot token"
  prompt_opt TELEGRAM_CHAT_ID    "Telegram chat ID"

  echo ""
  echo -e "${YELLOW}  ▸ Email / SMTP${NC}"
  prompt_opt SMTP_HOST           "SMTP host  (e.g. smtp.gmail.com)"
  prompt_opt SMTP_PORT           "SMTP port  [587]"
  prompt_opt SMTP_USER           "SMTP username / email"
  prompt_opt SMTP_PASS           "SMTP password"
  prompt_opt SMTP_FROM           "From email address"

  echo ""
  echo -e "${YELLOW}  ▸ WhatsApp (Meta Business API)${NC}"
  prompt_opt WA_TOKEN            "WhatsApp API token"
  prompt_opt WA_PHONE_ID         "WhatsApp phone number ID"

  echo ""
  echo -e "${YELLOW}  ▸ Network${NC}"
  prompt_opt GYDS_BOOTSTRAP_NODES "Bootstrap node(s) (comma-separated enode://...)"

  echo ""
fi

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

# ── Ask whether to use an existing DB or create a new one ────────────────────
echo ""
echo -e "${CYAN}PostgreSQL setup:${NC}"
echo "  [1] Create a new local database (auto-configure)"
echo "  [2] Use an existing database (provide connection details)"
echo ""
if [[ -n "${DATABASE_URL:-}" ]]; then
    echo -e "${YELLOW}DATABASE_URL is already set in environment — using it.${NC}"
    echo "  DATABASE_URL: ${DATABASE_URL}"
    read -rp "  Use this existing value? (Y/n) " -n 1 _use_existing; echo
    if [[ ! "$_use_existing" =~ ^[Nn]$ ]]; then
        PG_MODE="existing_url"
    else
        unset DATABASE_URL
        PG_MODE=""
    fi
fi

if [[ -z "${PG_MODE:-}" ]]; then
    read -rp "Choice [1/2]: " -n 1 PG_CHOICE; echo
    if [[ "$PG_CHOICE" == "2" ]]; then
        PG_MODE="existing"
        echo ""
        echo -e "${CYAN}Enter your PostgreSQL connection details:${NC}"
        read -rp "  Host         [localhost]: " PG_HOST;   PG_HOST="${PG_HOST:-localhost}"
        read -rp "  Port         [5432]:      " PG_PORT;   PG_PORT="${PG_PORT:-5432}"
        read -rp "  Database name:            " PG_DBNAME
        read -rp "  Username:                 " PG_USER
        read -rsp "  Password:                 " PG_PASS; echo
        [[ -z "$PG_DBNAME" || -z "$PG_USER" ]] && { err "Database name and username are required."; exit 1; }
        DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/${PG_DBNAME}"
        echo ""
        info "Testing connection..."
        if ! psql "$DATABASE_URL" -c "SELECT 1;" &>/dev/null; then
            err "Cannot connect to PostgreSQL with those credentials. Check host/port/user/password and try again."
            exit 1
        fi
        log "Connection OK → ${PG_HOST}:${PG_PORT}/${PG_DBNAME}"
    else
        PG_MODE="new"
        systemctl enable postgresql --now 2>/dev/null || true
        sleep 2
        PG_DBNAME="${PG_DBNAME:-gydschain}"
        PG_USER="${PG_USER:-gydschain}"
        PG_PASS="${PG_PASS:-$(openssl rand -hex 16)}"
        echo ""
        echo -e "${CYAN}New local database will be created with these settings:${NC}"
        echo "  Database: $PG_DBNAME"
        echo "  User:     $PG_USER"
        echo "  Password: $PG_PASS"
        echo ""
        read -rp "  Customise these values? (y/N) " -n 1 _custom; echo
        if [[ "$_custom" =~ ^[Yy]$ ]]; then
            read -rp "  Database name [$PG_DBNAME]: " _in; [[ -n "$_in" ]] && PG_DBNAME="$_in"
            read -rp "  Username      [$PG_USER]:   " _in; [[ -n "$_in" ]] && PG_USER="$_in"
            read -rsp "  Password (leave blank to keep generated): " _in; echo
            [[ -n "$_in" ]] && PG_PASS="$_in"
        fi
        su - postgres -c "psql -qc \"SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'\" | grep -q 1 || psql -qc \"CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';\"" 2>/dev/null || true
        su - postgres -c "psql -qc \"SELECT 1 FROM pg_database WHERE datname='${PG_DBNAME}'\" | grep -q 1 || psql -qc \"CREATE DATABASE ${PG_DBNAME} OWNER ${PG_USER};\"" 2>/dev/null || true
        DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@localhost/${PG_DBNAME}"
    fi
fi

# ── Check for existing data — warn before any migration runs ─────────────────
_EXISTING_TABLES=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>/dev/null | tr -d ' ' || echo "0")
if [[ "$_EXISTING_TABLES" -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}┌─────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│  ⚠  EXISTING DATABASE DETECTED                                   │${NC}"
    echo -e "${YELLOW}│                                                                   │${NC}"
    printf  "${YELLOW}│  Found ${BOLD}%-2s table(s)${NC}${YELLOW} in database '%-30s' │${NC}\n" "$_EXISTING_TABLES" "${PG_DBNAME:-$DATABASE_URL}"
    echo -e "${YELLOW}│                                                                   │${NC}"
    echo -e "${YELLOW}│  The migration step will run IF NOT EXISTS / ON CONFLICT DO      │${NC}"
    echo -e "${YELLOW}│  NOTHING statements — it will NOT drop or overwrite existing      │${NC}"
    echo -e "${YELLOW}│  rows. However, schema changes (ALTER TABLE / new columns) will  │${NC}"
    echo -e "${YELLOW}│  be applied.                                                      │${NC}"
    echo -e "${YELLOW}│                                                                   │${NC}"
    echo -e "${YELLOW}│  Your existing data is safe UNLESS you chose to wipe the DB.     │${NC}"
    echo -e "${YELLOW}└─────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    read -rp "Continue and apply migrations to the existing database? (y/N) " -n 1 _mig_ok; echo
    [[ "$_mig_ok" =~ ^[Yy]$ ]] || { warn "Aborted — no changes made to the database."; exit 0; }
fi

log "Database ready: ${PG_DBNAME:-${DATABASE_URL%%@*}@...} (${_EXISTING_TABLES} existing tables)"

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

APP_URL="${APP_URL:-https://${FQDN}}"

# ── Write .env ────────────────────────────────────────────────────────────────
{
  echo "NODE_ENV=${NODE_ENV}"
  echo "PORT=${PORT_API}"
  echo "DATABASE_URL=${DATABASE_URL}"
  echo "SESSION_SECRET=${SESSION_SECRET}"
  echo "APP_URL=${APP_URL}"
  echo "REPLIT_DOMAINS=${FQDN},${DOMAIN}"
  echo "SUBDOMAIN=${SUBDOMAIN}"
  [[ -n "$ADMIN_WALLET"         ]] && echo "ADMIN_WALLET=${ADMIN_WALLET}"
  [[ -n "$FOUNDER_WALLET"       ]] && echo "FOUNDER_WALLET=${FOUNDER_WALLET}"
  [[ -n "$REWARD_ADDRESS"       ]] && echo "REWARD_ADDRESS=${REWARD_ADDRESS}"
  [[ -n "$GITHUB_TOKEN"         ]] && echo "GITHUB_TOKEN=${GITHUB_TOKEN}"
  [[ -n "$HCAPTCHA_SITE_KEY"    ]] && echo "VITE_HCAPTCHA_SITE_KEY=${HCAPTCHA_SITE_KEY}"
  [[ -n "$HCAPTCHA_SECRET_KEY"  ]] && echo "HCAPTCHA_SECRET_KEY=${HCAPTCHA_SECRET_KEY}"
  [[ -n "$TELEGRAM_BOT_TOKEN"   ]] && echo "TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}"
  [[ -n "$TELEGRAM_CHAT_ID"     ]] && echo "TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}"
  [[ -n "$SMTP_HOST"            ]] && echo "SMTP_HOST=${SMTP_HOST}"
  [[ -n "$SMTP_PORT"            ]] && echo "SMTP_PORT=${SMTP_PORT}"
  [[ -n "$SMTP_USER"            ]] && echo "SMTP_USER=${SMTP_USER}"
  [[ -n "$SMTP_PASS"            ]] && echo "SMTP_PASS=${SMTP_PASS}"
  [[ -n "$SMTP_FROM"            ]] && echo "SMTP_FROM=${SMTP_FROM}"
  [[ -n "$WA_TOKEN"             ]] && echo "WHATSAPP_TOKEN=${WA_TOKEN}"
  [[ -n "$WA_PHONE_ID"          ]] && echo "WHATSAPP_PHONE_ID=${WA_PHONE_ID}"
  [[ -n "$GYDS_BOOTSTRAP_NODES" ]] && echo "GYDS_BOOTSTRAP_NODES=${GYDS_BOOTSTRAP_NODES}"
} > "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
id -u "$NODE_USER" &>/dev/null && chown "$NODE_USER:$NODE_USER" "$APP_DIR/.env" || true

# ── Write shared gyds-config.env (sourced by node/install scripts) ────────────
# This file is safe to source from any sibling deploy script.
# Only non-empty values are written, so sourcing it never clears a variable
# that was already set in the environment.
{
  echo "# GYDSchain shared configuration — auto-generated by deploy-dashboard.sh"
  echo "# Source this file at the top of any install/deploy script:"
  echo "#   GYDS_CONF=\"\${GYDS_CONF:-/var/www/gydschain/gyds-config.env}\""
  echo "#   [[ -f \"\$GYDS_CONF\" ]] && source \"\$GYDS_CONF\""
  echo ""
  echo "GYDS_CHAIN_ID=13370"
  echo "DOMAIN=${DOMAIN}"
  echo "FQDN=${FQDN}"
  [[ -n "$ADMIN_WALLET"         ]] && echo "GYDS_ADMIN_WALLET=${ADMIN_WALLET}"
  [[ -n "$FOUNDER_WALLET"       ]] && echo "GYDS_FOUNDER_WALLET=${FOUNDER_WALLET}"
  [[ -n "$REWARD_ADDRESS"       ]] && echo "GYDS_REWARD_ADDRESS=${REWARD_ADDRESS}"
  [[ -n "$REWARD_ADDRESS"       ]] && echo "GYDS_MINING_WALLET=${REWARD_ADDRESS}"
  [[ -n "$GITHUB_TOKEN"         ]] && echo "GITHUB_TOKEN=${GITHUB_TOKEN}"
  [[ -n "$TELEGRAM_BOT_TOKEN"   ]] && echo "TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}"
  [[ -n "$TELEGRAM_CHAT_ID"     ]] && echo "TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}"
  [[ -n "$SMTP_HOST"            ]] && echo "SMTP_HOST=${SMTP_HOST}"
  [[ -n "$SMTP_PORT"            ]] && echo "SMTP_PORT=${SMTP_PORT}"
  [[ -n "$SMTP_USER"            ]] && echo "SMTP_USER=${SMTP_USER}"
  [[ -n "$SMTP_PASS"            ]] && echo "SMTP_PASS=${SMTP_PASS}"
  [[ -n "$SMTP_FROM"            ]] && echo "SMTP_FROM=${SMTP_FROM}"
  [[ -n "$WA_TOKEN"             ]] && echo "WHATSAPP_TOKEN=${WA_TOKEN}"
  [[ -n "$WA_PHONE_ID"          ]] && echo "WHATSAPP_PHONE_ID=${WA_PHONE_ID}"
  [[ -n "$GYDS_BOOTSTRAP_NODES" ]] && echo "GYDS_BOOTSTRAP_NODES=${GYDS_BOOTSTRAP_NODES}"
} > "$APP_DIR/gyds-config.env"
chmod 644 "$APP_DIR/gyds-config.env"
id -u "$NODE_USER" &>/dev/null && chown "$NODE_USER:$NODE_USER" "$APP_DIR/gyds-config.env" || true
log "Shared config written → $APP_DIR/gyds-config.env"

cd "$APP_DIR"

# ── Reset npm to public registry ──────────────────────────────────────────────
# package-lock.json generated inside Replit has all resolved URLs pointing to
# package-firewall.replit.local (Replit's internal mirror), which is unreachable
# on any external server.  Three-step purge:
#   1. Force user-level registry to npmjs.org
#   2. Delete the lock file so npm regenerates it cleanly
#   3. Purge the npm cache so no stale .tgz files from the Replit mirror survive
npm config set registry https://registry.npmjs.org/
# Also remove any project-level .npmrc that might override the registry
rm -f .npmrc
rm -f package-lock.json
npm cache clean --force 2>/dev/null || true
log "  npm registry → registry.npmjs.org (cache cleared, lock regenerated)"

npm install --legacy-peer-deps
npm run build
log "Build complete → $APP_DIR/dist"

info "Applying DB schema..."
# Run migrations in order (lowest number first)
for f in $(ls "$APP_DIR"/migrations/*.sql 2>/dev/null | sort); do
    [[ -f "$f" ]] && psql "$DATABASE_URL" -f "$f" 2>/dev/null && log "  Migration: $(basename "$f")" || true
done
# Also ensure full schema is present (fallback for any missing tables)
if [[ -f "$APP_DIR"/public/scripts/gydschain-complete-schema.sql ]]; then
    psql "$DATABASE_URL" -f "$APP_DIR"/public/scripts/gydschain-complete-schema.sql 2>/dev/null && log "  Full schema: gydschain-complete-schema.sql" || true
fi

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
      APP_URL: '${APP_URL}',
      REPLIT_DOMAINS: '${FQDN},${DOMAIN}',
$(
  [[ -n "$ADMIN_WALLET"         ]] && echo "      ADMIN_WALLET: '${ADMIN_WALLET}',"
  [[ -n "$FOUNDER_WALLET"       ]] && echo "      FOUNDER_WALLET: '${FOUNDER_WALLET}',"
  [[ -n "$REWARD_ADDRESS"       ]] && echo "      REWARD_ADDRESS: '${REWARD_ADDRESS}',"
  [[ -n "$TELEGRAM_BOT_TOKEN"   ]] && echo "      TELEGRAM_BOT_TOKEN: '${TELEGRAM_BOT_TOKEN}',"
  [[ -n "$TELEGRAM_CHAT_ID"     ]] && echo "      TELEGRAM_CHAT_ID: '${TELEGRAM_CHAT_ID}',"
  [[ -n "$SMTP_HOST"            ]] && echo "      SMTP_HOST: '${SMTP_HOST}',"
  [[ -n "$SMTP_PORT"            ]] && echo "      SMTP_PORT: '${SMTP_PORT}',"
  [[ -n "$SMTP_USER"            ]] && echo "      SMTP_USER: '${SMTP_USER}',"
  [[ -n "$SMTP_PASS"            ]] && echo "      SMTP_PASS: '${SMTP_PASS}',"
  [[ -n "$SMTP_FROM"            ]] && echo "      SMTP_FROM: '${SMTP_FROM}',"
  [[ -n "$WA_TOKEN"             ]] && echo "      WHATSAPP_TOKEN: '${WA_TOKEN}',"
  [[ -n "$WA_PHONE_ID"          ]] && echo "      WHATSAPP_PHONE_ID: '${WA_PHONE_ID}',"
  [[ -n "$HCAPTCHA_SECRET_KEY"  ]] && echo "      HCAPTCHA_SECRET_KEY: '${HCAPTCHA_SECRET_KEY}',"
  [[ -n "$GYDS_BOOTSTRAP_NODES" ]] && echo "      GYDS_BOOTSTRAP_NODES: '${GYDS_BOOTSTRAP_NODES}',"
  true
)
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
# GYDSchain Redeploy Helper — installed by deploy-dashboard.sh
# Usage: gyds-redeploy [--skip-db] [--skip-build]
set -euo pipefail

APP_DIR="${APP_DIR}"
SKIP_DB=0
SKIP_BUILD=0
for arg in "\$@"; do
  case "\$arg" in
    --skip-db)    SKIP_DB=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
  esac
done

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "\${GREEN}[✓]\${NC} \$*"; }
warn() { echo -e "\${YELLOW}[!]\${NC} \$*"; }
info() { echo -e "\${CYAN}[→]\${NC} \$*"; }

# Load env
set -a; source "\$APP_DIR/.env" 2>/dev/null || true; set +a

echo ""
echo -e "\${CYAN}━━━ GYDSchain Redeploy — \$(date '+%Y-%m-%d %H:%M:%S') ━━━\${NC}"
echo ""

# ── 1. Pull latest code ────────────────────────────────────────────────────
info "Pulling latest code..."
BRANCH=\$(git -C "\$APP_DIR" branch --show-current 2>/dev/null || echo main)
git -C "\$APP_DIR" fetch origin
CURRENT=\$(git -C "\$APP_DIR" rev-parse HEAD)
REMOTE=\$(git -C "\$APP_DIR" rev-parse "origin/\$BRANCH" 2>/dev/null || echo "")

if [[ "\$CURRENT" == "\$REMOTE" ]]; then
    warn "Already up-to-date — will still run migrations and reload PM2"
else
    git -C "\$APP_DIR" pull --ff-only origin "\$BRANCH"
    log "Updated to: \$(git -C \"\$APP_DIR\" log -1 --format='%h %s')"
fi

# ── 2. Install deps if package.json changed ────────────────────────────────
PKG_CHANGED=\$(git -C "\$APP_DIR" diff "\$CURRENT" HEAD -- package.json 2>/dev/null | wc -l || echo 1)
if [[ "\$PKG_CHANGED" -gt 0 ]]; then
    info "package.json changed — installing dependencies..."
    cd "\$APP_DIR"
    npm config set registry https://registry.npmjs.org/
    rm -f package-lock.json
    npm install --legacy-peer-deps 2>&1 | tail -5
    log "Dependencies updated"
fi

# ── 3. Schema migration (always runs — idempotent IF NOT EXISTS) ───────────
if [[ "\$SKIP_DB" == "0" ]]; then
    DB_URL="\${DATABASE_URL:-}"
    if [[ -z "\$DB_URL" ]]; then
        warn "DATABASE_URL not set — skipping schema migration"
    else
        info "Running schema migration..."
        migrated=0

        # Numbered migration files
        if [[ -d "\${APP_DIR}/migrations" ]]; then
            for f in \$(ls "\${APP_DIR}/migrations/"*.sql 2>/dev/null | sort); do
                [[ -f "\$f" ]] || continue
                info "  Applying: \$(basename \"\$f\")"
                psql "\$DB_URL" -v ON_ERROR_STOP=0 -f "\$f" 2>&1 | grep -i "error\|warning" || true
                log "  ✓ \$(basename \"\$f\")"
                (( migrated++ )) || true
            done
        fi

        # Full schema (safe to replay — all CREATE TABLE IF NOT EXISTS)
        for schema in "\${APP_DIR}/public/scripts/gydschain-schema.sql" "\${APP_DIR}/public/scripts/gydschain-complete-schema.sql"; do
            if [[ -f "\$schema" ]]; then
                info "  Full schema: \$(basename \"\$schema\")"
                psql "\$DB_URL" -v ON_ERROR_STOP=0 -f "\$schema" 2>&1 | grep -i "error\|warning" || true
                log "  ✓ \$(basename \"\$schema\")"
                break
            fi
        done

        TABLE_COUNT=\$(psql "\$DB_URL" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ' || echo "?")
        log "Schema migration complete — \${TABLE_COUNT} tables in database"
    fi
else
    warn "--skip-db passed — skipping schema migration"
fi

# ── 4. Build (skip with --skip-build for config-only changes) ─────────────
if [[ "\$SKIP_BUILD" == "0" ]]; then
    info "Building frontend..."
    cd "\$APP_DIR"
    npm run build 2>&1 | tail -10
    log "Build complete"
else
    warn "--skip-build passed — skipping Vite build"
fi

# ── 5. Reload PM2 (zero-downtime) ─────────────────────────────────────────
info "Reloading PM2..."
pm2 reload gydschain-api --update-env
pm2 save --force 2>/dev/null || true
log "PM2 reloaded"

# ── 6. Reload Nginx ───────────────────────────────────────────────────────
nginx -t 2>/dev/null && { nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true; log "Nginx reloaded"; }

echo ""
log "Redeploy complete! \$(date '+%Y-%m-%d %H:%M:%S')"
echo -e "\${CYAN}Logs:\${NC} pm2 logs gydschain-api --lines 30"
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
