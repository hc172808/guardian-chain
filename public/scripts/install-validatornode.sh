#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  GYDSchain Validator Node Installer
#  Repo:     https://github.com/hc172808/fullnode.git
#  OS:       Ubuntu 20.04/22.04/24.04 | Debian 11/12 | CentOS/RHEL/AlmaLinux
#  Chain ID: 198282  |  Block time: 5s  |  Domain: netlifegy.com
#  Run:      sudo bash install-validatornode.sh [--domain validator.netlifegy.com]
#
#  IMPORTANT:  Requires 10,000 GYDS staked to become an active validator.
#              Back up /var/lib/gyds-validatornode/keystore/ — losing the key
#              means losing your stake and validator identity.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Load shared config (written by deploy-dashboard.sh — all values skippable) ─
GYDS_CONF="${GYDS_CONF:-/var/www/gydschain/gyds-config.env}"
# shellcheck disable=SC1090
[[ -f "$GYDS_CONF" ]] && { source "$GYDS_CONF"; echo "[config] Loaded shared config from $GYDS_CONF"; }

# ── Config ────────────────────────────────────────────────────────────────────
GYDS_VERSION="1.0.0"
BINARY="gyds-validatornode"
APP_USER="${APP_USER:-gyds}"
APP_DIR="${APP_DIR:-/opt/gyds-validatornode}"
DATA_DIR="${DATA_DIR:-/var/lib/gyds-validatornode}"
KEY_DIR="${KEY_DIR:-${DATA_DIR}/keystore}"
GYDS_BIN="${GYDS_BIN:-/usr/local/bin}"
LOG_DIR="${LOG_DIR:-${DATA_DIR}/logs}"
GO_VERSION="${GO_VERSION:-1.21.13}"

CHAIN_ID="${GYDS_CHAIN_ID:-198282}"
RPC_PORT="${GYDS_RPC_PORT:-8547}"
WS_PORT="${GYDS_WS_PORT:-8548}"
P2P_PORT="${GYDS_P2P_PORT:-30306}"
LOG_LEVEL="${GYDS_LOG_LEVEL:-info}"
BOOTSTRAP="${GYDS_BOOTSTRAP_NODES:-}"
REWARD_ADDRESS="${GYDS_REWARD_ADDRESS:-}"
STAKE_AMOUNT="${GYDS_STAKE_AMOUNT:-10000}"
UPSTREAM_RPC="${GYDS_UPSTREAM_RPC:-https://rpc.netlifegy.com}"
DOMAIN="${DOMAIN:-}"

REPO_URL="${REPO_URL:-https://github.com/hc172808/fullnode.git}"
BRANCH="main"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  GYDSchain VALIDATOR NODE Installer v${GYDS_VERSION}               ║"
echo "║  Chain ID: ${CHAIN_ID}  |  Block time: 5s  |  netlifegy.com  ║"
echo "║  Repo: github.com/hc172808/fullnode                            ║"
echo "║  Stake required: ${STAKE_AMOUNT} GYDS                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0"

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rpc-port)         RPC_PORT="$2";        shift 2 ;;
    --ws-port)          WS_PORT="$2";         shift 2 ;;
    --p2p-port)         P2P_PORT="$2";        shift 2 ;;
    --data-dir)         DATA_DIR="$2";        shift 2 ;;
    --domain)           DOMAIN="$2";          shift 2 ;;
    --log-level)        LOG_LEVEL="$2";       shift 2 ;;
    --reward-address)   REWARD_ADDRESS="$2";  shift 2 ;;
    --stake-amount)     STAKE_AMOUNT="$2";    shift 2 ;;
    --upstream-rpc)     UPSTREAM_RPC="$2";    shift 2 ;;
    --bootstrap-nodes)  BOOTSTRAP="$2";       shift 2 ;;
    *) warn "Unknown flag: $1"; shift ;;
  esac
done

# ── OS detection ──────────────────────────────────────────────────────────────
. /etc/os-release 2>/dev/null || die "Cannot read /etc/os-release"
OS_ID="${ID:-unknown}"
OS_LIKE="${ID_LIKE:-}"

is_debian() { case "$OS_ID" in ubuntu|debian) return 0;; esac; [[ "$OS_LIKE" == *debian* || "$OS_LIKE" == *ubuntu* ]] && return 0; return 1; }
is_rhel()   { case "$OS_ID" in rhel|centos|fedora|almalinux|rocky|ol) return 0;; esac; [[ "$OS_LIKE" == *rhel* || "$OS_LIKE" == *centos* ]] && return 0; return 1; }

is_debian || is_rhel || die "Unsupported OS: $OS_ID"
log "OS: $OS_ID $VERSION_ID"

# ── Detect arch ───────────────────────────────────────────────────────────────
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)        GO_ARCH="amd64" ;;
  aarch64|arm64) GO_ARCH="arm64" ;;
  *) die "Unsupported architecture: $ARCH" ;;
esac

# ── Pre-flight: reward address ────────────────────────────────────────────────
if [[ -z "$REWARD_ADDRESS" ]]; then
  warn "GYDS_REWARD_ADDRESS not set. Enter your GYDS wallet address for staking rewards:"
  read -r REWARD_ADDRESS
  [[ -n "$REWARD_ADDRESS" ]] || die "Reward address is required"
fi
log "Reward address: ${REWARD_ADDRESS}"

# ── System packages ───────────────────────────────────────────────────────────
log "[1/8] Installing system dependencies..."
if is_debian; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    build-essential git curl wget jq ufw fail2ban nginx certbot python3-certbot-nginx \
    ca-certificates openssl net-tools lsof wireguard-tools
elif is_rhel; then
  rpm -q epel-release &>/dev/null || dnf install -y epel-release 2>/dev/null || true
  dnf install -y gcc git curl wget jq firewalld fail2ban nginx certbot python3-certbot-nginx \
    ca-certificates openssl net-tools lsof wireguard-tools 2>/dev/null || \
  yum install -y gcc git curl wget jq firewalld fail2ban nginx ca-certificates openssl net-tools lsof
fi

# ── Go ────────────────────────────────────────────────────────────────────────
log "[2/8] Installing Go ${GO_VERSION}..."
export PATH="$PATH:/usr/local/go/bin"
CURRENT_GO=$(go version 2>/dev/null | awk '{print $3}' | sed 's/go//' || echo "none")
if [[ "$CURRENT_GO" != "$GO_VERSION" ]]; then
  GO_URL="https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
  wget -q "$GO_URL" -O /tmp/go.tar.gz || die "Failed to download Go from $GO_URL"
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  rm -f /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
  chmod +x /etc/profile.d/go.sh
  ln -sf /usr/local/go/bin/go    /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
fi
log "    $(go version)"

# ── Clone / update repo ───────────────────────────────────────────────────────
log "[3/8] Fetching source from ${REPO_URL}..."
if [[ -d "$APP_DIR/.git" ]]; then
  log "    Existing install found — pulling latest..."
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
[[ -f "$APP_DIR/go.mod" ]] || die "go.mod not found in $APP_DIR — check repo layout"

# ── Build binary ──────────────────────────────────────────────────────────────
log "[4/8] Building $BINARY..."
( cd "$APP_DIR" && go mod download && \
  go build -ldflags="-s -w -X main.version=${GYDS_VERSION}" \
    -o "/tmp/${BINARY}" . )
install -m 0755 -o root -g root "/tmp/${BINARY}" "${GYDS_BIN}/${BINARY}"
rm -f "/tmp/${BINARY}"
log "    Installed: ${GYDS_BIN}/${BINARY} ($(du -h "${GYDS_BIN}/${BINARY}" | cut -f1))"

# ── User & directories ────────────────────────────────────────────────────────
log "[5/8] Creating system user and directories..."
id "$APP_USER" &>/dev/null || \
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER" 2>/dev/null || \
  adduser --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"

mkdir -p "${DATA_DIR}"/{data,logs} "${KEY_DIR}" "${LOG_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}" "${LOG_DIR}"
chmod 700 "${KEY_DIR}"

# ── Validator key ─────────────────────────────────────────────────────────────
log "[6/8] Setting up validator key..."
KEY_FILE="${KEY_DIR}/validator.key"
if [[ ! -f "$KEY_FILE" ]]; then
  openssl rand -hex 32 > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  chown "${APP_USER}:${APP_USER}" "$KEY_FILE"
  log "    New validator key generated: ${KEY_FILE}"
  echo ""
  echo -e "${YELLOW}  ╔═══════════════════════════════════════════════════════╗"
  echo    "  ║  ⚠  BACK UP YOUR VALIDATOR KEY NOW                  ║"
  echo    "  ║                                                       ║"
  echo    "  ║  File: ${KEY_FILE}"
  echo    "  ║                                                       ║"
  echo    "  ║  Losing this key = losing your stake & validator ID  ║"
  echo -e "  ╚═══════════════════════════════════════════════════════╝${NC}"
  echo ""
else
  log "    Existing validator key found: ${KEY_FILE}"
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
log "[7/8] Configuring firewall..."
if is_debian && command -v ufw &>/dev/null; then
  ufw --force reset >/dev/null
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw limit 22/tcp             comment "SSH (rate-limited)" >/dev/null
  ufw allow 80/tcp             comment "HTTP"               >/dev/null
  ufw allow 443/tcp            comment "HTTPS"              >/dev/null
  ufw allow "${RPC_PORT}/tcp"  comment "GYDS Validator RPC" >/dev/null
  ufw allow "${WS_PORT}/tcp"   comment "GYDS Validator WS"  >/dev/null
  ufw allow "${P2P_PORT}/tcp"  comment "GYDS P2P"           >/dev/null
  ufw allow "${P2P_PORT}/udp"  comment "GYDS P2P"           >/dev/null
  ufw allow 51820/udp          comment "WireGuard VPN"      >/dev/null
  ufw --force enable >/dev/null
  log "    UFW enabled"
elif is_rhel && command -v firewall-cmd &>/dev/null; then
  systemctl enable --now firewalld
  firewall-cmd --permanent --add-port=22/tcp
  firewall-cmd --permanent --add-port=80/tcp
  firewall-cmd --permanent --add-port=443/tcp
  firewall-cmd --permanent --add-port="${RPC_PORT}/tcp"
  firewall-cmd --permanent --add-port="${WS_PORT}/tcp"
  firewall-cmd --permanent --add-port="${P2P_PORT}/tcp"
  firewall-cmd --permanent --add-port="${P2P_PORT}/udp"
  firewall-cmd --permanent --add-port=51820/udp
  firewall-cmd --reload
  log "    firewalld configured"
fi

# Fail2ban for SSH + RPC
if command -v fail2ban-server &>/dev/null; then
  cat > /etc/fail2ban/jail.d/gyds-validatornode.conf <<EOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled  = true
maxretry = 5
bantime  = 3600

[gyds-validator-rpc]
enabled  = true
port     = ${RPC_PORT}
maxretry = 20
bantime  = 3600
findtime = 300
EOF
  systemctl enable fail2ban &>/dev/null && systemctl restart fail2ban &>/dev/null || true
fi

# ── systemd service ───────────────────────────────────────────────────────────
log "[8/8] Installing systemd service..."

ENV_BLOCK="Environment=GYDS_CHAIN_ID=${CHAIN_ID}
Environment=GYDS_NODE_MODE=validator
Environment=GYDS_RPC_PORT=${RPC_PORT}
Environment=GYDS_RPC_HOST=127.0.0.1
Environment=GYDS_WS_PORT=${WS_PORT}
Environment=GYDS_P2P_PORT=${P2P_PORT}
Environment=GYDS_DATA_DIR=${DATA_DIR}/data
Environment=GYDS_KEY_DIR=${KEY_DIR}
Environment=GYDS_UPSTREAM_RPC=${UPSTREAM_RPC}
Environment=GYDS_REWARD_ADDRESS=${REWARD_ADDRESS}
Environment=GYDS_STAKE_AMOUNT=${STAKE_AMOUNT}
Environment=GYDS_LOG_LEVEL=${LOG_LEVEL}
Environment=GYDS_LOG_FORMAT=json"
[[ -n "$BOOTSTRAP" ]] && ENV_BLOCK+="
Environment=GYDS_BOOTSTRAP_NODES=${BOOTSTRAP}"

cat > /etc/systemd/system/gyds-validatornode.service <<EOF
[Unit]
Description=GYDSchain Validator Node v${GYDS_VERSION}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${DATA_DIR}
${ENV_BLOCK}
ExecStart=${GYDS_BIN}/${BINARY} start \
  --validator \
  --validator-key=${KEY_FILE} \
  --rpcport=${RPC_PORT} \
  --wsport=${WS_PORT} \
  --p2pport=${P2P_PORT} \
  --chain-id=${CHAIN_ID} \
  --datadir=${DATA_DIR}/data \
  --upstream=${UPSTREAM_RPC} \
  --reward-address=${REWARD_ADDRESS} \
  --http.api=eth,net,web3,txpool,admin,miner,personal,debug \
  --ws.api=eth,net,web3,txpool,admin
ExecReload=/bin/kill -HUP \$MAINPID
Restart=on-failure
RestartSec=15
TimeoutStopSec=60
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/validatornode.log
StandardError=append:${LOG_DIR}/validatornode-error.log
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${DATA_DIR} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF

# Optional nginx proxy (only exposes RPC locally by default)
if [[ -n "$DOMAIN" ]]; then
  cat > /etc/nginx/sites-available/gyds-validatornode <<EOF
limit_req_zone \$binary_remote_addr zone=validator_rpc:10m rate=60r/s;

server {
    listen 80;
    server_name ${DOMAIN};

    location /rpc {
        limit_req zone=validator_rpc burst=100 nodelay;
        proxy_pass         http://127.0.0.1:${RPC_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_read_timeout 30s;
    }
    location /ws {
        proxy_pass         http://127.0.0.1:${WS_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_read_timeout 86400s;
    }
    location /health {
        access_log off;
        proxy_pass http://127.0.0.1:${RPC_PORT}/health;
    }
}
EOF
  rm -f /etc/nginx/sites-enabled/default
  ln -sf /etc/nginx/sites-available/gyds-validatornode /etc/nginx/sites-enabled/
  nginx -t && systemctl enable nginx && systemctl restart nginx

  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@${DOMAIN}" 2>/dev/null; then
    log "    TLS certificate issued for ${DOMAIN}"
  else
    warn "    Certbot failed — HTTP only. Re-run after DNS propagates."
  fi
fi

systemctl daemon-reload
systemctl enable gyds-validatornode
systemctl restart gyds-validatornode
sleep 3

# ── Health check ──────────────────────────────────────────────────────────────
NODE_OK=false
for i in 1 2 3 4 5; do
  RESP=$(curl -sf --max-time 4 "http://localhost:${RPC_PORT}/health" 2>/dev/null || true)
  if [[ -n "$RESP" ]]; then NODE_OK=true; break; fi
  warn "    Attempt $i/5: waiting for validator node... (5s)"
  sleep 5
done

SERVER_IP=$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       GYDSchain VALIDATOR NODE — DEPLOYED                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
$NODE_OK && echo "  Status         : ✅ RUNNING" || echo "  Status         : ⚠️  NOT RESPONDING — check logs"
echo ""
echo "  Binary         : ${GYDS_BIN}/${BINARY}"
echo "  Service        : gyds-validatornode.service"
echo "  Data           : ${DATA_DIR}"
echo "  Validator key  : ${KEY_FILE}  ← BACK THIS UP!"
echo "  Logs           : ${LOG_DIR}/validatornode.log"
echo "  Repo           : ${REPO_URL}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  STAKING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Reward address : ${REWARD_ADDRESS}"
echo "  Stake required : ${STAKE_AMOUNT} GYDS"
echo "  Chain ID       : ${CHAIN_ID}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NETWORK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ -n "$DOMAIN" ]]; then
  echo "  RPC  : https://${DOMAIN}/rpc"
  echo "  WS   : wss://${DOMAIN}/ws"
else
  echo "  RPC  : http://127.0.0.1:${RPC_PORT}  (local only — use nginx for external)"
  echo "  WS   : ws://127.0.0.1:${WS_PORT}"
fi
echo "  P2P  : tcp/udp ${SERVER_IP}:${P2P_PORT}  ← open on your firewall!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MANAGEMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  systemctl status  gyds-validatornode"
echo "  journalctl -u     gyds-validatornode -f"
echo "  tail -f           ${LOG_DIR}/validatornode.log"
echo ""
echo "  Health check:"
echo "  curl http://localhost:${RPC_PORT}/health"
echo ""
echo "  Validator status:"
echo "  curl -s -X POST http://localhost:${RPC_PORT} \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"method\":\"gyds_validatorStatus\",\"params\":[],\"id\":1}'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${YELLOW}  ⚠  Remember to:"
echo    "     1. Stake ${STAKE_AMOUNT} GYDS to activate your validator slot"
echo    "     2. Register your node at: https://app.netlifegy.com/validators"
echo    "     3. Back up your key:  ${KEY_FILE}"
echo -e "     4. Open port ${P2P_PORT} TCP+UDP on your firewall/router${NC}"
echo ""
