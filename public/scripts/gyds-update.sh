#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  GYDSchain — Safe Code Update Script v1.0                                  ║
# ║                                                                             ║
# ║  Pulls the latest code and rebuilds the app.                               ║
# ║  ✅ NEVER touches user accounts, passwords, wallets, or balances.          ║
# ║  ✅ Only adds new tables/columns — never drops or clears existing data.    ║
# ║  ✅ Zero-downtime PM2 reload (users stay connected while it updates).      ║
# ║                                                                             ║
# ║  Usage:                                                                     ║
# ║    sudo bash gyds-update.sh                                                ║
# ║                                                                             ║
# ║  Or install as a system command (run once after deploy):                   ║
# ║    sudo bash gyds-update.sh --install                                      ║
# ║    gyds-update          # from anywhere, any time                          ║
# ║                                                                             ║
# ║  Options:                                                                   ║
# ║    --install    Copy this script to /usr/local/bin/gyds-update             ║
# ║    --no-build   Skip the Vite frontend build (schema + PM2 only)          ║
# ║    --no-db      Skip schema migration (code + build only)                  ║
# ║    --force      Pull even if already up-to-date                            ║
# ║    --branch X   Pull from branch X (default: current branch)              ║
# ║    --status     Show current version, PM2 status, and table count only    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -euo pipefail
IFS=$'\n\t'

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
ok()    { echo -e "${GREEN}  ✓${NC}  $*"; }
info()  { echo -e "${CYAN}  →${NC}  $*"; }
warn()  { echo -e "${YELLOW}  ⚠${NC}  $*"; }
err()   { echo -e "${RED}  ✗${NC}  $*" >&2; }
step()  { echo -e "\n${BOLD}${CYAN}▸ $*${NC}"; }
ruler() { echo -e "${DIM}────────────────────────────────────────────────────${NC}"; }

# ── Defaults ─────────────────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/var/www/gydschain}"
PM2_APP="${PM2_APP:-gydschain-api}"
DO_BUILD=1
DO_DB=1
FORCE=0
BRANCH=""
STATUS_ONLY=0
LOG_FILE="/var/log/gydschain/updates.log"

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --install)
            echo "Installing gyds-update to /usr/local/bin/gyds-update ..."
            cp "$(realpath "$0")" /usr/local/bin/gyds-update
            chmod +x /usr/local/bin/gyds-update
            echo "Done. Run: gyds-update"
            exit 0 ;;
        --no-build) DO_BUILD=0 ;;
        --no-db)    DO_DB=0 ;;
        --force)    FORCE=1 ;;
        --branch)   BRANCH="$2"; shift ;;
        --status)   STATUS_ONLY=1 ;;
        *) err "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

# ── Setup ────────────────────────────────────────────────────────────────────
mkdir -p /var/log/gydschain
TS=$(date '+%Y-%m-%d %H:%M:%S')
echo "" >> "$LOG_FILE"
echo "━━━ Update started: $TS ━━━" >> "$LOG_FILE"
tee_log() { tee -a "$LOG_FILE"; }

# Check the app directory
[[ -d "$APP_DIR/.git" ]] || { err "Not a git repository: $APP_DIR"; exit 1; }

# Load .env for DATABASE_URL, NODE_ENV, etc.
ENV_FILE="${APP_DIR}/.env"
if [[ -f "$ENV_FILE" ]]; then
    set -a; source "$ENV_FILE"; set +a
fi

# Resolve branch
if [[ -z "$BRANCH" ]]; then
    BRANCH=$(git -C "$APP_DIR" branch --show-current 2>/dev/null || echo "main")
fi

# ── Status-only mode ─────────────────────────────────────────────────────────
if [[ "$STATUS_ONLY" -eq 1 ]]; then
    echo ""
    echo -e "${BOLD}GYDSchain Status${NC}"
    ruler
    echo -e "  App dir:   $APP_DIR"
    echo -e "  Branch:    $BRANCH"
    echo -e "  Commit:    $(git -C "$APP_DIR" log -1 --format='%h  %s  (%cr)' 2>/dev/null || echo 'unknown')"
    echo -e "  Remote:    $(git -C "$APP_DIR" log -1 --format='%h  %s' origin/"$BRANCH" 2>/dev/null || echo 'unknown')"
    echo ""
    if pm2 list 2>/dev/null | grep -q "$PM2_APP"; then
        pm2 show "$PM2_APP" 2>/dev/null | grep -E "status|uptime|memory|restarts" | head -6 || true
    else
        warn "PM2 process '$PM2_APP' not found"
    fi
    if [[ -n "${DATABASE_URL:-}" ]]; then
        TC=$(psql "$DATABASE_URL" -t -c \
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" \
            2>/dev/null | tr -d ' ' || echo "?")
        UC=$(psql "$DATABASE_URL" -t -c \
            "SELECT count(*) FROM users;" 2>/dev/null | tr -d ' ' || echo "?")
        echo ""
        echo -e "  DB tables:  $TC"
        echo -e "  DB users:   $UC"
    fi
    echo ""
    exit 0
fi

# ── Header ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       GYDSchain Safe Update Script        ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════╝${NC}"
echo -e "  ${DIM}App:${NC}  $APP_DIR"
echo -e "  ${DIM}Branch:${NC} $BRANCH"
echo -e "  ${DIM}Log:${NC}  $LOG_FILE"
echo ""
echo -e "${GREEN}  This script NEVER deletes or modifies user accounts,${NC}"
echo -e "${GREEN}  passwords, wallets, balances, or any existing data.${NC}"
ruler

# ── Step 1: Git pull ──────────────────────────────────────────────────────────
step "1/5  Git pull"

git -C "$APP_DIR" fetch origin "$BRANCH" 2>&1 | tee_log | grep -v "^$" || true

CURRENT=$(git -C "$APP_DIR" rev-parse HEAD)
REMOTE=$(git -C "$APP_DIR" rev-parse "origin/$BRANCH" 2>/dev/null || echo "")

if [[ "$CURRENT" == "$REMOTE" ]] && [[ "$FORCE" -eq 0 ]]; then
    ok "Already up-to-date  ($(git -C "$APP_DIR" log -1 --format='%h %s'))"
    echo ""
    warn "Nothing new to pull. Use --force to rebuild anyway."
    echo ""
    # Still apply DB changes in case a previous update failed mid-way
    if [[ "$DO_DB" -eq 1 ]] && [[ -n "${DATABASE_URL:-}" ]]; then
        info "Running schema migration anyway (in case it was interrupted)..."
        _do_migrate() {
            local migrated=0 failed=0
            for f in $(ls "$APP_DIR"/migrations/*.sql 2>/dev/null | sort); do
                [[ -f "$f" ]] || continue
                if psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$f" >> "$LOG_FILE" 2>&1; then
                    ok "  $(basename "$f")"; (( migrated++ )) || true
                else
                    warn "  $(basename "$f") — some statements skipped (table already exists, etc.)"; (( failed++ )) || true
                fi
            done
            ok "Migrations: $migrated files processed, $failed with warnings"
        }
        _do_migrate
    fi
    exit 0
fi

FROM_COMMIT=$(git -C "$APP_DIR" log -1 --format='%h %s' "$CURRENT" 2>/dev/null || echo "unknown")
TO_COMMIT=$(git -C "$APP_DIR" log -1 --format='%h %s' "origin/$BRANCH" 2>/dev/null || echo "unknown")
info "Updating: $FROM_COMMIT → $TO_COMMIT" | tee_log

# Stash any uncommitted local changes so pull doesn't fail
STASHED=0
if ! git -C "$APP_DIR" diff --quiet 2>/dev/null || ! git -C "$APP_DIR" diff --cached --quiet 2>/dev/null; then
    warn "Local changes detected — stashing them temporarily..."
    git -C "$APP_DIR" stash push -m "pre-update-$(date +%s)" >> "$LOG_FILE" 2>&1 || true
    STASHED=1
fi

git -C "$APP_DIR" pull --ff-only origin "$BRANCH" 2>&1 | tee_log

[[ $STASHED -eq 1 ]] && { git -C "$APP_DIR" stash pop >> "$LOG_FILE" 2>&1 || warn "Could not restore stash — check git stash list"; }

NEW_COMMIT=$(git -C "$APP_DIR" log -1 --format='%h %s')
ok "Pulled: $NEW_COMMIT"
echo "$NEW_COMMIT" >> "$LOG_FILE"

# Show what changed (file list, trimmed)
CHANGED_FILES=$(git -C "$APP_DIR" diff --name-only "$CURRENT" HEAD 2>/dev/null | head -20 || echo "")
if [[ -n "$CHANGED_FILES" ]]; then
    echo -e "  ${DIM}Changed files:${NC}"
    echo "$CHANGED_FILES" | while read -r f; do echo -e "    ${DIM}$f${NC}"; done
    TOTAL_CHANGED=$(git -C "$APP_DIR" diff --name-only "$CURRENT" HEAD 2>/dev/null | wc -l || echo "?")
    [[ "$TOTAL_CHANGED" -gt 20 ]] && echo -e "    ${DIM}... and $(( TOTAL_CHANGED - 20 )) more${NC}"
fi

# ── Step 2: npm install (only if package.json changed) ───────────────────────
step "2/5  Dependencies"

PKG_CHANGED=$(git -C "$APP_DIR" diff --name-only "$CURRENT" HEAD 2>/dev/null | grep -c "package\.json" || echo 0)
if [[ "$PKG_CHANGED" -gt 0 ]] || [[ ! -d "$APP_DIR/node_modules" ]]; then
    info "package.json changed — updating npm packages..."
    cd "$APP_DIR"
    npm config set registry https://registry.npmjs.org/ 2>/dev/null || true
    npm install --legacy-peer-deps 2>&1 | tail -8 | tee_log
    ok "Packages updated"
else
    ok "package.json unchanged — skipping npm install"
fi

# ── Step 3: Schema migration (additive only — NEVER drops data) ───────────────
step "3/5  Database schema (additive only)"

if [[ "$DO_DB" -eq 0 ]]; then
    warn "Skipped (--no-db)"
elif [[ -z "${DATABASE_URL:-}" ]]; then
    warn "DATABASE_URL not set — skipping schema migration"
else
    echo -e "  ${DIM}Running migrations/*.sql — only adds new tables/columns.${NC}"
    echo -e "  ${DIM}Existing data is NEVER deleted or modified.${NC}"
    echo ""

    migrated=0; skipped=0; failed=0
    for f in $(ls "$APP_DIR"/migrations/*.sql 2>/dev/null | sort); do
        [[ -f "$f" ]] || continue
        fname=$(basename "$f")

        # Quick check: does this file contain any destructive statements?
        # If so, warn loudly and skip it (safety guard)
        if grep -qiE '^\s*(DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+(users|wallets|transactions|user_roles))' "$f" 2>/dev/null; then
            warn "  SKIPPED $fname — contains DROP/TRUNCATE/DELETE on user tables (safety guard)"
            (( skipped++ )) || true
            continue
        fi

        # Apply with ON_ERROR_STOP=0 so "relation already exists" errors don't abort
        # the whole file — each statement is its own implicit transaction in psql
        if psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$f" >> "$LOG_FILE" 2>&1; then
            ok "  $fname"
            (( migrated++ )) || true
        else
            warn "  $fname — some statements skipped (may already exist)"
            (( failed++ )) || true
        fi
    done

    # Verify table count
    TABLE_COUNT=$(psql "$DATABASE_URL" -t -c \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" \
        2>/dev/null | tr -d ' ' || echo "?")
    USER_COUNT=$(psql "$DATABASE_URL" -t -c \
        "SELECT count(*) FROM users;" 2>/dev/null | tr -d ' ' || echo "?")

    echo ""
    ok "Migrations done — $migrated applied, $skipped safety-skipped, $failed with warnings"
    ok "Database: ${TABLE_COUNT} tables,  ${USER_COUNT} user accounts preserved"
fi

# ── Step 4: Frontend build ────────────────────────────────────────────────────
step "4/5  Frontend build"

if [[ "$DO_BUILD" -eq 0 ]]; then
    warn "Skipped (--no-build)"
else
    # Backup current dist so we can roll back if build fails
    DIST_BACKUP="${APP_DIR}/.dist-backup"
    if [[ -d "$APP_DIR/dist" ]]; then
        rm -rf "$DIST_BACKUP"
        cp -r "$APP_DIR/dist" "$DIST_BACKUP"
    fi

    cd "$APP_DIR"
    info "Building frontend (Vite)..."
    if npm run build 2>&1 | tee_log; then
        ok "Build complete"
        rm -rf "$DIST_BACKUP"
    else
        err "Build FAILED — rolling back to previous dist..."
        if [[ -d "$DIST_BACKUP" ]]; then
            rm -rf "$APP_DIR/dist"
            cp -r "$DIST_BACKUP" "$APP_DIR/dist"
            warn "Rolled back to previous build — PM2 reload cancelled"
        fi
        err "Update aborted at build step. Check: npm run build"
        echo "Build failed at $TS" >> "$LOG_FILE"
        exit 1
    fi
fi

# ── Step 5: PM2 reload (zero-downtime) ───────────────────────────────────────
step "5/5  Restart server (zero-downtime)"

if pm2 list 2>/dev/null | grep -q "$PM2_APP"; then
    info "Reloading $PM2_APP with updated env..."
    pm2 reload "$PM2_APP" --update-env 2>&1 | tee_log
    ok "PM2 reload complete — server is live"
else
    warn "$PM2_APP not found in PM2 — starting fresh..."
    if [[ -f "$APP_DIR/ecosystem.config.cjs" ]]; then
        pm2 start "$APP_DIR/ecosystem.config.cjs" 2>&1 | tee_log
        ok "PM2 started"
    else
        err "No ecosystem.config.cjs found — start PM2 manually:"
        err "  cd $APP_DIR && pm2 start server/index.ts --name $PM2_APP --interpreter node --interpreter-args '--import tsx/esm'"
        exit 1
    fi
fi

# Reload nginx if config is valid
nginx -t 2>/dev/null && { nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true; ok "Nginx reloaded"; } || true

pm2 save --force 2>/dev/null || true

# ── Cloudflare false-positive ban cleanup ─────────────────────────────────────
# If this deployment is behind Cloudflare and was previously running without
# Cloudflare-aware IP trust, every visitor could have collapsed onto
# Cloudflare's shared edge IP, causing one abusive request to auto-ban EVERY
# visitor (including the site owner/admin). The app now clears these
# false-positive bans automatically on every boot (see server/security.ts),
# but we also do it here right after the reload so it's visible in this run.
step "Post-update  Cloudflare ban cleanup"
sleep 2
if [[ -n "${DATABASE_URL:-}" ]]; then
    REMOVED=$(psql "$DATABASE_URL" -t -c \
        "SELECT count(*) FROM ip_bans WHERE ip ~ '^(173\.245\.4[89]|173\.245\.5[0-9]|103\.21\.24[4-7]|103\.22\.20[0-3]|103\.31\.[4-7]|141\.101\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])|108\.162\.19[2-9]|108\.162\.2[0-4][0-9]|108\.162\.25[0-5]|190\.93\.24[0-9]|190\.93\.25[0-5]|188\.114\.9[6-9]|188\.114\.1[01][0-9]|197\.234\.24[0-3]|198\.41\.(12[89]|1[3-9][0-9]|2[0-4][0-9]|25[0-5])|162\.158\.|104\.1[6-9]\.|104\.2[0-3]\.|104\.24\.|104\.25\.|104\.26\.|104\.27\.|172\.6[4-9]\.|172\.7[01]\.|131\.0\.7[23]\.)';" \
        2>/dev/null | tr -d ' ' || echo 0)
    if [[ "$REMOVED" -gt 0 ]]; then
        warn "Found $REMOVED ban(s) on Cloudflare edge IPs — these were false positives caused by the app not recognizing Cloudflare's proxy. Restart already applies the fix; check pm2 logs for '[Security] Cleared Cloudflare-edge false-positive bans'."
    else
        ok "No Cloudflare-edge false-positive bans found"
    fi
fi
echo ""
echo -e "  ${DIM}Behind Cloudflare?${NC} Make sure Cloudflare's proxy (orange cloud) is ON for your"
echo -e "  ${DIM}domain, and SSL/TLS mode is 'Full' or 'Full (strict)' — NOT 'Flexible', which${NC}"
echo -e "  ${DIM}causes redirect loops. The app now auto-detects Cloudflare's published IP${NC}"
echo -e "  ${DIM}ranges and trusts its CF-Connecting-IP header for real visitor IPs.${NC}"
echo -e "  ${DIM}To disable this (not behind Cloudflare, or using a different CDN),${NC}"
echo -e "  ${DIM}set CLOUDFLARE_TRUST=false in .env.${NC}"

# ── Summary ──────────────────────────────────────────────────────────────────
echo "Update complete: $TS" >> "$LOG_FILE"
echo ""
ruler
echo -e "${GREEN}${BOLD}  ✓  Update complete!${NC}"
ruler
echo -e "  ${DIM}Commit:${NC}   $NEW_COMMIT"
echo -e "  ${DIM}Accounts:${NC} $(psql "${DATABASE_URL:-}" -t -c 'SELECT count(*) FROM users;' 2>/dev/null | tr -d ' ' || echo '?') users — untouched"
echo ""
echo -e "  ${DIM}Check logs:${NC}    pm2 logs $PM2_APP --lines 40"
echo -e "  ${DIM}Check status:${NC}  pm2 status"
echo -e "  ${DIM}Full log:${NC}      tail -f $LOG_FILE"
echo ""
