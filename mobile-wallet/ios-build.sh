#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GYDS Wallet — iOS build helper (macOS + Xcode required)
# Usage: bash mobile-wallet/ios-build.sh [wallet-dir] [method]
#   method: capacitor | pwabuilder (default: capacitor)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; CYAN="\033[0;36m"; NC="\033[0m"
log()  { echo -e "${GREEN}[ios-build]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC} $*"; }

WALLET_DIR="${1:-gyds-wallet}"
METHOD="${2:-capacitor}"

[[ "$(uname)" == "Darwin" ]] || { warn "iOS builds require macOS with Xcode installed."; exit 1; }
[[ -d "$WALLET_DIR" ]] || { warn "Wallet dir '${WALLET_DIR}' not found. Run configure.sh first."; exit 1; }

case "$METHOD" in

  # ── Capacitor: Full native IPA ────────────────────────────────────────────
  capacitor)
    log "Building wallet web app..."
    cd "$WALLET_DIR"
    command -v bun >/dev/null && bun run build || npm run build

    log "Setting up Capacitor iOS platform..."
    cd mobile
    command -v bun >/dev/null && bun install || npm install

    if [[ ! -d ios ]]; then
      npx cap add ios
    fi
    npx cap copy
    npx cap sync

    echo ""
    info "iOS project ready at: ${WALLET_DIR}/mobile/ios"
    info "Opening in Xcode..."
    npx cap open ios

    echo ""
    echo "  In Xcode:"
    echo "    1. Select your Team in Signing & Capabilities"
    echo "    2. Set Bundle Identifier to: io.netlifegy.gyds"
    echo "    3. Product → Archive"
    echo "    4. Distribute → App Store Connect (for App Store)"
    echo "       or Ad Hoc / Development (for direct install)"
    echo ""
    info "App ID: io.netlifegy.gyds"
    ;;

  # ── PWABuilder: No Xcode toolchain ────────────────────────────────────────
  pwabuilder)
    DOMAIN=$(node -e "
      const fs = require('fs');
      try {
        const m = JSON.parse(fs.readFileSync('${WALLET_DIR}/mobile/bubblewrap/twa-manifest.json','utf8'));
        process.stdout.write(m.host || 'YOUR-DOMAIN');
      } catch { process.stdout.write('YOUR-DOMAIN'); }
    ")

    echo ""
    info "PWABuilder can generate an iOS package without Xcode."
    echo ""
    echo "  Note: PWABuilder iOS packages create a Swift wrapper around the PWA."
    echo "  You still need a Mac with Xcode to sign and submit to the App Store."
    echo "  But you can generate the project package on any OS."
    echo ""
    echo "  1. Deploy your wallet to: https://${DOMAIN}"
    echo "  2. Visit: https://www.pwabuilder.com"
    echo "  3. Enter URL: https://${DOMAIN}"
    echo "  4. Click Start → Package for Stores → iOS"
    echo "  5. Download the Xcode project zip"
    echo "  6. Open in Xcode → sign → submit"
    echo ""
    open "https://www.pwabuilder.com" 2>/dev/null || true
    ;;

  *)
    warn "Unknown method: ${METHOD}"
    echo "Valid options: capacitor | pwabuilder"
    exit 1
    ;;
esac
