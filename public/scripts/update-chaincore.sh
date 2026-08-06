#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  ChainCore — Project Update Script v1.0.0                              ║
# ║  Pulls latest code, installs deps, builds frontend, runs DB migrations  ║
# ║  and reloads the API server with zero downtime via PM2.                 ║
# ║                                                                          ║
# ║  Usage:                                                                  ║
# ║    curl -fsSL https://YOUR_DOMAIN/scripts/update-chaincore.sh | bash    ║
# ║    — or —                                                                ║
# ║    sudo bash update-chaincore.sh                                         ║
# ║    APP_DIR=/var/www/myapp bash update-chaincore.sh                       ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
info() { echo -e "${CYAN}[→]${NC} $*"; }
sep()  { echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

APP_DIR="${APP_DIR:-/var/www/gydschain}"
BRANCH="${BRANCH:-main}"
PM2_APP="${PM2_APP:-gydschain-api}"
LOG_DIR="/var/log/gydschain"
LOG_FILE="$LOG_DIR/updates.log"
DIST_BACKUP="$APP_DIR/.dist-backup"

mkdir -p "$LOG_DIR"
TS=$(date '+%Y-%m-%d %H:%M:%S')
echo "" >> "$LOG_FILE"
echo "━━━ Update started: $TS ━━━" >> "$LOG_FILE"

tee_log() { tee -a "$LOG_FILE"; }
log_msg()  { echo "[✓] $*" >> "$LOG_FILE"; }
info_msg() { echo "[→] $*" >> "$LOG_FILE"; }
warn_msg() { echo "[!] $*" >> "$LOG_FILE"; }

trap 'err "Update failed at line $LINENO — check $LOG_FILE"; echo "FAILED at line $LINENO" >> "$LOG_FILE"' ERR

sep
echo -e "  ${BOLD}ChainCore Update Script${NC}  —  $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "  App dir : ${CYAN}$APP_DIR${NC}"
echo -e "  Branch  : ${CYAN}$BRANCH${NC}"
echo -e "  PM2 app : ${CYAN}$PM2_APP${NC}"
sep
echo ""

# ─── Verify directory ─────────────────────────────────────────────────────────
[[ -d "$APP_DIR" ]] || { err "App directory not found: $APP_DIR"; exit 1; }
[[ -d "$APP_DIR/.git" ]] || { err "Not a git repository: $APP_DIR"; exit 1; }

# ─── Verify required tools ────────────────────────────────────────────────────
for cmd in git node npm psql; do
  command -v "$cmd" &>/dev/null || { warn "$cmd not found — some steps may be skipped"; }
done

# ─── Check git state ──────────────────────────────────────────────────────────
info "Fetching latest from origin..."
git -C "$APP_DIR" fetch origin 2>&1 | tee_log

CURRENT=$(git -C "$APP_DIR" rev-parse HEAD)
REMOTE=$(git -C "$APP_DIR" rev-parse "origin/$BRANCH" 2>/dev/null || echo "")

if [[ "$CURRENT" == "$REMOTE" ]]; then
  warn "Already up-to-date: $(git -C "$APP_DIR" log -1 --format='%h %s')"
  warn_msg "Already up-to-date — skipping"
  echo ""
  echo -e "${GREEN}Nothing to update — you're on the latest version.${NC}"
  exit 0
fi

OLD_HASH=$(git -C "$APP_DIR" log -1 --format='%h %s' "$CURRENT")
NEW_HASH=$(git -C "$APP_DIR" log -1 --format='%h %s' "origin/$BRANCH")
info "Updating: $OLD_HASH → $NEW_HASH"

# ─── Backup dist ──────────────────────────────────────────────────────────────
if [[ -d "$APP_DIR/dist" ]]; then
  info "Backing up dist..."
  rm -rf "$DIST_BACKUP"
  cp -r "$APP_DIR/dist" "$DIST_BACKUP"
fi

# ─── Stash local changes ──────────────────────────────────────────────────────
STASHED=0
if ! git -C "$APP_DIR" diff --quiet || ! git -C "$APP_DIR" diff --cached --quiet; then
  warn "Local changes detected — stashing..."
  git -C "$APP_DIR" stash push -m "pre-update-$(date +%s)"
  STASHED=1
fi

# ─── Pull ─────────────────────────────────────────────────────────────────────
info "Pulling $BRANCH..."
git -C "$APP_DIR" pull --ff-only origin "$BRANCH" 2>&1 | tee_log
log "Pulled: $NEW_HASH"; log_msg "Pulled: $NEW_HASH"

[[ $STASHED -eq 1 ]] && git -C "$APP_DIR" stash pop 2>/dev/null || true

# ─── Load shared config (if present) ──────────────────────────────────────────
GYDS_CONF="${GYDS_CONF:-/etc/gydschain/gyds-config.env}"
[[ -f "$GYDS_CONF" ]] && source "$GYDS_CONF" && info "Loaded config: $GYDS_CONF"

# ─── Install deps ─────────────────────────────────────────────────────────────
PKG_DIFF=$(git -C "$APP_DIR" diff "$CURRENT" "origin/$BRANCH" -- package.json 2>/dev/null | wc -l || echo "1")
if [[ "$PKG_DIFF" -gt 0 ]]; then
  info "package.json changed — installing dependencies..."
  cd "$APP_DIR"
  npm ci --prefer-offline 2>&1 | tail -10 | tee_log || npm install --legacy-peer-deps 2>&1 | tail -10 | tee_log
  log "Dependencies installed"
else
  info "package.json unchanged — skipping npm install"
fi

# ─── DB migrations ────────────────────────────────────────────────────────────
DATABASE_URL="${DATABASE_URL:-}"
if [[ -n "$DATABASE_URL" ]]; then
  MIGRATION_FILE="$APP_DIR/migrations/latest.sql"
  if [[ -f "$MIGRATION_FILE" ]]; then
    info "Running DB migrations from migrations/latest.sql..."
    psql "$DATABASE_URL" -f "$MIGRATION_FILE" 2>&1 | tee_log && log "DB migrations applied"
  else
    info "No migration file found — checking shared schema..."
    SCHEMA_FILE="$APP_DIR/public/scripts/gydschain-complete-schema.sql"
    if [[ -f "$SCHEMA_FILE" ]]; then
      info "Applying idempotent schema..."
      psql "$DATABASE_URL" -f "$SCHEMA_FILE" 2>&1 | tail -5 | tee_log || warn "Schema apply had warnings (non-fatal)"
    fi
  fi
else
  warn "DATABASE_URL not set — skipping DB migrations"
fi

# ─── Build frontend ───────────────────────────────────────────────────────────
info "Building frontend..."
cd "$APP_DIR"
if ! npm run build 2>&1 | tee_log; then
  err "Build failed! Rolling back dist..."
  if [[ -d "$DIST_BACKUP" ]]; then
    rm -rf "$APP_DIR/dist"
    cp -r "$DIST_BACKUP" "$APP_DIR/dist"
    warn "Rolled back to previous dist"
  fi
  exit 1
fi
log "Frontend built"

# ─── Reload PM2 ───────────────────────────────────────────────────────────────
if command -v pm2 &>/dev/null; then
  if pm2 list 2>/dev/null | grep -q "$PM2_APP"; then
    info "Reloading $PM2_APP (zero-downtime)..."
    pm2 reload "$PM2_APP" --update-env 2>&1 | tee_log
    log "PM2 reload complete"
  else
    warn "$PM2_APP not in PM2 — attempting start..."
    pm2 start "$APP_DIR/ecosystem.config.cjs" 2>&1 | tee_log || warn "PM2 start failed — start manually"
  fi
  pm2 save --force 2>/dev/null || true
else
  warn "PM2 not found — restart your server manually to apply the update"
fi

# ─── Reload Nginx ─────────────────────────────────────────────────────────────
if nginx -t 2>/dev/null; then
  nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
  log "Nginx reloaded"
fi

# ─── Cleanup ──────────────────────────────────────────────────────────────────
rm -rf "$DIST_BACKUP"
echo "Update complete: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"

sep
echo ""
log "ChainCore updated successfully!"
echo -e "  ${CYAN}Version${NC} : $NEW_HASH"
echo -e "  ${CYAN}Logs   ${NC} : pm2 logs $PM2_APP --lines 30"
echo -e "  ${CYAN}Status ${NC} : pm2 status"
echo -e "  ${CYAN}Upd Log${NC} : $LOG_FILE"
echo ""
sep
