#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  GYDSchain — Safe Redeploy Script v3.0.0                               ║
# ║  git pull → npm install → schema migrate → Vite build → PM2 reload    ║
# ║                                                                         ║
# ║  Usage:                                                                 ║
# ║    sudo bash redeploy.sh                                                ║
# ║    APP_DIR=/var/www/myapp BRANCH=main sudo bash redeploy.sh            ║
# ║    SKIP_DB=1 sudo bash redeploy.sh   (skip schema migration)           ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
info() { echo -e "${CYAN}[→]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }

APP_DIR="${APP_DIR:-/var/www/gydschain}"
BRANCH="${BRANCH:-$(git -C "$APP_DIR" branch --show-current 2>/dev/null || echo main)}"
PM2_APP="${PM2_APP:-gydschain-api}"
SKIP_DB="${SKIP_DB:-0}"
DEPLOY_LOG="/var/log/gydschain/deploys.log"
DIST_BACKUP="${APP_DIR}/.dist-backup"

mkdir -p /var/log/gydschain
echo "" >> "$DEPLOY_LOG"
echo "━━━ Redeploy started: $(date '+%Y-%m-%d %H:%M:%S') ━━━" >> "$DEPLOY_LOG"

# Re-declare log/warn after DEPLOY_LOG is set so they tee properly
log()  { echo -e "${GREEN}[✓]${NC} $*"; echo "[✓] $*" >> "$DEPLOY_LOG"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; echo "[!] $*" >> "$DEPLOY_LOG"; }
info() { echo -e "${CYAN}[→]${NC} $*"; echo "[→] $*" >> "$DEPLOY_LOG"; }

trap 'echo "FAILED at line $LINENO" >> "$DEPLOY_LOG"; err "Redeploy failed at line $LINENO — see $DEPLOY_LOG"' ERR

# ─── Load existing .env ───────────────────────────────────────────────────────
ENV_FILE="${APP_DIR}/.env"
if [[ -f "$ENV_FILE" ]]; then
    set -a; source "$ENV_FILE"; set +a
    info "Loaded .env from $ENV_FILE"
fi

# ─── 1. Check git state ───────────────────────────────────────────────────────
[[ -d "$APP_DIR/.git" ]] || { err "Not a git repo: $APP_DIR"; exit 1; }

info "Fetching latest from origin/$BRANCH..."
git -C "$APP_DIR" fetch origin 2>&1 | tee -a "$DEPLOY_LOG"

CURRENT=$(git -C "$APP_DIR" rev-parse HEAD)
REMOTE=$(git -C "$APP_DIR" rev-parse "origin/$BRANCH" 2>/dev/null || echo "")

if [[ "$CURRENT" == "$REMOTE" ]]; then
    warn "Already up-to-date ($(git -C "$APP_DIR" log -1 --format='%h %s'))"
    echo "Up-to-date — skipping build" >> "$DEPLOY_LOG"

    # Still run schema migration even if code hasn't changed (in case it was
    # skipped last time or new SQL was applied manually)
    if [[ "$SKIP_DB" != "1" ]]; then
        info "Running schema migration anyway (code unchanged)..."
        _run_migrations "$APP_DIR" || true
    fi
    exit 0
fi

info "Updating: $(git -C "$APP_DIR" log -1 --format='%h %s' "$CURRENT") → $(git -C "$APP_DIR" log -1 --format='%h %s' "origin/$BRANCH")"

# ─── Schema migration helper (defined early so the up-to-date path can use it) ─
_run_migrations() {
    local dir="$1"
    local db_url="${DATABASE_URL:-}"
    if [[ -z "$db_url" ]]; then
        warn "DATABASE_URL not set — skipping schema migration"
        return 0
    fi

    echo ""
    info "Running database schema migration..."

    # 1. Numbered migration files (e.g. migrations/0001_init.sql)
    local migrated=0
    if [[ -d "${dir}/migrations" ]]; then
        for f in $(ls "${dir}/migrations/"*.sql 2>/dev/null | sort); do
            [[ -f "$f" ]] || continue
            info "  Applying migration: $(basename "$f")"
            if psql "$db_url" -v ON_ERROR_STOP=0 -f "$f" >> "$DEPLOY_LOG" 2>&1; then
                log "  ✓ $(basename "$f")"
                (( migrated++ )) || true
            else
                warn "  Migration had errors: $(basename "$f") (continuing)"
            fi
        done
    fi

    # 2. Full schema (IF NOT EXISTS — safe to replay on every deploy)
    local schema_candidates=(
        "${dir}/public/scripts/gydschain-schema.sql"
        "${dir}/public/scripts/gydschain-complete-schema.sql"
    )
    for schema in "${schema_candidates[@]}"; do
        if [[ -f "$schema" ]]; then
            info "  Applying full schema: $(basename "$schema")"
            psql "$db_url" -v ON_ERROR_STOP=0 -f "$schema" >> "$DEPLOY_LOG" 2>&1 || true
            log "  ✓ $(basename "$schema")"
            break
        fi
    done

    # 3. Report table count
    local table_count
    table_count=$(psql "$db_url" -t -c \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" \
        2>/dev/null | tr -d ' ' || echo "?")
    log "Schema migration complete — ${table_count} tables in database"
}

# ─── 2. Backup current dist ───────────────────────────────────────────────────
if [[ -d "$APP_DIR/dist" ]]; then
    info "Backing up current dist..."
    rm -rf "$DIST_BACKUP"
    cp -r "$APP_DIR/dist" "$DIST_BACKUP"
fi

# ─── 3. Stash local changes ───────────────────────────────────────────────────
STASHED=0
if ! git -C "$APP_DIR" diff --quiet || ! git -C "$APP_DIR" diff --cached --quiet; then
    warn "Local changes detected — stashing..."
    git -C "$APP_DIR" stash push -m "pre-deploy-$(date +%s)"
    STASHED=1
fi

# ─── 4. Pull ──────────────────────────────────────────────────────────────────
info "Pulling $BRANCH..."
git -C "$APP_DIR" pull --ff-only origin "$BRANCH" 2>&1 | tee -a "$DEPLOY_LOG"
NEW_COMMIT=$(git -C "$APP_DIR" log -1 --format='%h %s')
log "Pulled: $NEW_COMMIT"

[[ $STASHED -eq 1 ]] && git -C "$APP_DIR" stash pop 2>/dev/null || true

# ─── 5. Deps install (only if package.json changed) ──────────────────────────
PKG_CHANGED=$(git -C "$APP_DIR" diff "${CURRENT}" HEAD -- package.json 2>/dev/null | wc -l || echo "1")
if [[ "$PKG_CHANGED" -gt 0 ]]; then
    info "package.json changed — installing dependencies..."
    cd "$APP_DIR"
    npm config set registry https://registry.npmjs.org/
    rm -f package-lock.json
    npm install --legacy-peer-deps 2>&1 | tail -5 | tee -a "$DEPLOY_LOG"
    log "Dependencies updated"
else
    info "package.json unchanged — skipping npm install"
fi

# ─── 6. Schema migration (before build so seed runs against fresh schema) ─────
if [[ "$SKIP_DB" != "1" ]]; then
    _run_migrations "$APP_DIR"
else
    warn "SKIP_DB=1 — skipping schema migration"
fi

# ─── 7. Build ─────────────────────────────────────────────────────────────────
info "Building frontend..."
cd "$APP_DIR"
if ! npm run build 2>&1 | tee -a "$DEPLOY_LOG"; then
    err "Build failed! Rolling back dist..."
    if [[ -d "$DIST_BACKUP" ]]; then
        rm -rf "$APP_DIR/dist"
        cp -r "$DIST_BACKUP" "$APP_DIR/dist"
        warn "Rolled back to previous dist — PM2 reload cancelled"
    fi
    exit 1
fi
log "Build complete"

# ─── 8. PM2 reload (zero-downtime) ───────────────────────────────────────────
if pm2 list 2>/dev/null | grep -q "$PM2_APP"; then
    info "Reloading $PM2_APP (zero-downtime)..."
    pm2 reload "$PM2_APP" --update-env 2>&1 | tee -a "$DEPLOY_LOG"
    log "PM2 reload complete"
else
    warn "$PM2_APP not in PM2 — attempting start..."
    pm2 start "$APP_DIR/ecosystem.config.cjs" 2>&1 | tee -a "$DEPLOY_LOG" || warn "PM2 start failed"
fi
pm2 save --force 2>/dev/null || true

# ─── 9. Nginx reload ──────────────────────────────────────────────────────────
if nginx -t 2>/dev/null; then
    nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
    log "Nginx reloaded"
fi

# ─── Cleanup ──────────────────────────────────────────────────────────────────
rm -rf "$DIST_BACKUP"
echo "Redeploy complete: $(date '+%Y-%m-%d %H:%M:%S')" >> "$DEPLOY_LOG"

echo ""
log "Redeploy complete!"
echo -e "${CYAN}Commit:${NC}  $NEW_COMMIT"
echo -e "${CYAN}Logs:${NC}    pm2 logs $PM2_APP --lines 30"
echo -e "${CYAN}Status:${NC}  pm2 status"
echo -e "${CYAN}DB log:${NC}  tail $DEPLOY_LOG"
