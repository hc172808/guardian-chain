#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  ChainCore — Database Reset / Dump / Restore Utility                   ║
# ║                                                                          ║
# ║  Usage:                                                                  ║
# ║    Dump current DB to file:                                              ║
# ║      bash db-reset.sh dump                                              ║
# ║                                                                          ║
# ║    Wipe all data and re-seed (keeps tables, clears rows):               ║
# ║      bash db-reset.sh wipe                                              ║
# ║                                                                          ║
# ║    Full drop + recreate schema + seed (nuclear reset):                  ║
# ║      bash db-reset.sh reset                                             ║
# ║                                                                          ║
# ║    Restore from a previous dump file:                                   ║
# ║      bash db-reset.sh restore /path/to/dump.sql                        ║
# ║                                                                          ║
# ║  Environment:                                                            ║
# ║    DATABASE_URL  — PostgreSQL connection string (required)              ║
# ║    APP_DIR       — App directory (default: /var/www/gydschain)          ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
info() { echo -e "${CYAN}[→]${NC} $*"; }

APP_DIR="${APP_DIR:-/var/www/gydschain}"
DUMP_DIR="${DUMP_DIR:-/var/backups/gydschain}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

# ─── Locate DATABASE_URL ──────────────────────────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
    # Try loading from .env file
    ENV_FILE="${APP_DIR}/.env"
    if [[ -f "$ENV_FILE" ]]; then
        DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")"
    fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
    err "DATABASE_URL is not set. Export it or ensure $APP_DIR/.env exists."
    echo "  Example:  export DATABASE_URL='postgresql://user:pass@localhost/dbname'"
    exit 1
fi

export DATABASE_URL

# ─── Test connection ──────────────────────────────────────────────────────────
if ! psql "$DATABASE_URL" -c "SELECT 1;" &>/dev/null; then
    err "Cannot connect to database. Check DATABASE_URL."
    exit 1
fi
log "Database connection OK"

# ─── Helpers ──────────────────────────────────────────────────────────────────

do_dump() {
    local outfile="${1:-}"
    mkdir -p "$DUMP_DIR"
    [[ -z "$outfile" ]] && outfile="${DUMP_DIR}/gydschain_dump_${TIMESTAMP}.sql"
    info "Dumping database to: $outfile"
    pg_dump "$DATABASE_URL" \
        --no-owner \
        --no-acl \
        --column-inserts \
        --if-exists \
        -f "$outfile"
    log "Dump complete → $outfile  ($(du -sh "$outfile" | cut -f1))"
    echo ""
    echo -e "${BOLD}Restore later with:${NC}"
    echo "  bash db-reset.sh restore $outfile"
}

do_wipe() {
    echo ""
    echo -e "${YELLOW}┌─────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│  ⚠  WIPE — This deletes ALL rows in every table               │${NC}"
    echo -e "${YELLOW}│     The schema (tables) will be kept.                           │${NC}"
    echo -e "${YELLOW}│     A backup dump will be created first.                        │${NC}"
    echo -e "${YELLOW}└─────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    read -rp "Type YES to confirm wipe: " _confirm
    [[ "$_confirm" == "YES" ]] || { warn "Aborted."; exit 0; }

    # Auto-dump first
    local dump_path="${DUMP_DIR}/gydschain_pre_wipe_${TIMESTAMP}.sql"
    do_dump "$dump_path"

    info "Truncating all tables..."
    psql "$DATABASE_URL" -c "
        DO \$\$
        DECLARE
            t TEXT;
        BEGIN
            FOR t IN
                SELECT tablename FROM pg_tables
                WHERE schemaname = 'public'
                  AND tablename NOT IN ('spatial_ref_sys')
            LOOP
                EXECUTE 'TRUNCATE TABLE ' || quote_ident(t) || ' CASCADE';
            END LOOP;
        END;
        \$\$;
    "
    log "All tables truncated."
    echo ""
    warn "DB is empty. Restart the app server to re-seed the founder account:"
    echo "  pm2 restart gydschain-api"
}

do_reset() {
    echo ""
    echo -e "${RED}┌─────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${RED}│  ☢  FULL RESET — Drops ALL tables, re-applies schema, re-seeds  │${NC}"
    echo -e "${RED}│     ALL existing data will be permanently deleted.               │${NC}"
    echo -e "${RED}│     A backup dump will be created first.                         │${NC}"
    echo -e "${RED}└─────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    read -rp "Type RESET to confirm: " _confirm
    [[ "$_confirm" == "RESET" ]] || { warn "Aborted."; exit 0; }

    # Auto-dump first
    local dump_path="${DUMP_DIR}/gydschain_pre_reset_${TIMESTAMP}.sql"
    do_dump "$dump_path"

    info "Dropping all tables and types..."
    psql "$DATABASE_URL" <<'DROPSQL'
DO $$
DECLARE r RECORD;
BEGIN
    -- Drop all tables
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
    -- Drop all custom types/enums
    FOR r IN SELECT typname FROM pg_type
             JOIN pg_namespace ON pg_type.typnamespace = pg_namespace.oid
             WHERE nspname = 'public' AND typtype = 'e' LOOP
        EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
END; $$;
DROPSQL
    log "All tables and types dropped."

    info "Re-applying schema via drizzle-kit push..."
    cd "$APP_DIR"
    if npx drizzle-kit push --config drizzle.config.ts 2>&1 | grep -qE "\[✓\]|Changes applied|No schema"; then
        log "Schema applied via drizzle-kit push"
    else
        warn "drizzle-kit push had issues — trying SQL fallback..."
        if [[ -f "$APP_DIR/public/scripts/gydschain-complete-schema.sql" ]]; then
            psql "$DATABASE_URL" -f "$APP_DIR/public/scripts/gydschain-complete-schema.sql" 2>/dev/null && log "Schema applied from SQL file" || warn "SQL schema had errors (may be partial)"
        fi
    fi

    log "Reset complete. Restart the app to re-seed accounts:"
    echo "  pm2 restart gydschain-api"
    echo ""
    echo -e "  Default credentials after restart:"
    echo -e "    username: ${BOLD}founder${NC}   password: ${BOLD}password${NC}  (or FOUNDER_PASSWORD env var)"
    echo -e "    username: ${BOLD}admin${NC}     password: ${BOLD}password${NC}  (or ADMIN_PASSWORD env var)"
    echo -e "  ${YELLOW}Change both passwords immediately after login!${NC}"
}

do_restore() {
    local dump_file="${1:-}"
    [[ -z "$dump_file" ]] && { err "Usage: bash db-reset.sh restore /path/to/dump.sql"; exit 1; }
    [[ -f "$dump_file" ]] || { err "File not found: $dump_file"; exit 1; }

    echo ""
    echo -e "${YELLOW}┌─────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│  ⚠  RESTORE — This will REPLACE the current database contents   │${NC}"
    printf  "${YELLOW}│     From: %-53s │${NC}\n" "$(basename "$dump_file")"
    echo -e "${YELLOW}│     A backup of the current DB will be created first.            │${NC}"
    echo -e "${YELLOW}└─────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    read -rp "Type RESTORE to confirm: " _confirm
    [[ "$_confirm" == "RESTORE" ]] || { warn "Aborted."; exit 0; }

    # Backup current state first
    local cur_dump="${DUMP_DIR}/gydschain_pre_restore_${TIMESTAMP}.sql"
    info "Backing up current DB before restore..."
    do_dump "$cur_dump"

    info "Dropping all existing tables..."
    psql "$DATABASE_URL" <<'DROPSQL'
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
    FOR r IN SELECT typname FROM pg_type
             JOIN pg_namespace ON pg_type.typnamespace = pg_namespace.oid
             WHERE nspname = 'public' AND typtype = 'e' LOOP
        EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
END; $$;
DROPSQL

    info "Restoring from $dump_file ..."
    psql "$DATABASE_URL" -f "$dump_file"
    log "Restore complete!"
    echo "  Restart the app:  pm2 restart gydschain-api"
}

do_list_dumps() {
    info "Available dump files in $DUMP_DIR:"
    if [[ -d "$DUMP_DIR" ]]; then
        ls -lh "$DUMP_DIR"/*.sql 2>/dev/null || echo "  (no dumps found)"
    else
        echo "  (dump directory $DUMP_DIR does not exist yet)"
    fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
CMD="${1:-help}"

case "$CMD" in
    dump)
        do_dump "${2:-}"
        ;;
    wipe)
        do_wipe
        ;;
    reset)
        do_reset
        ;;
    restore)
        do_restore "${2:-}"
        ;;
    list)
        do_list_dumps
        ;;
    help|--help|-h|*)
        echo ""
        echo -e "${BOLD}${CYAN}ChainCore — Database Reset Utility${NC}"
        echo ""
        echo "  Commands:"
        echo "    ${BOLD}dump${NC}              Dump current DB to a .sql file (safe — read only)"
        echo "    ${BOLD}dump /path/out.sql${NC} Dump to a specific path"
        echo "    ${BOLD}wipe${NC}              Delete all rows (keep table structure), then reseed"
        echo "    ${BOLD}reset${NC}             Full nuclear reset: drop tables → push schema → reseed"
        echo "    ${BOLD}restore /path/x.sql${NC} Restore from a previously dumped .sql file"
        echo "    ${BOLD}list${NC}              List existing dump files"
        echo ""
        echo "  Environment variables:"
        echo "    DATABASE_URL      PostgreSQL connection string"
        echo "    APP_DIR           App directory (default: /var/www/gydschain)"
        echo "    DUMP_DIR          Where to save dumps (default: /var/backups/gydschain)"
        echo ""
        echo "  Examples:"
        echo "    bash db-reset.sh dump"
        echo "    bash db-reset.sh wipe"
        echo "    bash db-reset.sh reset"
        echo "    bash db-reset.sh restore /var/backups/gydschain/gydschain_dump_20260703_120000.sql"
        echo ""
        ;;
esac
