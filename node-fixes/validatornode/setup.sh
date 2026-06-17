#!/bin/bash
# GYDS Validator Node — Quick Setup Script
# Usage: bash setup.sh [--address 0xYOUR_ADDRESS] [--stake 1000]

set -e

REPO="https://github.com/hc172808/validatornode.git"
INSTALL_DIR="/opt/gyds-validatornode"
SERVICE_NAME="gyds-validatornode"
VALIDATOR_ADDRESS="${GYDS_VALIDATOR_ADDRESS:-}"
STAKE="${STAKE:-1000}"
RPC_PORT="${GYDS_RPC_PORT:-8543}"
P2P_PORT="${GYDS_P2P_PORT:-30302}"

# Parse args
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --address) VALIDATOR_ADDRESS="$2"; shift ;;
        --stake)   STAKE="$2"; shift ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
    shift
done

log() { echo -e "\033[0;36m[GYDS Validator]\033[0m $*"; }
ok()  { echo -e "\033[0;32m✓\033[0m $*"; }
err() { echo -e "\033[0;31m✗\033[0m $*"; exit 1; }

log "GYDS Validator Node Setup"
log "Chain ID   : 13370"
log "RPC Port   : $RPC_PORT"
log "P2P Port   : $P2P_PORT"
log "Validator  : ${VALIDATOR_ADDRESS:-<not set>}"
log "Stake      : $STAKE GYDS"
echo ""

# Check dependencies
command -v git   >/dev/null 2>&1 || err "git is required"
command -v go    >/dev/null 2>&1 || err "Go 1.22+ is required — install from https://go.dev/dl/"

GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
REQUIRED="1.22"
if [[ "$(printf '%s\n' "$REQUIRED" "$GO_VERSION" | sort -V | head -n1)" != "$REQUIRED" ]]; then
    err "Go $REQUIRED+ required, found $GO_VERSION"
fi

log "Cloning repository..."
if [ -d "$INSTALL_DIR" ]; then
    cd "$INSTALL_DIR" && git pull --ff-only
else
    git clone "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

log "Building binary..."
go mod tidy
go build -ldflags="-s -w" -o /usr/local/bin/gyds-validatornode .
ok "Binary installed to /usr/local/bin/gyds-validatornode"

# Create data directory
mkdir -p /var/lib/gyds/validator
ok "Data directory: /var/lib/gyds/validator"

# Write systemd service
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=GYDS Chain Validator Node
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/gyds-validatornode
ExecStart=/usr/local/bin/gyds-validatornode start
Restart=always
RestartSec=10
Environment=GYDS_CHAIN_ID=13370
Environment=GYDS_NODE_MODE=validator
Environment=GYDS_RPC_PORT=${RPC_PORT}
Environment=GYDS_P2P_PORT=${P2P_PORT}
Environment=GYDS_BLOCK_TIME=120
Environment=GYDS_DATA_DIR=/var/lib/gyds/validator
Environment=GYDS_VALIDATOR_ADDRESS=${VALIDATOR_ADDRESS}
Environment=GYDS_LOG_FORMAT=pretty
Environment=GYDS_LOG_LEVEL=info
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gyds-validatornode
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# Firewall rules
if command -v ufw >/dev/null 2>&1; then
    ufw allow $P2P_PORT/tcp comment "GYDS Validator P2P" 2>/dev/null || true
    log "UFW rule added for port $P2P_PORT"
fi

# Enable and start
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME
ok "Service started: $SERVICE_NAME"

echo ""
echo "======================================================"
echo " GYDS Validator Node running!"
echo "======================================================"
echo " RPC     : http://$(hostname -I | awk '{print $1}'):${RPC_PORT}"
echo " P2P     : tcp://$(hostname -I | awk '{print $1}'):${P2P_PORT}"
echo " Status  : systemctl status $SERVICE_NAME"
echo " Logs    : journalctl -fu $SERVICE_NAME"
echo " Docs    : https://app.netlifegy.com/admin"
echo "======================================================"

if [ -z "$VALIDATOR_ADDRESS" ]; then
    echo ""
    echo "⚠  Set your validator address:"
    echo "   systemctl edit $SERVICE_NAME"
    echo "   Add: Environment=GYDS_VALIDATOR_ADDRESS=0xYOUR_ADDRESS"
    echo "   Then: systemctl restart $SERVICE_NAME"
fi
