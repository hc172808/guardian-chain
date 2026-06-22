#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GYDS Wallet — Android build helper
# Usage: bash mobile-wallet/android-build.sh [wallet-dir] [method]
#   method: capacitor | bubblewrap | pwabuilder (default: capacitor)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; CYAN="\033[0;36m"; NC="\033[0m"
log()  { echo -e "${GREEN}[android-build]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC} $*"; }

WALLET_DIR="${1:-gyds-wallet}"
METHOD="${2:-capacitor}"

[[ -d "$WALLET_DIR" ]] || { warn "Wallet dir '${WALLET_DIR}' not found. Run configure.sh first."; exit 1; }

case "$METHOD" in

  # ── Capacitor: Full native APK/AAB ────────────────────────────────────────
  capacitor)
    log "Building wallet web app..."
    cd "$WALLET_DIR"
    command -v bun >/dev/null && bun run build || npm run build

    log "Setting up Capacitor Android platform..."
    cd mobile
    command -v bun >/dev/null && bun install || npm install

    if [[ ! -d android ]]; then
      npx cap add android
    fi
    npx cap copy
    npx cap sync

    echo ""
    info "Android project ready at: ${WALLET_DIR}/mobile/android"
    info "Open in Android Studio:"
    echo "  npx cap open android"
    echo ""
    info "Then: Build → Generate Signed Bundle / APK"
    info "  • AAB for Google Play Store"
    info "  • APK for direct install"
    echo ""
    info "App ID: io.netlifegy.gyds"
    ;;

  # ── Bubblewrap: TWA lightweight APK ───────────────────────────────────────
  bubblewrap)
    command -v bubblewrap >/dev/null || {
      log "Installing Bubblewrap CLI..."
      npm i -g @bubblewrap/cli
    }

    log "Building Bubblewrap TWA..."
    cd "${WALLET_DIR}/mobile/bubblewrap"

    [[ -f twa-manifest.json ]] || { warn "twa-manifest.json not found. Run configure.sh first."; exit 1; }

    DOMAIN=$(node -e "const m=require('./twa-manifest.json'); console.log(m.host)")
    if [[ "$DOMAIN" == "YOUR-DOMAIN" ]]; then
      warn "Domain not configured. Run configure.sh first."
      exit 1
    fi

    bubblewrap update
    bubblewrap build

    echo ""
    info "APK built: ${WALLET_DIR}/mobile/bubblewrap/app-release-signed.apk"
    echo ""
    warn "Remember to add Digital Asset Links on your server:"
    echo "  https://${DOMAIN}/.well-known/assetlinks.json"
    echo "  (see mobile-wallet/SETUP.md section 5 for the template)"
    ;;

  # ── PWABuilder: No local toolchain ────────────────────────────────────────
  pwabuilder)
    DOMAIN=$(node -e "
      const fs = require('fs');
      try {
        const m = JSON.parse(fs.readFileSync('${WALLET_DIR}/mobile/bubblewrap/twa-manifest.json','utf8'));
        process.stdout.write(m.host || 'YOUR-DOMAIN');
      } catch { process.stdout.write('YOUR-DOMAIN'); }
    ")

    echo ""
    info "PWABuilder doesn't require a local build."
    echo ""
    echo "  1. Ensure your wallet is deployed at: https://${DOMAIN}"
    echo "  2. Visit: https://www.pwabuilder.com"
    echo "  3. Enter URL: https://${DOMAIN}"
    echo "  4. Click Start → Package for Stores → Android"
    echo "  5. Upload: ${WALLET_DIR}/mobile/pwabuilder.json (pre-filled settings)"
    echo "  6. Download the signed APK"
    echo ""
    info "Opening PWABuilder in your browser..."
    xdg-open "https://www.pwabuilder.com" 2>/dev/null || open "https://www.pwabuilder.com" 2>/dev/null || true
    ;;

  *)
    warn "Unknown method: ${METHOD}"
    echo "Valid options: capacitor | bubblewrap | pwabuilder"
    exit 1
    ;;
esac
