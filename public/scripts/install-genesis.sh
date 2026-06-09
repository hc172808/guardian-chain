#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Genesis Node Installer — FOUNDER ONLY
#  Clones from: https://github.com/hc172808/genesis.git
#  Sets up the genesis/bootstrap node that starts the GydsChain network.
#  Target OS: Ubuntu 22.04 LTS  |  Chain ID 13370  |  Domain: netlifegy.com
#  Run:  sudo bash install-genesis.sh
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GYDS_VERSION="2.1.0"
GYDS_USER="${GYDS_USER:-gydschain}"
GYDS_HOME="${GYDS_HOME:-/var/lib/gydschain-genesis}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-/var/log/gydschain}"
GO_VERSION="${GO_VERSION:-1.22.5}"

GENESIS_PORT="${GENESIS_PORT:-30300}"
RPC_PORT="${RPC_PORT:-8544}"
CHAIN_ID="${CHAIN_ID:-13370}"
BLOCK_TIME="${BLOCK_TIME:-120}"
STORAGE_SIZE="${STORAGE_SIZE:-500}"

REPO_URL="${REPO_URL:-https://github.com/hc172808/genesis.git}"
REPO_DIR="${REPO_DIR:-/opt/gyds-genesis}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║   GYDSchain GENESIS NODE Installer v${GYDS_VERSION} — FOUNDER ONLY            ║"
echo "║   Chain ID: ${CHAIN_ID}  |  Block: ${BLOCK_TIME}s  |  netlifegy.com          ║"
echo "║   Repo: github.com/hc172808/genesis                                 ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || { err "Run as root (sudo)."; exit 1; }

warn "This is the GENESIS node — it creates the blockchain from block 0."
warn "Only run this ONCE on your primary genesis server."
read -rp "Proceed? (yes/no) " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 0; }

# ─── 0. Clone repo ───────────────────────────────────────────────────────────
log "[0/8] Fetching genesis source from ${REPO_URL}..."
if [[ -d "$REPO_DIR/.git" ]]; then
    git -C "$REPO_DIR" pull --ff-only
else
    git clone --depth=1 "$REPO_URL" "$REPO_DIR"
fi
[[ -f "$REPO_DIR/go.mod" ]] || { err "go.mod not found in ${REPO_DIR}"; exit 1; }

# ─── 1. System packages ──────────────────────────────────────────────────────
log "[1/8] Installing packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq build-essential git curl wget jq ufw fail2ban openssl ca-certificates

# ─── 2. Go ───────────────────────────────────────────────────────────────────
log "[2/8] Installing Go ${GO_VERSION}..."
if ! command -v go >/dev/null || [[ "$(go version | awk '{print $3}')" != "go${GO_VERSION}" ]]; then
    cd /tmp
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O go.tgz
    rm -rf /usr/local/go && tar -C /usr/local -xzf go.tgz && rm go.tgz
    ln -sf /usr/local/go/bin/go /usr/local/bin/go
fi
log "    $(go version)"

# ─── 3. User & dirs ──────────────────────────────────────────────────────────
log "[3/8] Creating ${GYDS_USER} user..."
id -u "$GYDS_USER" >/dev/null 2>&1 || useradd --system -m -d "$GYDS_HOME" -s /bin/bash "$GYDS_USER"
mkdir -p "$GYDS_HOME"/{data,logs,keys,config,genesis} "$LOG_DIR"
chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME" "$LOG_DIR"

# ─── 4. Build binary ─────────────────────────────────────────────────────────
log "[4/8] Building gyds-genesis..."
BUILD_TMP="$(mktemp -d)"
cp -r "$REPO_DIR" "$BUILD_TMP/genesis-src"
chown -R "$GYDS_USER:$GYDS_USER" "$BUILD_TMP"

CMD_PATH="."
[[ -d "$BUILD_TMP/genesis-src/cmd/genesis" ]] && CMD_PATH="./cmd/genesis"

sudo -u "$GYDS_USER" -H env HOME="$GYDS_HOME" PATH="$PATH" \
    bash -c "cd '$BUILD_TMP/genesis-src' && go mod download && go build -ldflags '-s -w -X main.Version=${GYDS_VERSION}' -o '$BUILD_TMP/gyds-genesis' ${CMD_PATH}"
install -m 0755 -o root -g root "$BUILD_TMP/gyds-genesis" "$GYDS_BIN/gyds-genesis"
rm -rf "$BUILD_TMP"
log "    Installed: $GYDS_BIN/gyds-genesis"

# ─── 5. Founder key ──────────────────────────────────────────────────────────
log "[5/8] Generating founder key..."
FOUNDER_KEY="$GYDS_HOME/keys/founder.key"
if [[ ! -f "$FOUNDER_KEY" ]]; then
    openssl rand -hex 32 > "$FOUNDER_KEY"
    chown "$GYDS_USER:$GYDS_USER" "$FOUNDER_KEY"
    chmod 600 "$FOUNDER_KEY"
    warn "⚠️  FOUNDER KEY CREATED — BACK IT UP: $FOUNDER_KEY"
fi

# ─── 6. Genesis block config ─────────────────────────────────────────────────
log "[6/8] Writing genesis.json..."
GENESIS_ADDR="0x$(cat "$FOUNDER_KEY" | openssl dgst -sha256 | awk '{print $2}' | cut -c1-40)"
cat > "$GYDS_HOME/genesis/genesis.json" <<EOF
{
  "chain_id": ${CHAIN_ID},
  "version": "${GYDS_VERSION}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "block_time": ${BLOCK_TIME},
  "founder_address": "${GENESIS_ADDR}",
  "initial_supply": "1000000000000000000000000000",
  "token_symbol": "GYDS",
  "token_name": "GydsChain",
  "genesis_message": "GYDSchain — Chain ID ${CHAIN_ID} — netlifegy.com",
  "alloc": {
    "${GENESIS_ADDR}": { "balance": "1000000000000000000000000000" }
  }
}
EOF
chown "$GYDS_USER:$GYDS_USER" "$GYDS_HOME/genesis/genesis.json"

# ─── 7. Firewall ─────────────────────────────────────────────────────────────
log "[7/8] Configuring firewall..."
ufw allow ssh >/dev/null
ufw allow "$GENESIS_PORT/tcp" comment 'GYDS Genesis P2P' >/dev/null
ufw allow "$GENESIS_PORT/udp" comment 'GYDS Genesis P2P' >/dev/null
ufw allow "$RPC_PORT/tcp"    comment 'GYDS Genesis RPC' >/dev/null
ufw --force enable >/dev/null

# ─── 8. systemd + config ─────────────────────────────────────────────────────
log "[8/8] Installing systemd service..."
cat > /etc/systemd/system/gyds-genesis.service <<EOF
[Unit]
Description=GYDSchain Genesis Node v${GYDS_VERSION}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${GYDS_USER}
Group=${GYDS_USER}
WorkingDirectory=${GYDS_HOME}
ExecStart=${GYDS_BIN}/gyds-genesis \
    --genesis=${GYDS_HOME}/genesis/genesis.json \
    --datadir=${GYDS_HOME}/data \
    --keyfile=${FOUNDER_KEY} \
    --chain-id=${CHAIN_ID} \
    --p2pport=${GENESIS_PORT} \
    --rpcport=${RPC_PORT} \
    --founder
Restart=always
RestartSec=10
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/genesis.log
StandardError=append:${LOG_DIR}/genesis-error.log
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
ReadWritePaths=${GYDS_HOME} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable gyds-genesis >/dev/null 2>&1
chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME"
systemctl restart gyds-genesis || true

LOCAL_IP="$(hostname -I | awk '{print $1}')"
cat <<EOF

╔═══════════════════════════════════════════════════════════════════════╗
║   ✅ GYDSchain Genesis Node installed                                 ║
╚═══════════════════════════════════════════════════════════════════════╝
  Repo:         ${REPO_URL}
  Binary:       ${GYDS_BIN}/gyds-genesis
  Service:      gyds-genesis.service
  Founder key:  ${FOUNDER_KEY}   ⚠️  CRITICAL — BACK THIS UP
  Genesis:      ${GYDS_HOME}/genesis/genesis.json
  Founder addr: ${GENESIS_ADDR}
  Logs:         ${LOG_DIR}/genesis.log

  Local IP:   ${LOCAL_IP}
  P2P:        ${LOCAL_IP}:${GENESIS_PORT}
  RPC:        http://${LOCAL_IP}:${RPC_PORT}
  Chain ID:   ${CHAIN_ID}

  Add this node as bootnode for all other nodes:
    enode://<pubkey>@${LOCAL_IP}:${GENESIS_PORT}

  Manage:
    systemctl status gyds-genesis
    journalctl -u gyds-genesis -f
EOF
