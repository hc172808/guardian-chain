#!/usr/bin/env bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain — Validator Node Setup
#  Ubuntu 22.04 LTS  |  Chain ID 198282  |  netlifegy.com
#
#  Usage:
#    sudo bash scripts/setup-validator-node.sh [options]
#
#  Options:
#    --wallet  ADDR     Validator reward wallet address
#    --moniker NAME     Validator display name  (default: hostname)
#    --stake   AMOUNT   Self-stake amount in GYD (default: 10000)
#    --commission PCT   Commission % 0-100        (default: 10)
#    --rpc     URL      Primary RPC override
#    --no-wg            Skip WireGuard VPN peering
#    --non-interactive  Use defaults, no prompts
#═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
GYDS_VERSION="2.1.0"
CHAIN_ID="198282"
GYDS_USER="${GYDS_USER:-gydschain}"
GYDS_HOME="${GYDS_HOME:-/var/lib/gydschain}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-/var/log/gydschain}"

RPC_PORT="${RPC_PORT:-8546}"
P2P_PORT="${P2P_PORT:-30303}"
BLOCK_TIME="${BLOCK_TIME:-120}"
MAX_PEERS="${MAX_PEERS:-50}"
STORAGE_GB="${STORAGE_GB:-100}"

RPC_PRIMARY="${RPC_PRIMARY:-https://rpc.netlifegy.com}"
RPC_BACKUP_1="https://rpc2.netlifegy.com"
RPC_BACKUP_2="https://rpc3.netlifegy.com"
WS_ENDPOINT="wss://ws.netlifegy.com"
BOOTNODE_ADDR="enode://bootnode@rpc.netlifegy.com:30303"

MONIKER="${MONIKER:-$(hostname -s)}"
WALLET_ADDR="${WALLET_ADDR:-}"
STAKE_AMOUNT="${STAKE_AMOUNT:-10000}"
COMMISSION="${COMMISSION:-10}"
ENABLE_WG=true
NON_INTERACTIVE=false

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
log()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()   { echo -e "${YELLOW}[!]${NC} $*"; }
err()    { echo -e "${RED}[✗]${NC} $*" >&2; }
info()   { echo -e "${CYAN}[i]${NC} $*"; }
header() {
  echo ""
  echo -e "${BOLD}${CYAN}┌─────────────────────────────────────────────────┐${NC}"
  printf "${BOLD}${CYAN}│${NC}  %-47s${BOLD}${CYAN}│${NC}\n" "$*"
  echo -e "${BOLD}${CYAN}└─────────────────────────────────────────────────┘${NC}"
  echo ""
}

# ─── Parse args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --wallet)          WALLET_ADDR="$2";      shift 2 ;;
    --moniker)         MONIKER="$2";          shift 2 ;;
    --stake)           STAKE_AMOUNT="$2";     shift 2 ;;
    --commission)      COMMISSION="$2";       shift 2 ;;
    --rpc)             RPC_PRIMARY="$2";      shift 2 ;;
    --no-wg)           ENABLE_WG=false;       shift ;;
    --non-interactive) NON_INTERACTIVE=true;  shift ;;
    --help|-h)
      grep '^#  ' "$0" | sed 's/^#  //'
      exit 0 ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Root check ──────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || { err "Run as root: sudo bash $0"; exit 1; }

# ─── Banner ──────────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
cat << 'EOF'
  ╔═══════════════════════════════════════════════════════════════╗
  ║   ██╗   ██╗ █████╗ ██╗     ██╗██████╗  █████╗ ████████╗██████╗   ║
  ║   ██║   ██║██╔══██╗██║     ██║██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗  ║
  ║   ██║   ██║███████║██║     ██║██║  ██║███████║   ██║   ██║  ██║  ║
  ║   ╚██╗ ██╔╝██╔══██║██║     ██║██║  ██║██╔══██║   ██║   ██║  ██║  ║
  ║    ╚████╔╝ ██║  ██║███████╗██║██████╔╝██║  ██║   ██║   ██████╔╝  ║
  ║     ╚═══╝  ╚═╝  ╚═╝╚══════╝╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═════╝  ║
  ╚═══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}${BOLD}          GYDSchain Validator Node Setup v${GYDS_VERSION}${NC}"
echo -e "          Chain ID ${CHAIN_ID}  |  Block time ${BLOCK_TIME}s  |  netlifegy.com"
echo ""

# ─── Locate binaries / source ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="${SRC_DIR:-$REPO_ROOT/public/blockchain-go}"

if command -v gyds-fullnode >/dev/null 2>&1; then
  BINARY="$(command -v gyds-fullnode)"
  log "Found binary: $BINARY ($(gyds-fullnode --version 2>/dev/null || echo 'unknown version'))"
  BUILD_BINARY=false
elif [[ -d "$SRC_DIR/cmd/fullnode" ]]; then
  info "Binary not found — will build from source at $SRC_DIR"
  BUILD_BINARY=true
else
  err "gyds-fullnode binary not found and source not found at $SRC_DIR"
  err "Either run setup-ubuntu-server.sh first, or set SRC_DIR=/path/to/blockchain-go"
  exit 1
fi

# ─── Interactive prompts ──────────────────────────────────────────────────────
if [[ "$NON_INTERACTIVE" == "false" ]]; then
  echo -e "${BOLD}Validator Configuration${NC}"
  echo "  Press Enter to accept defaults shown in [brackets]."
  echo ""

  if [[ -z "$WALLET_ADDR" ]]; then
    read -rp "  Wallet address for validator rewards [required]: " WALLET_ADDR
    [[ -z "$WALLET_ADDR" ]] && { err "Wallet address is required."; exit 1; }
  fi

  read -rp "  Validator name/moniker [${MONIKER}]: " INPUT
  [[ -n "$INPUT" ]] && MONIKER="$INPUT"

  read -rp "  Self-stake amount in GYD [${STAKE_AMOUNT}]: " INPUT
  [[ -n "$INPUT" ]] && STAKE_AMOUNT="$INPUT"

  read -rp "  Commission % (0-100) [${COMMISSION}]: " INPUT
  [[ -n "$INPUT" ]] && COMMISSION="$INPUT"

  read -rp "  Primary RPC [${RPC_PRIMARY}]: " INPUT
  [[ -n "$INPUT" ]] && RPC_PRIMARY="$INPUT"
else
  [[ -z "$WALLET_ADDR" ]] && { err "Set --wallet ADDR in non-interactive mode."; exit 1; }
fi

# ─── Validate inputs ─────────────────────────────────────────────────────────
if [[ ! "$WALLET_ADDR" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  err "Invalid wallet address: $WALLET_ADDR"
  err "Expected format: 0x followed by 40 hex chars"
  exit 1
fi

if ! [[ "$COMMISSION" =~ ^[0-9]+$ ]] || (( COMMISSION > 100 )); then
  err "Commission must be 0-100"; exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
header "Step 1/7 — Build Binary (if needed)"
# ═══════════════════════════════════════════════════════════════════════════════
if [[ "$BUILD_BINARY" == "true" ]]; then
  info "Building gyds-fullnode..."
  export PATH="$PATH:/usr/local/go/bin"

  if ! command -v go >/dev/null; then
    GO_VERSION="1.22.5"
    cd /tmp
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O go.tgz
    rm -rf /usr/local/go && tar -C /usr/local -xzf go.tgz && rm go.tgz
    export PATH="$PATH:/usr/local/go/bin"
    log "Go installed: $(go version)"
  fi

  # Ensure service user & dirs exist
  id -u "$GYDS_USER" >/dev/null 2>&1 || \
    useradd --system -m -d "$GYDS_HOME" -s /bin/bash "$GYDS_USER"
  mkdir -p "$GYDS_HOME" "$LOG_DIR"
  chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME" "$LOG_DIR"

  BUILD_TMP="$(mktemp -d)"
  cp -r "$SRC_DIR" "$BUILD_TMP/blockchain-go"
  chown -R "$GYDS_USER:$GYDS_USER" "$BUILD_TMP"

  sudo -u "$GYDS_USER" -H env HOME="$GYDS_HOME" PATH="$PATH" \
    bash -c "cd '$BUILD_TMP/blockchain-go' && \
             go mod download && \
             go build -ldflags '-s -w -X main.Version=${GYDS_VERSION}' \
             -o '$BUILD_TMP/gyds-fullnode' ./cmd/fullnode"

  install -m 0755 -o root -g root "$BUILD_TMP/gyds-fullnode" "$GYDS_BIN/gyds-fullnode"
  rm -rf "$BUILD_TMP"
  BINARY="$GYDS_BIN/gyds-fullnode"
  log "Binary installed: $BINARY"
else
  log "Using existing binary: $BINARY"
fi

# ═══════════════════════════════════════════════════════════════════════════════
header "Step 2/7 — User & Directories"
# ═══════════════════════════════════════════════════════════════════════════════
id -u "$GYDS_USER" >/dev/null 2>&1 || \
  useradd --system -m -d "$GYDS_HOME" -s /bin/bash "$GYDS_USER"

mkdir -p \
  "$GYDS_HOME"/{data,logs,keys,config,backups} \
  "$LOG_DIR"

chown -R "$GYDS_USER:$GYDS_USER" "$GYDS_HOME" "$LOG_DIR"
log "User: $GYDS_USER  |  Home: $GYDS_HOME"

# ═══════════════════════════════════════════════════════════════════════════════
header "Step 3/7 — Validator Keys"
# ═══════════════════════════════════════════════════════════════════════════════
VAL_KEY="$GYDS_HOME/keys/validator.key"
VAL_CERT="$GYDS_HOME/keys/validator.pub"
NODE_KEY="$GYDS_HOME/keys/node.key"

if [[ ! -f "$VAL_KEY" ]]; then
  # Generate Ed25519 validator key pair
  openssl genpkey -algorithm Ed25519 -out "$VAL_KEY" 2>/dev/null
  openssl pkey -in "$VAL_KEY" -pubout -out "$VAL_CERT" 2>/dev/null
  chmod 600 "$VAL_KEY"
  chmod 644 "$VAL_CERT"
  log "Validator key generated: $VAL_KEY"
else
  log "Validator key already exists — reusing"
fi

if [[ ! -f "$NODE_KEY" ]]; then
  openssl rand -hex 32 > "$NODE_KEY"
  chmod 600 "$NODE_KEY"
  log "Node identity key generated"
fi

chown "$GYDS_USER:$GYDS_USER" "$GYDS_HOME/keys/"*

VAL_PUBKEY="$(openssl pkey -in "$VAL_KEY" -pubout -outform DER 2>/dev/null | \
              openssl dgst -sha256 | awk '{print $2}' || openssl rand -hex 32)"

echo ""
echo -e "${BOLD}  ┌── Validator Identity ──────────────────────────────────┐${NC}"
echo -e "  │  Moniker:     ${MONIKER}"
echo -e "  │  Wallet:      ${WALLET_ADDR}"
echo -e "  │  Pubkey hash: ${VAL_PUBKEY:0:20}...${VAL_PUBKEY: -6}"
echo -e "  │  Commission:  ${COMMISSION}%     Self-stake: ${STAKE_AMOUNT} GYD"
echo -e "${BOLD}  └───────────────────────────────────────────────────────┘${NC}"
echo ""
warn "BACK UP your validator key now → $VAL_KEY"
warn "Losing it means losing your validator slot and staked GYD."

# ═══════════════════════════════════════════════════════════════════════════════
header "Step 4/7 — Node Configuration"
# ═══════════════════════════════════════════════════════════════════════════════
cat > "$GYDS_HOME/config/validator.toml" <<EOF
# GYDSchain Validator Configuration — generated $(date -u +"%Y-%m-%d %H:%M:%S UTC")

[node]
type           = "validator"
moniker        = "${MONIKER}"
chain_id       = ${CHAIN_ID}
version        = "${GYDS_VERSION}"

[validator]
wallet_address = "${WALLET_ADDR}"
self_stake     = ${STAKE_AMOUNT}
commission_pct = ${COMMISSION}
key_file       = "${VAL_KEY}"
node_key_file  = "${NODE_KEY}"

[network]
p2p_port      = ${P2P_PORT}
rpc_port      = ${RPC_PORT}
max_peers     = ${MAX_PEERS}
bootnodes     = ["${BOOTNODE_ADDR}"]

[rpc]
primary  = "${RPC_PRIMARY}"
backup   = ["${RPC_BACKUP_1}", "${RPC_BACKUP_2}"]

[websocket]
endpoint = "${WS_ENDPOINT}"

[consensus]
block_time         = ${BLOCK_TIME}
min_validators     = 4
block_finality     = 2
slashing_enabled   = true
double_sign_slash  = 0.05
downtime_slash     = 0.001
downtime_threshold = 10000

[storage]
data_dir   = "${GYDS_HOME}/data"
max_size_gb = ${STORAGE_GB}

[logging]
level   = "info"
dir     = "${LOG_DIR}"
EOF

chown "$GYDS_USER:$GYDS_USER" "$GYDS_HOME/config/validator.toml"
log "Config written: $GYDS_HOME/config/validator.toml"

# ═══════════════════════════════════════════════════════════════════════════════
header "Step 5/7 — Systemd Service"
# ═══════════════════════════════════════════════════════════════════════════════
cat > /etc/systemd/system/gyds-validator.service <<EOF
[Unit]
Description=GYDSchain Validator Node v${GYDS_VERSION}
Documentation=https://netlifegy.com/docs
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=600
StartLimitBurst=5

[Service]
Type=simple
User=${GYDS_USER}
Group=${GYDS_USER}
WorkingDirectory=${GYDS_HOME}

ExecStart=${GYDS_BIN}/gyds-fullnode \\
    --validator \\
    --config=${GYDS_HOME}/config/validator.toml \\
    --datadir=${GYDS_HOME}/data \\
    --rpcport=${RPC_PORT} \\
    --p2pport=${P2P_PORT} \\
    --wallet=${WALLET_ADDR} \\
    --validator-key=${VAL_KEY} \\
    --node-key=${NODE_KEY} \\
    --moniker=${MONIKER} \\
    --bootnodes=${BOOTNODE_ADDR} \\
    --log-level=info

Restart=on-failure
RestartSec=15
TimeoutStartSec=120
TimeoutStopSec=60
LimitNOFILE=65535
LimitNPROC=4096

StandardOutput=append:${LOG_DIR}/validator.log
StandardError=append:${LOG_DIR}/validator-error.log

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
ReadWritePaths=${GYDS_HOME} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gyds-validator
log "Systemd service registered: gyds-validator.service"

# ═══════════════════════════════════════════════════════════════════════════════
header "Step 6/7 — WireGuard VPN"
# ═══════════════════════════════════════════════════════════════════════════════
if [[ "$ENABLE_WG" == "true" ]]; then
  if ! command -v wg >/dev/null; then
    apt-get install -y -qq wireguard wireguard-tools 2>/dev/null || true
  fi

  WG_KEY_FILE="$GYDS_HOME/keys/wg.key"
  WG_PUB_FILE="$GYDS_HOME/keys/wg.pub"

  if [[ ! -f "$WG_KEY_FILE" ]]; then
    wg genkey | tee "$WG_KEY_FILE" | wg pubkey > "$WG_PUB_FILE"
    chmod 600 "$WG_KEY_FILE"
    chown "$GYDS_USER:$GYDS_USER" "$WG_KEY_FILE" "$WG_PUB_FILE"
  fi

  WG_PRIVATE="$(cat "$WG_KEY_FILE")"
  WG_PUBLIC="$(cat "$WG_PUB_FILE")"

  # Write WireGuard peer config (server pubkey must be filled in by admin)
  cat > "$GYDS_HOME/config/wg-validator.conf" <<EOF
# WireGuard VPN — ${MONIKER} validator
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Send your public key to the network admin to get peered.

[Interface]
PrivateKey = ${WG_PRIVATE}
# Address assigned by admin, e.g.:
# Address = 10.0.0.X/32
DNS = 1.1.1.1, 8.8.8.8
MTU = 1420

[Peer]
# Server public key — provided by admin
PublicKey = FILL_IN_SERVER_PUBKEY
Endpoint  = vpn.netlifegy.com:51820
AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25
EOF
  chmod 600 "$GYDS_HOME/config/wg-validator.conf"
  chown "$GYDS_USER:$GYDS_USER" "$GYDS_HOME/config/wg-validator.conf"

  echo ""
  echo -e "${BOLD}  WireGuard keypair generated.${NC}"
  echo -e "  Share this public key with the network admin to get a VPN IP:"
  echo ""
  echo -e "  ${BOLD}${CYAN}${WG_PUBLIC}${NC}"
  echo ""
  echo -e "  Config template: $GYDS_HOME/config/wg-validator.conf"
  echo -e "  After admin fills in the server pubkey and assigns your IP:"
  echo -e "    sudo cp $GYDS_HOME/config/wg-validator.conf /etc/wireguard/wg0.conf"
  echo -e "    sudo wg-quick up wg0"
  log "WireGuard keys generated"
else
  warn "WireGuard skipped (--no-wg)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
header "Step 7/7 — Firewall Rules"
# ═══════════════════════════════════════════════════════════════════════════════
if command -v ufw >/dev/null; then
  ufw allow "${P2P_PORT}/tcp" comment 'GYDS Validator P2P TCP' >/dev/null 2>&1 || true
  ufw allow "${P2P_PORT}/udp" comment 'GYDS Validator P2P UDP' >/dev/null 2>&1 || true
  ufw allow "${RPC_PORT}/tcp" comment 'GYDS Validator RPC'     >/dev/null 2>&1 || true
  [[ "$ENABLE_WG" == "true" ]] && \
    ufw allow 51820/udp comment 'WireGuard VPN' >/dev/null 2>&1 || true
  log "Firewall rules added"
fi

# ─── Log rotation ────────────────────────────────────────────────────────────
cat > /etc/logrotate.d/gyds-validator <<EOF
${LOG_DIR}/validator*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        systemctl kill -s HUP gyds-validator 2>/dev/null || true
    endscript
}
EOF

# ─── Start the validator ─────────────────────────────────────────────────────
info "Starting gyds-validator service..."
systemctl start gyds-validator 2>/dev/null || true
sleep 3

SVC_STATUS="$(systemctl is-active gyds-validator 2>/dev/null || echo 'unknown')"
PUB_IP="$(curl -fsS4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"

# ─── Final summary ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║   ✅  GYDSchain Validator Node Setup Complete                          ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

printf "  %-20s %s\n" "Service status:"  "${SVC_STATUS}"
printf "  %-20s %s\n" "Moniker:"         "${MONIKER}"
printf "  %-20s %s\n" "Wallet:"          "${WALLET_ADDR}"
printf "  %-20s %s\n" "Commission:"      "${COMMISSION}%"
printf "  %-20s %s\n" "Self-stake:"      "${STAKE_AMOUNT} GYD"
printf "  %-20s %s\n" "Chain ID:"        "${CHAIN_ID}"
printf "  %-20s %s\n" "Public IP:"       "${PUB_IP}"
printf "  %-20s %s:%s\n" "P2P endpoint:" "${PUB_IP}" "${P2P_PORT}"
printf "  %-20s %s:%s\n" "RPC endpoint:" "${PUB_IP}" "${RPC_PORT}"
echo ""
echo -e "  ${BOLD}Key files (BACK THESE UP):${NC}"
printf "  %-20s %s\n" "Validator key:"  "${VAL_KEY}"
printf "  %-20s %s\n" "Validator cert:" "${VAL_CERT}"
printf "  %-20s %s\n" "Node key:"       "${NODE_KEY}"
[[ "$ENABLE_WG" == "true" ]] && \
  printf "  %-20s %s\n" "WG private key:" "${WG_KEY_FILE:-n/a}"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "    ${CYAN}systemctl status  gyds-validator${NC}      # service status"
echo -e "    ${CYAN}systemctl restart gyds-validator${NC}      # restart"
echo -e "    ${CYAN}journalctl -u gyds-validator -f${NC}       # live logs"
echo -e "    ${CYAN}tail -f ${LOG_DIR}/validator.log${NC}  # file logs"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "    1. ${YELLOW}Back up${NC} $VAL_KEY to a secure location"
[[ "$ENABLE_WG" == "true" ]] && \
  echo -e "    2. Send your WireGuard pubkey to the admin: ${CYAN}$(cat "${WG_PUB_FILE:-/dev/null}" 2>/dev/null || echo 'see above')${NC}"
echo -e "    3. Register your validator on the dashboard: ${CYAN}https://netlifegy.com/validators${NC}"
echo -e "    4. Monitor: ${CYAN}https://explorer.netlifegy.com${NC}"
echo ""
