#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Lite Node Installer — PUBLIC ACCESS
#  Builds the REAL gyds-litenode binary from public/blockchain-go/ source.
#  Linux/macOS  |  Chain ID 13370  |  Domain: netlifegy.com
#  Run:  bash install-litenode.sh         (no sudo required for user-mode)
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GYDS_VERSION="2.1.0"
CHAIN_ID="${CHAIN_ID:-13370}"
GO_VERSION="${GO_VERSION:-1.22.5}"

# user-mode install by default (no root needed)
GYDS_HOME="${GYDS_HOME:-$HOME/.gydschain}"
GYDS_BIN="${GYDS_BIN:-$GYDS_HOME/bin}"

RPC_PRIMARY="${RPC_ENDPOINTS:-https://rpc.netlifegy.com}"
RPC_FAILOVER="${RPC_FAILOVER:-https://rpc2.netlifegy.com,https://rpc3.netlifegy.com}"
WS_ENDPOINT="${WS_ENDPOINT:-wss://ws.netlifegy.com}"

STORAGE_SIZE="${STORAGE_SIZE:-10}"
ENABLE_MINING="${ENABLE_MINING:-false}"
MINING_THREADS="${MINING_THREADS:-2}"
API_PORT="${API_PORT:-3030}"

SRC_DIR="${SRC_DIR:-$(cd "$(dirname "$0")/../blockchain-go" 2>/dev/null && pwd || echo "")}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   GYDSchain LITE NODE Installer v${GYDS_VERSION}                 ║"
echo "║   Chain ID: ${CHAIN_ID}  |  netlifegy.com                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if [[ -z "$SRC_DIR" || ! -d "$SRC_DIR/cmd/litenode" ]]; then
  err "Source not found. Set SRC_DIR=/path/to/blockchain-go and re-run."
  exit 1
fi

# ---------------------- 1. Dependencies ----------------------
log "[1/6] Installing dependencies..."
if command -v apt-get >/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl wget jq openssl git build-essential
elif command -v brew >/dev/null; then
  brew install curl wget jq openssl git
elif command -v yum >/dev/null; then
  sudo yum install -y -q curl wget jq openssl git
fi

# ---------------------- 2. Go ----------------------
log "[2/6] Ensuring Go ${GO_VERSION}..."
if ! command -v go >/dev/null || [[ "$(go version | awk '{print $3}')" < "go1.22" ]]; then
  if [[ "$(uname)" == "Linux" ]]; then
    cd /tmp
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O go.tgz
    sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go.tgz && rm go.tgz
    export PATH="/usr/local/go/bin:$PATH"
  else
    err "Please install Go 1.22+ manually (e.g. brew install go)."; exit 1
  fi
fi
log "    $(go version)"

# ---------------------- 3. Directories ----------------------
log "[3/6] Creating directories at ${GYDS_HOME}..."
mkdir -p "$GYDS_HOME"/{cache,logs,wallet,config} "$GYDS_BIN"
chmod 700 "$GYDS_HOME"

# ---------------------- 4. Build the REAL binary ----------------------
log "[4/6] Building gyds-litenode from ${SRC_DIR}..."
BUILD_TMP="$(mktemp -d)"
cp -r "$SRC_DIR" "$BUILD_TMP/blockchain-go"
( cd "$BUILD_TMP/blockchain-go" && go mod download && go build -ldflags "-s -w" -o "$GYDS_BIN/gyds-litenode" ./cmd/litenode )
rm -rf "$BUILD_TMP"
log "    Installed: $GYDS_BIN/gyds-litenode ($(du -h "$GYDS_BIN/gyds-litenode" | cut -f1))"

# ---------------------- 5. Wallet & config ----------------------
log "[5/6] Generating wallet & config..."
WALLET_KEY_FILE="$GYDS_HOME/wallet/wallet.key"
if [[ ! -f "$WALLET_KEY_FILE" ]]; then
  WALLET_KEY="$(openssl rand -hex 32)"
  WALLET_ADDR="0x$(printf '%s' "$WALLET_KEY" | openssl dgst -sha256 | awk '{print $2}' | cut -c1-40)"
  echo "$WALLET_KEY" > "$WALLET_KEY_FILE" && chmod 600 "$WALLET_KEY_FILE"
  echo "$WALLET_ADDR" > "$GYDS_HOME/wallet/address"
fi
WALLET_ADDR="$(cat "$GYDS_HOME/wallet/address")"

cat > "$GYDS_HOME/config/node.toml" <<EOF
[node]
type = "litenode"
chain_id = ${CHAIN_ID}
version = "${GYDS_VERSION}"
data_dir = "${GYDS_HOME}/cache"

[rpc]
primary  = "${RPC_PRIMARY}"
failover = ["$(echo "$RPC_FAILOVER" | sed 's/,/", "/g')"]

[websocket]
endpoint = "${WS_ENDPOINT}"

[cache]
max_size_gb = ${STORAGE_SIZE}

[mining]
enabled = ${ENABLE_MINING}
threads = ${MINING_THREADS}

[api]
port = ${API_PORT}
EOF

# ---------------------- 6. Start script + user systemd ----------------------
log "[6/6] Creating start script & user service..."
MINING_FLAGS=""
[[ "$ENABLE_MINING" == "true" ]] && MINING_FLAGS="--mining --threads=${MINING_THREADS}"

cat > "$GYDS_HOME/start.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$GYDS_HOME"
exec "$GYDS_BIN/gyds-litenode" \\
    --rpc="${RPC_PRIMARY}" \\
    --rpc-failover="${RPC_FAILOVER}" \\
    --ws="${WS_ENDPOINT}" \\
    --datadir="${GYDS_HOME}/cache" \\
    --chain-id=${CHAIN_ID} \\
    --storage=${STORAGE_SIZE} \\
    --api=${API_PORT} \\
    --wallet="${WALLET_KEY_FILE}" \\
    ${MINING_FLAGS}
EOF
chmod +x "$GYDS_HOME/start.sh"

if command -v systemctl >/dev/null && [[ -d "$HOME/.config" ]]; then
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/gyds-litenode.service" <<EOF
[Unit]
Description=GYDSchain Lite Node v${GYDS_VERSION}
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
WorkingDirectory=${GYDS_HOME}
ExecStart=${GYDS_HOME}/start.sh
Restart=always
RestartSec=10
LimitNOFILE=65535
StandardOutput=append:${GYDS_HOME}/logs/litenode.log
StandardError=append:${GYDS_HOME}/logs/litenode-error.log
[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user enable gyds-litenode 2>/dev/null || true
fi

cat <<EOF

╔═══════════════════════════════════════════════════════════╗
║  ✅ GYDSchain Lite Node installed                         ║
╚═══════════════════════════════════════════════════════════╝
  Install dir:  ${GYDS_HOME}
  Binary:       ${GYDS_BIN}/gyds-litenode
  Wallet addr:  ${WALLET_ADDR}
  Wallet key:   ${WALLET_KEY_FILE}    ⚠️  BACK THIS UP
  RPC primary:  ${RPC_PRIMARY}
  Failover:     ${RPC_FAILOVER}
  Chain ID:     ${CHAIN_ID}

  Run manually:  ${GYDS_HOME}/start.sh
  Run service:   systemctl --user start gyds-litenode
  Live logs:     journalctl --user -u gyds-litenode -f
EOF
