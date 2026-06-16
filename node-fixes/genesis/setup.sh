#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  GYDS Genesis Node — Repository Setup Script
#
#  Run this ONCE after cloning both genesis and fullnode repos side by side:
#
#    git clone https://github.com/hc172808/fullnode.git
#    git clone https://github.com/hc172808/genesis.git
#    cd genesis
#    bash setup.sh
#
#  What this does:
#    1. Copies shared packages (core, consensus, p2p, rpc) from ../fullnode
#    2. Rewrites import paths from github.com/gydschain/fullnode/ → github.com/gydschain/genesis/
#    3. Runs go mod tidy
#    4. Builds the gyds-genesis binary
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

FULLNODE_DIR="${FULLNODE_DIR:-../fullnode}"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

echo ""
echo "  GYDS Genesis Node — Setup"
echo ""

[[ -d "$FULLNODE_DIR" ]] || die "fullnode directory not found at $FULLNODE_DIR. Clone it first:
    git clone https://github.com/hc172808/fullnode.git ../fullnode"

# ── Copy shared packages ──────────────────────────────────────────────────────
log "Copying core packages from $FULLNODE_DIR..."
for pkg in core consensus p2p rpc; do
  [[ -d "$FULLNODE_DIR/$pkg" ]] || die "Package '$pkg' not found in $FULLNODE_DIR"
  rm -rf "./$pkg"
  cp -r "$FULLNODE_DIR/$pkg" "./$pkg"
  log "  Copied: $pkg/"
done

# ── Rewrite module import paths ───────────────────────────────────────────────
log "Rewriting import paths: fullnode → genesis..."
find core consensus p2p rpc -name "*.go" | while IFS= read -r file; do
  sed -i 's|github\.com/gydschain/fullnode/|github.com/gydschain/genesis/|g' "$file"
done
log "  Import paths updated"

# ── go mod tidy ───────────────────────────────────────────────────────────────
log "Running go mod tidy..."
export PATH="$PATH:/usr/local/go/bin"
command -v go &>/dev/null || die "Go not found. Install Go 1.22+ first."
go mod tidy

# ── Build ─────────────────────────────────────────────────────────────────────
log "Building gyds-genesis..."
mkdir -p bin
go build -ldflags="-s -w" -o bin/gyds-genesis .
log "  Built: bin/gyds-genesis ($(du -h bin/gyds-genesis | cut -f1))"

echo ""
echo "  ✅ Genesis node ready!"
echo ""
echo "  Run:  ./bin/gyds-genesis start"
echo "  Init: ./bin/gyds-genesis init --output genesis.json"
echo "  Export genesis block after start:  ./bin/gyds-genesis export-genesis"
echo ""
echo "  Bootstrap address for other nodes:"
echo "    GYDS_BOOTSTRAP_NODES=<THIS_SERVER_IP>:30300"
echo ""
