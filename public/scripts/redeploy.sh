#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  ChainCore — Safe Redeploy Script v2.0.0                               ║
# ║  Safe git pull → npm install → Vite build → PM2 reload → Nginx reload  ║
# ║  Usage: sudo bash redeploy.sh                                           ║
# ║         APP_DIR=/var/www/myapp BRANCH=main sudo bash redeploy.sh        ║
# ╚══════════════════════════════════════════════════════════════════════════╝
#
# Features:
#   • Stashes local changes before pull, re-applies after
#   • Detects if deps changed (package.json) before running npm install
#   • Zero-downtime: PM2 reload (not restart) keeps old process alive until
#     new one is ready
#   • Rolls back if build fails
#   • Writes a deploy log to /var/log/gydschain/deploys.log
#
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
info() { echo -e "${CYAN}[→]${NC} $*"; }

APP_DIR="${APP_DIR:-/var/www/gydschain}"
BRANCH="${BRANCH:-$(git -C "$APP_DIR" branch --show-current 2>/dev/null || echo main)}"
PM2_APP="${PM2_APP:-gydschain-api}"
DEPLOY_LOG="/var/log/gydschain/deploys.log"
DIST_BACKUP="${APP_DIR}/.dist-backup"

mkdir -p /var/log/gydschain
echo "" >> "$DEPLOY_LOG"
echo "━━━ Deploy started: $(date '+%Y-%m-%d %H:%M:%S') ━━━" >> "$DEPLOY_LOG"

trap 'echo "FAILED at line $LINENO" >> "$DEPLOY_LOG"; err "Deploy failed at line $LINENO — check $DEPLOY_LOG"' ERR

log() { echo -e "${GREEN}[✓]${NC} $*"; echo "[✓] $*" >> "$DEPLOY_LOG"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; echo "[!] $*" >> "$DEPLOY_LOG"; }
info() { echo -e "${CYAN}[→]${NC} $*"; echo "[→] $*" >> "$DEPLOY_LOG"; }

# ─── Check git state ──────────────────────────────────────────────────────────
[[ -d "$APP_DIR/.git" ]] || { err "Not a git repo: $APP_DIR"; exit 1; }

info "Fetching latest from origin..."
git -C "$APP_DIR" fetch origin 2>&1 | tee -a "$DEPLOY_LOG"

CURRENT=$(git -C "$APP_DIR" rev-parse HEAD)
REMOTE=$(git -C "$APP_DIR" rev-parse "origin/$BRANCH" 2>/dev/null || echo "")

if [[ "$CURRENT" == "$REMOTE" ]]; then
    warn "Already up-to-date ($(git -C "$APP_DIR" log -1 --format='%h %s'))"
    echo "Up-to-date — skipping build" >> "$DEPLOY_LOG"
    exit 0
fi

info "Updating: $(git -C "$APP_DIR" log -1 --format='%h %s' "$CURRENT") → $(git -C "$APP_DIR" log -1 --format='%h %s' "origin/$BRANCH")"

# ─── Backup current dist ──────────────────────────────────────────────────────
if [[ -d "$APP_DIR/dist" ]]; then
    info "Backing up current dist..."
    rm -rf "$DIST_BACKUP"
    cp -r "$APP_DIR/dist" "$DIST_BACKUP"
fi

# ─── Stash local changes ──────────────────────────────────────────────────────
STASHED=0
if ! git -C "$APP_DIR" diff --quiet || ! git -C "$APP_DIR" diff --cached --quiet; then
    warn "Local changes detected — stashing..."
    git -C "$APP_DIR" stash push -m "pre-deploy-$(date +%s)"
    STASHED=1
fi

# ─── Pull ─────────────────────────────────────────────────────────────────────
info "Pulling $BRANCH..."
git -C "$APP_DIR" pull --ff-only origin "$BRANCH" 2>&1 | tee -a "$DEPLOY_LOG"
NEW_COMMIT=$(git -C "$APP_DIR" log -1 --format='%h %s')
log "Pulled: $NEW_COMMIT"

[[ $STASHED -eq 1 ]] && git -C "$APP_DIR" stash pop 2>/dev/null || true

# ─── Deps install (only if package.json changed) ─────────────────────────────
PKG_CHANGED=$(git -C "$APP_DIR" diff "origin/$BRANCH@{1}" "origin/$BRANCH" -- package.json 2>/dev/null | wc -l || echo "1")
if [[ "$PKG_CHANGED" -gt 0 ]]; then
    info "package.json changed — installing dependencies..."
    cd "$APP_DIR"
    npm ci --prefer-offline 2>&1 | tail -5 | tee -a "$DEPLOY_LOG" || npm install --legacy-peer-deps 2>&1 | tail -5 | tee -a "$DEPLOY_LOG"
    log "Dependencies updated"
else
    info "package.json unchanged — skipping npm install"
fi

# ─── Build ────────────────────────────────────────────────────────────────────
info "Building frontend..."
cd "$APP_DIR"
if ! npm run build 2>&1 | tee -a "$DEPLOY_LOG"; then
    err "Build failed! Rolling back dist..."
    if [[ -d "$DIST_BACKUP" ]]; then
        rm -rf "$APP_DIR/dist"
        cp -r "$DIST_BACKUP" "$APP_DIR/dist"
        warn "Rolled back to previous dist — API reload cancelled"
    fi
    exit 1
fi
log "Build complete"

# ─── PM2 reload (zero-downtime) ───────────────────────────────────────────────
if pm2 list 2>/dev/null | grep -q "$PM2_APP"; then
    info "Reloading $PM2_APP (zero-downtime)..."
    pm2 reload "$PM2_APP" --update-env 2>&1 | tee -a "$DEPLOY_LOG"
    log "PM2 reload complete"
else
    warn "$PM2_APP not running in PM2 — attempting start..."
    pm2 start "$APP_DIR/ecosystem.config.cjs" 2>&1 | tee -a "$DEPLOY_LOG" || warn "PM2 start failed"
fi
pm2 save --force 2>/dev/null || true

# ─── Nginx reload ─────────────────────────────────────────────────────────────
if nginx -t 2>/dev/null; then
    nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
    log "Nginx reloaded"
fi

# ─── Cleanup ──────────────────────────────────────────────────────────────────
rm -rf "$DIST_BACKUP"

echo "Deploy complete: $(date '+%Y-%m-%d %H:%M:%S')" >> "$DEPLOY_LOG"

echo ""
log "Redeploy complete!"
echo -e "${CYAN}Commit:${NC}  $NEW_COMMIT"
echo -e "${CYAN}Logs:${NC}    pm2 logs $PM2_APP --lines 20"
echo -e "${CYAN}Status:${NC}  pm2 status"
