#!/usr/bin/env bash
# ============================================================
# GYDSchain — PostgreSQL Native Setup for Ubuntu
# ============================================================
# Installs and configures PostgreSQL 16 natively (no Docker).
# Creates the gydschain database, user, and imports the schema.
#
# Usage:
#   sudo bash setup-postgres-ubuntu.sh
#
# Optional env vars:
#   DB_NAME     — database name    (default: gydschain)
#   DB_USER     — database user    (default: gyds)
#   DB_PASSWORD — set a password   (default: auto-generated)
#   DOMAIN      — your domain      (default: netlifegy.com)
#   SUBDOMAIN   — API subdomain    (default: api)
# ============================================================
set -euo pipefail

# ─── Colors ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()   { echo -e "${YELLOW}[!]${NC} $*"; }
err()    { echo -e "${RED}[✗]${NC} $*"; exit 1; }
info()   { echo -e "${CYAN}[i]${NC} $*"; }
step()   { echo -e "\n${BOLD}══ $* ══${NC}"; }

# ─── Root check ────────────────────────────────────────────
[[ $EUID -eq 0 ]] || err "Run as root: sudo bash setup-postgres-ubuntu.sh"

# ─── Config ────────────────────────────────────────────────
DB_NAME="${DB_NAME:-gydschain}"
DB_USER="${DB_USER:-gyds}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)}"
DOMAIN="${DOMAIN:-netlifegy.com}"
SUBDOMAIN="${SUBDOMAIN:-api}"
FQDN="${SUBDOMAIN}.${DOMAIN}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="${SCRIPT_DIR}/gydschain-schema.sql"
OUTPUT_ENV="/opt/gydschain/.env.production"

mkdir -p /opt/gydschain

# ─── Banner ────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ╔═════════════════════════════════════════════╗"
echo "  ║   GYDSchain PostgreSQL Setup — Ubuntu       ║"
echo "  ║   No Docker · Pure PostgreSQL 16            ║"
echo "  ╚═════════════════════════════════════════════╝"
echo -e "${NC}"

# ═══ 1/6 — System packages ═══════════════════════════════
step "1/6 — System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg lsb-release nginx certbot python3-certbot-nginx ufw fail2ban

# ═══ 2/6 — PostgreSQL 16 ══════════════════════════════════
step "2/6 — PostgreSQL 16"
if ! command -v psql &>/dev/null || [[ $(psql --version | grep -oP '\d+' | head -1) -lt 16 ]]; then
  info "Installing PostgreSQL 16..."
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
  echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y -qq postgresql-16 postgresql-client-16
else
  log "PostgreSQL already installed: $(psql --version)"
fi

systemctl enable postgresql
systemctl start postgresql
sleep 2
log "PostgreSQL running"

# ═══ 3/6 — Create database & user ════════════════════════
step "3/6 — Create database and user"
# Create user (idempotent: update password if already exists)
if su - postgres -c "psql -tAqc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}';\"" 2>/dev/null | grep -q 1; then
  su - postgres -c "psql -qc \"ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';\"" \
    || err "Failed to update password for user '${DB_USER}'"
  info "User '${DB_USER}' already exists — password updated"
else
  su - postgres -c "psql -qc \"CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';\"" \
    || err "Failed to create PostgreSQL user '${DB_USER}'"
  log "Created user '${DB_USER}'"
fi

# Create database (idempotent)
if ! su - postgres -c "psql -tAqc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}';\"" 2>/dev/null | grep -q 1; then
  su - postgres -c "psql -qc \"CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};\"" \
    || err "Failed to create database '${DB_NAME}'"
  log "Created database '${DB_NAME}'"
else
  info "Database '${DB_NAME}' already exists — skipping creation"
fi

su - postgres -c "psql -qc \"GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};\"" \
  || err "Failed to grant privileges on '${DB_NAME}' to '${DB_USER}'"

log "Database '${DB_NAME}' with user '${DB_USER}' ready"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"

# ═══ 4/6 — Import schema ══════════════════════════════════
step "4/6 — Import schema"
if [ -f "$SCHEMA_FILE" ]; then
  info "Importing schema ($(wc -l < "$SCHEMA_FILE") lines)..."
  IMPORT_LOG=$(mktemp)
  if PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U "${DB_USER}" -d "${DB_NAME}" \
      -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE" >"$IMPORT_LOG" 2>&1; then
    grep -i "error\|warning" "$IMPORT_LOG" || true
    rm -f "$IMPORT_LOG"
  else
    cat "$IMPORT_LOG" >&2
    rm -f "$IMPORT_LOG"
    err "Schema import failed — see errors above"
  fi
  TABLE_COUNT=$(PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U "${DB_USER}" -d "${DB_NAME}" -t \
    -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')
  log "Schema imported — ${TABLE_COUNT} tables in public schema"
else
  warn "Schema file not found at: ${SCHEMA_FILE}"
  warn "Run this after the schema file is available, or use: psql \"${DATABASE_URL}\" -f gydschain-schema.sql"
fi

# ═══ 5/6 — Write .env.production ═════════════════════════
step "5/6 — Write .env.production"
SESSION_SECRET=$(openssl rand -hex 32)
API_KEY=$(openssl rand -hex 32)

cat > "$OUTPUT_ENV" <<EOF
# GYDSchain Production Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
NODE_ENV=production

# ─── Database ────────────────────────────────────────────
DATABASE_URL=${DATABASE_URL}

# ─── Session ─────────────────────────────────────────────
SESSION_SECRET=${SESSION_SECRET}

# ─── API ─────────────────────────────────────────────────
PORT=3030
GYDS_API_KEY=${API_KEY}
GYDS_CHAIN_ID=13370
GYDS_DOMAIN=${DOMAIN}
GYDS_SSL_EMAIL=admin@${DOMAIN}
GYDS_FOUNDER_WALLET=0x0000000000000000000000000000000000000001
GYDS_ADMIN_WALLET=

# ─── RPC ─────────────────────────────────────────────────
GYDS_RPC_ENDPOINT=https://rpc.${DOMAIN}
GYDS_RPC_BACKUP_1=https://rpc2.${DOMAIN}
GYDS_RPC_BACKUP_2=https://rpc3.${DOMAIN}
GYDS_WS_ENDPOINT=wss://ws.${DOMAIN}

# ─── External Services (fill in as needed) ────────────────
# RESEND_API_KEY=re_xxxxxxxxxxxx
# TELEGRAM_BOT_TOKEN=
# COINGECKO_API_KEY=
EOF

chmod 600 "$OUTPUT_ENV"
log ".env.production written to ${OUTPUT_ENV}"

# ═══ 6/6 — Configure pg_hba & postgresql.conf ════════════
step "6/6 — Harden PostgreSQL"
PG_HBA="/etc/postgresql/16/main/pg_hba.conf"
PG_CONF="/etc/postgresql/16/main/postgresql.conf"

# Allow local md5 auth for the gyds user
if ! grep -q "${DB_USER}" "$PG_HBA" 2>/dev/null; then
  echo "host    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    md5" >> "$PG_HBA"
  echo "host    ${DB_NAME}    ${DB_USER}    ::1/128         md5" >> "$PG_HBA"
fi

# Tune for a small-to-medium server
cat >> "$PG_CONF" <<PG_EOF

# GYDSchain tuning
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 768MB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 5242kB
log_min_duration_statement = 2000
PG_EOF

systemctl reload postgresql
log "PostgreSQL hardened and reloaded"

# ─── UFW ───────────────────────────────────────────────────
ufw --force enable
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3030/tcp    # API
ufw deny 5432/tcp     # Block external Postgres access
ufw reload
log "Firewall configured (PostgreSQL blocked from external access)"

# ─── Summary ──────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══ Setup Complete ═══${NC}"
echo ""
echo -e "  ${GREEN}✓${NC} PostgreSQL 16 installed and running"
echo -e "  ${GREEN}✓${NC} Database: ${DB_NAME} / User: ${DB_USER}"
echo -e "  ${GREEN}✓${NC} .env.production written to ${OUTPUT_ENV}"
echo ""
echo -e "  ${BOLD}DATABASE_URL:${NC}"
echo -e "  ${CYAN}${DATABASE_URL}${NC}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "  1. Review ${CYAN}${OUTPUT_ENV}${NC} — set GYDS_FOUNDER_WALLET and other values"
echo -e "  2. Deploy the app:  ${CYAN}bash deploy-dashboard.sh${NC}"
echo -e "  3. Issue SSL cert:  ${CYAN}certbot --nginx -d ${FQDN}${NC}"
echo ""
log "GYDSchain PostgreSQL setup complete! 🚀"
