#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Push both repos to GitHub in one command
#   Usage: bash push-all.sh "your commit message"
#   Full guide: mobile-wallet/git-push-guide.md
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; CYAN="\033[0;36m"; NC="\033[0m"
log()  { echo -e "${GREEN}[push-all]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC} $*"; }

MSG="${1:-chore: sync update}"
WALLET_DIR="${2:-gyds-wallet}"

echo ""
echo "════════════════════════════════════════════"
echo "  ChainCore + GYDS Wallet — Push to GitHub"
echo "════════════════════════════════════════════"
echo ""

# ── 1. Push ChainCore dashboard ───────────────────────────────────────────────
log "Pushing ChainCore dashboard..."

if ! git remote get-url origin >/dev/null 2>&1; then
  warn "No git remote 'origin' found for ChainCore."
  warn "Add one first:"
  echo ""
  echo "  git remote add origin https://github.com/YOUR-USERNAME/chaincore-dashboard.git"
  echo ""
  read -r -p "  Enter your GitHub remote URL now (or press Enter to skip): " REMOTE_URL
  if [[ -n "$REMOTE_URL" ]]; then
    git remote add origin "$REMOTE_URL"
    log "Remote added: $REMOTE_URL"
  else
    warn "Skipping ChainCore push (no remote configured)."
    SKIP_DASHBOARD=1
  fi
fi

if [[ "${SKIP_DASHBOARD:-0}" != "1" ]]; then
  CHANGES=$(git status --porcelain 2>/dev/null | wc -l)
  if [[ "$CHANGES" -gt 0 ]]; then
    git add -A
    git commit -m "$MSG" || true
  else
    info "No changes to commit in ChainCore dashboard."
  fi
  git push origin main 2>/dev/null || git push -u origin main
  log "ChainCore dashboard pushed ✓"
fi

echo ""

# ── 2. Push GYDS Wallet ───────────────────────────────────────────────────────
if [[ -d "$WALLET_DIR/.git" ]]; then
  log "Pushing GYDS Wallet (${WALLET_DIR})..."

  WALLET_CHANGES=$(git -C "$WALLET_DIR" status --porcelain 2>/dev/null | wc -l)
  if [[ "$WALLET_CHANGES" -gt 0 ]]; then
    git -C "$WALLET_DIR" add -A
    git -C "$WALLET_DIR" commit -m "$MSG" || true
  else
    info "No changes to commit in GYDS Wallet."
  fi

  git -C "$WALLET_DIR" push origin main 2>/dev/null || {
    warn "Push failed — check you have write access to hc172808/your-digital-wallet"
    warn "If it's not your repo, fork it first and update the remote:"
    echo "  git -C ${WALLET_DIR} remote set-url origin https://github.com/YOUR-USERNAME/your-digital-wallet.git"
  }
  log "GYDS Wallet pushed ✓"
else
  info "GYDS Wallet not cloned yet (${WALLET_DIR}/ not found)."
  info "Run: bash mobile-wallet/configure.sh"
fi

echo ""
echo "════════════════════════════════════════════"
log "Done."
echo ""
