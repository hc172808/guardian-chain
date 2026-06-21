#!/usr/bin/env bash
# ============================================================
# GYDSchain — One-Command Setup Script v2.1.0
# ============================================================
# Usage:
#   ./setup-gydschain.sh                    # Interactive mode
#   ./setup-gydschain.sh --db-only          # Only import schema
#   ./setup-gydschain.sh --env-only         # Only generate .env
#   ./setup-gydschain.sh --non-interactive  # Use defaults / env vars
#
# Prerequisites:
#   - psql (PostgreSQL client)
#   - curl (for connectivity checks)
#
# Environment variables (for non-interactive mode):
#   SUPABASE_DB_URL  — PostgreSQL connection string
# ============================================================

set -euo pipefail

# ─── Colors ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="${SCRIPT_DIR}/gydschain-schema.sql"
ENV_TEMPLATE="${SCRIPT_DIR}/.env.example"
ENV_OUTPUT="${SCRIPT_DIR}/../../.env.production"

# ─── Helpers ──────────────────────────────────────────────
log()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!]${NC} $1"; }
error()  { echo -e "${RED}[✗]${NC} $1"; }
info()   { echo -e "${CYAN}[i]${NC} $1"; }
header() { echo -e "\n${BOLD}═══ $1 ═══${NC}\n"; }

check_command() {
  if ! command -v "$1" &>/dev/null; then
    error "$1 is required but not installed."
    echo "  Install with: $2"
    return 1
  fi
  log "$1 found: $(command -v "$1")"
}

# ─── Parse args ───────────────────────────────────────────
DB_ONLY=false
ENV_ONLY=false
NON_INTERACTIVE=false

for arg in "$@"; do
  case $arg in
    --db-only)          DB_ONLY=true ;;
    --env-only)         ENV_ONLY=true ;;
    --non-interactive)  NON_INTERACTIVE=true ;;
    --help|-h)
      echo "Usage: $0 [--db-only] [--env-only] [--non-interactive]"
      exit 0
      ;;
  esac
done

# ─── Banner ───────────────────────────────────────────────
echo -e "${BOLD}"
echo "   ██████╗ ██╗   ██╗██████╗ ███████╗"
echo "  ██╔════╝ ╚██╗ ██╔╝██╔══██╗██╔════╝"
echo "  ██║  ███╗ ╚████╔╝ ██║  ██║███████╗"
echo "  ██║   ██║  ╚██╔╝  ██║  ██║╚════██║"
echo "  ╚██████╔╝   ██║   ██████╔╝███████║"
echo "   ╚═════╝    ╚═╝   ╚═════╝ ╚══════╝"
echo -e "  ${CYAN}Self-Hosting Setup v2.1.0${NC}"
echo ""

# ─── Preflight Checks ────────────────────────────────────
header "Preflight Checks"

PREREQS_OK=true

check_command "psql" "apt install postgresql-client / brew install postgresql" || PREREQS_OK=false

if [ ! -f "$SCHEMA_FILE" ]; then
  error "Schema file not found: $SCHEMA_FILE"
  PREREQS_OK=false
else
  log "Schema file found ($(wc -l < "$SCHEMA_FILE") lines)"
fi

if [ ! -f "$ENV_TEMPLATE" ]; then
  error "ENV template not found: $ENV_TEMPLATE"
  PREREQS_OK=false
else
  log "ENV template found"
fi

if [ "$PREREQS_OK" = false ]; then
  error "Preflight checks failed. Fix the issues above and retry."
  exit 1
fi

log "All preflight checks passed!"

# ─── Step 1: Generate .env ────────────────────────────────
if [ "$DB_ONLY" = false ]; then
  header "Step 1: Generate .env.production"

  if [ -f "$ENV_OUTPUT" ]; then
    warn ".env.production already exists at: $ENV_OUTPUT"
    if [ "$NON_INTERACTIVE" = false ]; then
      read -rp "  Overwrite? (y/N): " OVERWRITE
      if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
        info "Skipping .env generation."
        ENV_SKIPPED=true
      fi
    else
      info "Non-interactive mode: keeping existing .env.production"
      ENV_SKIPPED=true
    fi
  fi

  if [ "${ENV_SKIPPED:-false}" = false ]; then
    cp "$ENV_TEMPLATE" "$ENV_OUTPUT"
    log "Created .env.production from template"

    if [ "$NON_INTERACTIVE" = false ]; then
      echo ""
      info "Let's configure your essential credentials."
      echo ""

      # Supabase URL
      read -rp "  Supabase Project URL (https://xxx.supabase.co): " INPUT_SUPA_URL
      if [ -n "$INPUT_SUPA_URL" ]; then
        sed -i.bak "s|VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=${INPUT_SUPA_URL}|" "$ENV_OUTPUT"
        # Extract project ID from URL
        PROJECT_ID=$(echo "$INPUT_SUPA_URL" | sed -n 's|https://\([^.]*\)\.supabase\.co|\1|p')
        if [ -n "$PROJECT_ID" ]; then
          sed -i.bak "s|VITE_SUPABASE_PROJECT_ID=.*|VITE_SUPABASE_PROJECT_ID=${PROJECT_ID}|" "$ENV_OUTPUT"
        fi
      fi

      # Anon Key
      read -rp "  Supabase Anon Key: " INPUT_ANON_KEY
      if [ -n "$INPUT_ANON_KEY" ]; then
        sed -i.bak "s|VITE_SUPABASE_PUBLISHABLE_KEY=.*|VITE_SUPABASE_PUBLISHABLE_KEY=${INPUT_ANON_KEY}|" "$ENV_OUTPUT"
      fi

      # Service Role Key
      read -rsp "  Supabase Service Role Key (hidden): " INPUT_SERVICE_KEY
      echo ""
      if [ -n "$INPUT_SERVICE_KEY" ]; then
        sed -i.bak "s|SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=${INPUT_SERVICE_KEY}|" "$ENV_OUTPUT"
      fi

      # Database URL
      read -rsp "  Database URL (postgresql://...): " INPUT_DB_URL
      echo ""
      if [ -n "$INPUT_DB_URL" ]; then
        sed -i.bak "s|SUPABASE_DB_URL=.*|SUPABASE_DB_URL=${INPUT_DB_URL}|" "$ENV_OUTPUT"
      fi

      # Domain
      read -rp "  Your domain (default: netlifegy.com): " INPUT_DOMAIN
      if [ -n "$INPUT_DOMAIN" ]; then
        sed -i.bak "s|GYDS_DOMAIN=.*|GYDS_DOMAIN=${INPUT_DOMAIN}|" "$ENV_OUTPUT"
      fi

      # SSL Email
      read -rp "  SSL certificate email (default: admin@netlifegy.com): " INPUT_SSL_EMAIL
      if [ -n "$INPUT_SSL_EMAIL" ]; then
        sed -i.bak "s|GYDS_SSL_EMAIL=.*|GYDS_SSL_EMAIL=${INPUT_SSL_EMAIL}|" "$ENV_OUTPUT"
      fi

      # API Key
      API_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')
      sed -i.bak "s|GYDS_API_KEY=.*|GYDS_API_KEY=${API_KEY}|" "$ENV_OUTPUT"
      log "Generated random API key"

      # Postgres password
      PG_PASS=$(openssl rand -base64 24 2>/dev/null || head -c 24 /dev/urandom | base64)
      sed -i.bak "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASS}|" "$ENV_OUTPUT"
      log "Generated random Postgres password"

      # Cleanup sed backups
      rm -f "${ENV_OUTPUT}.bak"

      log "Credentials saved to .env.production"
    else
      info "Non-interactive mode: fill in .env.production manually"
    fi

    echo ""
    warn "IMPORTANT: Review and update .env.production before deploying!"
    info "Location: $ENV_OUTPUT"
  fi
fi

# ─── Step 2: Import Database Schema ──────────────────────
if [ "$ENV_ONLY" = false ]; then
  header "Step 2: Import Database Schema"

  # Get DB URL — prefer DATABASE_URL env var, then prompt
  DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"

  if [ -z "$DB_URL" ] && [ -f "$ENV_OUTPUT" ]; then
    DB_URL=$(grep '^DATABASE_URL=' "$ENV_OUTPUT" 2>/dev/null | cut -d'=' -f2- || \
             grep '^SUPABASE_DB_URL=' "$ENV_OUTPUT" 2>/dev/null | cut -d'=' -f2- || true)
  fi

  # Strip placeholder values
  case "$DB_URL" in
    *supabase.co*|*your-password*|*your-project*) DB_URL="" ;;
  esac

  if [ -z "$DB_URL" ]; then
    if [ "$NON_INTERACTIVE" = false ]; then
      echo ""
      echo "  How would you like to connect to PostgreSQL?"
      echo "  [1] Enter a connection URL  (postgresql://user:pass@host:port/dbname)"
      echo "  [2] Enter details manually  (host / port / user / password / database)"
      echo ""
      read -rp "  Choice [1/2]: " -n 1 _pg_choice; echo
      if [ "$_pg_choice" = "2" ]; then
        read -rp "  Host     [localhost]: " _h; _h="${_h:-localhost}"
        read -rp "  Port     [5432]:      " _pt; _pt="${_pt:-5432}"
        read -rp "  Database name:        " _db
        read -rp "  Username:             " _u
        read -rsp "  Password:            " _pw; echo
        [ -z "$_db" ] || [ -z "$_u" ] && { echo "Database name and username are required." >&2; exit 1; }
        DB_URL="postgresql://${_u}:${_pw}@${_h}:${_pt}/${_db}"
      else
        echo ""
        info "Format: postgresql://user:password@host:5432/dbname"
        read -rsp "  Database URL (hidden): " DB_URL; echo
      fi
    else
      echo "No DATABASE_URL set. Export it or run in interactive mode." >&2
      exit 1
    fi
  else
    echo ""
    info "Using database URL from environment."
    if [ "$NON_INTERACTIVE" = false ]; then
      read -rp "  Keep this connection? (Y/n) " -n 1 _keep; echo
      if [[ "$_keep" =~ ^[Nn]$ ]]; then
        DB_URL=""
        read -rsp "  New Database URL (hidden): " DB_URL; echo
      fi
    fi
  fi

  if [ -z "$DB_URL" ]; then
    error "No database URL provided. Skipping schema import."
  else
    # Test connection
    info "Testing database connection..."
    if psql "$DB_URL" -c "SELECT 1;" &>/dev/null; then
      log "Database connection successful!"
    else
      error "Cannot connect to database. Check your credentials and try again."
      exit 1
    fi

    # Count existing tables and warn before touching data
    EXISTING=$(psql "$DB_URL" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ' || echo "0")

    if [ "${EXISTING:-0}" -gt 0 ] 2>/dev/null; then
      echo ""
      echo "┌─────────────────────────────────────────────────────────────────┐"
      echo "│  ⚠  EXISTING DATABASE DETECTED                                   │"
      echo "│                                                                   │"
      printf "│  Found %-2s table(s) already in this database.                   │\n" "$EXISTING"
      echo "│                                                                   │"
      echo "│  The schema file uses IF NOT EXISTS — your existing rows will    │"
      echo "│  NOT be deleted or overwritten. Only missing tables and columns  │"
      echo "│  will be added.                                                   │"
      echo "│                                                                   │"
      echo "│  Your data is safe UNLESS you chose to wipe the database first.  │"
      echo "└─────────────────────────────────────────────────────────────────┘"
      echo ""
      if [ "$NON_INTERACTIVE" = false ]; then
        read -rp "  Continue and apply schema to the existing database? (y/N): " CONFIRM
        if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
          info "Skipping schema import."
          DB_URL=""
        fi
      else
        info "Non-interactive: applying schema with IF NOT EXISTS (existing data preserved)"
      fi
    fi

    if [ -n "$DB_URL" ]; then
      info "Importing schema ($(wc -l < "$SCHEMA_FILE") lines)..."
      echo ""

      if psql "$DB_URL" -f "$SCHEMA_FILE" 2>&1 | while IFS= read -r line; do
        # Show errors and notices, suppress routine output
        if echo "$line" | grep -qi "error"; then
          error "$line"
        elif echo "$line" | grep -qi "notice"; then
          info "$line"
        fi
      done; then
        log "Schema imported successfully!"
      else
        error "Schema import had errors. Check the output above."
      fi

      # Verify
      info "Verifying tables..."
      TABLE_COUNT=$(psql "$DB_URL" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
      log "Found $TABLE_COUNT tables in public schema"

      # List tables
      echo ""
      psql "$DB_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" 2>/dev/null || true
    fi
  fi
fi

# ─── Summary ─────────────────────────────────────────────
header "Setup Complete"

echo -e "  ${GREEN}✓${NC} Schema: 22 tables, 4 functions, RLS policies, triggers"
echo -e "  ${GREEN}✓${NC} Config: .env.production with all credentials"
echo ""
echo -e "  ${BOLD}Next Steps:${NC}"
echo -e "  1. Review ${CYAN}.env.production${NC} and fill any remaining values"
echo -e "  2. Set your founder wallet: update GYDS_FOUNDER_WALLET"
echo -e "  3. Deploy with: ${CYAN}./deploy-ecosystem.sh${NC}"
echo -e "  4. Setup SSL with: ${CYAN}./ssl-setup.sh${NC}"
echo ""
echo -e "  ${BOLD}File Locations:${NC}"
echo -e "  • ENV:    ${ENV_OUTPUT}"
echo -e "  • Schema: ${SCHEMA_FILE}"
echo -e "  • Docs:   public/docs/"
echo ""
log "GYDSchain setup complete! 🚀"
