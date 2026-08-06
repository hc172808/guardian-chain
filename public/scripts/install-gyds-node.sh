#!/usr/bin/env bash
# GydsChain Node Installer v3.0
# Installs a real Geth-based GYDS node on Ubuntu/Debian
# Chain ID 198282 | Clique PoA | Block time 120s
#
# Usage:
#   curl -fsSL https://netlifegy.com/scripts/install-gyds-node.sh | bash
#   -- or with options --
#   DASHBOARD_URL=https://netlifegy.com NODE_TYPE=fullnode bash install-gyds-node.sh
#
# After install, add this network to MetaMask / Trust Wallet:
#   Network Name : GYDS Network
#   RPC URL      : http://YOUR_SERVER_IP:8545
#   Chain ID     : 198282
#   Symbol       : GYDS
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DASHBOARD_URL="${DASHBOARD_URL:-https://app.netlifegy.com}"
NODE_TYPE="${NODE_TYPE:-fullnode}"          # fullnode | rpcnode | validator
GETH_VERSION="${GETH_VERSION:-1.13.14}"
DATA_DIR="${DATA_DIR:-/var/lib/gyds}"
RPC_PORT="${RPC_PORT:-8545}"
WS_PORT="${WS_PORT:-8546}"
P2P_PORT="${P2P_PORT:-30303}"
SERVICE_USER="${SERVICE_USER:-gyds}"
CHAIN_ID=198282

# ── Colors ────────────────────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' B='\033[1m' NC='\033[0m'

banner() { echo -e "${C}${B}$*${NC}"; }
ok()     { echo -e "${G}✓ $*${NC}"; }
warn()   { echo -e "${Y}⚠ $*${NC}"; }
die()    { echo -e "${R}✗ ERROR: $*${NC}"; exit 1; }

banner "
╔══════════════════════════════════════════════════════╗
║   GydsChain Node Installer v3.0                      ║
║   Chain ID 198282  |  Geth-based  |  Clique PoA       ║
╚══════════════════════════════════════════════════════╝"

# ── Detect OS ─────────────────────────────────────────────────────────────────
[[ -f /etc/os-release ]] || die "Cannot detect OS. Only Ubuntu/Debian supported."
. /etc/os-release
[[ "$ID" =~ ^(ubuntu|debian)$ ]] || die "Only Ubuntu/Debian supported. Detected: $ID"

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0"

banner "Step 1/6 — Updating packages & installing dependencies"
apt-get update -qq
apt-get install -y -qq curl wget jq tar gnupg lsb-release ca-certificates systemd
ok "Dependencies installed"

# ── Step 2: Install Geth ──────────────────────────────────────────────────────
banner "Step 2/6 — Installing Geth $GETH_VERSION"

ARCH=$(dpkg --print-architecture)
[[ "$ARCH" == "amd64" ]] && GETH_ARCH="amd64" || GETH_ARCH="arm64"
GETH_URL="https://gethstore.blob.core.windows.net/builds/geth-linux-${GETH_ARCH}-${GETH_VERSION}-*.tar.gz"

if command -v geth &>/dev/null; then
  INSTALLED=$(geth version 2>/dev/null | grep "^Version:" | awk '{print $2}' || echo "unknown")
  ok "Geth already installed (v$INSTALLED) — skipping"
else
  TMP=$(mktemp -d)
  # Download via go-ethereum release page
  GETH_TAG="v${GETH_VERSION}"
  DL_URL="https://github.com/ethereum/go-ethereum/releases/download/${GETH_TAG}/geth-linux-${GETH_ARCH}-${GETH_VERSION}-$(curl -fsSL https://api.github.com/repos/ethereum/go-ethereum/releases/tags/${GETH_TAG} 2>/dev/null | jq -r '.assets[] | select(.name | test("geth-linux-'${GETH_ARCH}'")) | .name' | head -1 | sed 's/geth-linux-'${GETH_ARCH}'-//' | sed 's/\.tar\.gz//'  ).tar.gz" 2>/dev/null || true

  # Fallback: install from add-apt-repository
  if ! wget -q "https://gethstore.blob.core.windows.net/builds/geth-linux-${GETH_ARCH}-${GETH_VERSION}-stable.tar.gz" -O "$TMP/geth.tar.gz" 2>/dev/null; then
    warn "Direct download failed — trying apt …"
    apt-get install -y -qq software-properties-common
    add-apt-repository -y ppa:ethereum/ethereum 2>/dev/null || true
    apt-get update -qq
    apt-get install -y -qq ethereum
  else
    tar xzf "$TMP/geth.tar.gz" -C "$TMP" --strip-components=1
    install -m 755 "$TMP/geth" /usr/local/bin/geth
  fi
  rm -rf "$TMP"
  ok "Geth installed: $(geth version 2>&1 | head -1)"
fi

# ── Step 3: Create service user & directories ─────────────────────────────────
banner "Step 3/6 — Setting up user & directories"
id "$SERVICE_USER" &>/dev/null || useradd --system --no-create-home --shell /bin/false "$SERVICE_USER"
mkdir -p "$DATA_DIR" /etc/gyds /var/log/gyds
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR" /var/log/gyds /etc/gyds
ok "User '$SERVICE_USER' and directories ready"

# ── Step 4: Download genesis.json from dashboard ──────────────────────────────
banner "Step 4/6 — Fetching genesis.json from $DASHBOARD_URL"
GENESIS="$DATA_DIR/genesis.json"

if [[ -f "$GENESIS" ]]; then
  warn "genesis.json already exists at $GENESIS — skipping download"
  warn "Delete it and re-run to refresh with new allocations."
else
  curl -fsSL "$DASHBOARD_URL/api/chain/genesis.json" -o "$GENESIS" || \
    die "Failed to download genesis.json from $DASHBOARD_URL/api/chain/genesis.json"
  chown "$SERVICE_USER:$SERVICE_USER" "$GENESIS"
  ALLOC_COUNT=$(jq '.alloc | length' "$GENESIS")
  ok "genesis.json downloaded ($ALLOC_COUNT pre-mine allocations)"
fi

# ── Step 5: Initialise chain ──────────────────────────────────────────────────
banner "Step 5/6 — Initialising GYDS chain"

if [[ -d "$DATA_DIR/geth/chaindata" ]]; then
  ok "Chain already initialised at $DATA_DIR — skipping"
else
  sudo -u "$SERVICE_USER" geth --datadir "$DATA_DIR" init "$GENESIS"
  ok "Chain initialised with genesis block"
fi

# ── Step 6: Create systemd service ───────────────────────────────────────────
banner "Step 6/6 — Creating systemd service"

cat > /etc/systemd/system/gyds-node.service << EOF
[Unit]
Description=GydsChain ${NODE_TYPE} (Chain ID ${CHAIN_ID})
After=network-online.target
Wants=network-online.target

[Service]
User=${SERVICE_USER}
Group=${SERVICE_USER}
Type=simple
ExecStart=/usr/local/bin/geth \\
  --datadir ${DATA_DIR} \\
  --networkid ${CHAIN_ID} \\
  --http \\
  --http.addr 0.0.0.0 \\
  --http.port ${RPC_PORT} \\
  --http.corsdomain "*" \\
  --http.vhosts "*" \\
  --http.api eth,net,web3,txpool \\
  --ws \\
  --ws.addr 0.0.0.0 \\
  --ws.port ${WS_PORT} \\
  --ws.origins "*" \\
  --ws.api eth,net,web3 \\
  --port ${P2P_PORT} \\
  --maxpeers 50 \\
  --syncmode full \\
  --gcmode archive \\
  --allow-insecure-unlock \\
  --nat any
Restart=always
RestartSec=5
StandardOutput=append:/var/log/gyds/node.log
StandardError=append:/var/log/gyds/node.log
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gyds-node
systemctl start gyds-node

sleep 3
if systemctl is-active --quiet gyds-node; then
  ok "gyds-node service is running!"
else
  warn "Service may still be starting. Check: journalctl -u gyds-node -f"
fi

# ── Firewall rules (ufw) ──────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  ufw allow "$RPC_PORT/tcp" comment "GYDS RPC" 2>/dev/null || true
  ufw allow "$P2P_PORT/tcp" comment "GYDS P2P" 2>/dev/null || true
  ufw allow "$P2P_PORT/udp" comment "GYDS P2P UDP" 2>/dev/null || true
fi

# ── Done ──────────────────────────────────────────────────────────────────────
SERVER_IP=$(curl -fsSL https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
banner "════════════════════════════════════════════════════════"
banner "  GydsChain node installed successfully!"
banner "════════════════════════════════════════════════════════"
echo ""
echo -e "  ${B}Node type:${NC}  $NODE_TYPE"
echo -e "  ${B}Chain ID:${NC}   $CHAIN_ID"
echo -e "  ${B}RPC URL:${NC}    ${C}http://$SERVER_IP:$RPC_PORT${NC}"
echo -e "  ${B}WS URL:${NC}     ${C}ws://$SERVER_IP:$WS_PORT${NC}"
echo ""
echo -e "  ${B}Service commands:${NC}"
echo -e "    journalctl -u gyds-node -f        # live logs"
echo -e "    systemctl status gyds-node        # status"
echo -e "    systemctl restart gyds-node       # restart"
echo ""
echo -e "  ${G}${B}Add GYDS Network to MetaMask / Trust Wallet:${NC}"
echo -e "    Network Name : GYDS Network"
echo -e "    RPC URL      : ${C}http://$SERVER_IP:$RPC_PORT${NC}"
echo -e "    Chain ID     : $CHAIN_ID"
echo -e "    Currency     : GYDS"
echo ""
echo -e "  ${B}Verify your balance:${NC}"
echo -e "    geth attach http://localhost:$RPC_PORT \\"
echo -e "      --exec 'eth.getBalance(\"0xYourWalletAddress\")'"
echo ""
ok "All done. Your GYDS node is live. Pre-mined coins are now on-chain."
