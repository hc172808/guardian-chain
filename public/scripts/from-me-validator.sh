#!/bin/bash
# GydsChain Validator Node Installer v1.0

set -e

# ─── CONFIG ─────────────────────────────
INSTALL_DIR="/opt/gydschain"
REPO_DIR="/opt/gydschain-chain"
REPO_URL="https://github.com/hc172808/guardian-chain.git"
SERVICE_NAME="gyds-validator"
CHAIN_ID=13370
DATA_DIR="/var/lib/gydschain"
LOG_DIR="/var/log/gydschain"
BOOTNODE_ENODE=""  # <- replace with your Bootnode enode
VALIDATOR_WALLET="" # <- replace with your validator wallet address
PASSWORD_FILE="$INSTALL_DIR/pass.txt"
FULLNODE_BINARY="$INSTALL_DIR/gydsd"

# ─── CHECK ROOT ─────────────────────────
if [[ $EUID -ne 0 ]]; then
   echo "❌ Run as root: sudo bash setup-validator.sh"
   exit 1
fi

# ─── Step 1: Install dependencies ───────
echo "[1/8] Installing dependencies..."
apt-get update -qq
apt-get install -y -qq \
    git golang-go build-essential ufw curl jq

# ─── Step 2: Clone repo ──────────────────
echo "[2/8] Cloning repository..."
if [ ! -d "$REPO_DIR" ]; then
    git clone "$REPO_URL" "$REPO_DIR"
else
    echo "⚠️ Repo exists, pulling latest..."
    cd "$REPO_DIR"
    git pull
fi

# ─── Step 3: Build binary ───────────────
echo "[3/8] Building fullnode binary..."
cd "$REPO_DIR"
if [ -d "blockchain-go" ]; then cd blockchain-go; fi
go build -ldflags="-s -w" -o "$FULLNODE_BINARY" ./cmd/fullnode
chmod +x "$FULLNODE_BINARY"

# ─── Step 4: Create directories ──────────
echo "[4/8] Creating data and log directories..."
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"

# ─── Step 5: Prepare password file ──────
if [ ! -f "$PASSWORD_FILE" ]; then
    echo "Enter password for validator wallet (hidden input):"
    read -s PASSWORD
    echo "$PASSWORD" > "$PASSWORD_FILE"
    chmod 600 "$PASSWORD_FILE"
fi

# ─── Step 6: Initialize genesis ─────────
echo "[6/8] Initializing node with genesis block..."
if [ ! -f "$DATA_DIR"/genesis.json ]; then
    echo "⚠️ Copy your genesis.json to $DATA_DIR/genesis.json first!"
    exit 1
fi
$FULLNODE_BINARY init "$DATA_DIR/genesis.json" --datadir "$DATA_DIR"

# ─── Step 7: Create systemd service ─────
echo "[7/8] Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=GydsChain Validator Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=${FULLNODE_BINARY} \\
  --datadir=${DATA_DIR} \\
  --networkid=${CHAIN_ID} \\
  --port=30303 \\
  --bootnodes=${BOOTNODE_ENODE} \\
  --mine \\
  --unlock=${VALIDATOR_WALLET} \\
  --password=${PASSWORD_FILE} \\
  --syncmode=full \\
  --allow-insecure-unlock
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/node.log
StandardError=append:${LOG_DIR}/error.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl start ${SERVICE_NAME}

# ─── Step 8: Firewall & logs ────────────
ufw allow 30303/tcp >/dev/null
ufw allow 30303/udp >/dev/null
ufw allow 8546/tcp >/dev/null
ufw reload >/dev/null

echo ""
echo "========================================="
echo "✅ Validator Node Installed Successfully!"
echo "========================================="
echo ""
echo "Commands:"
echo "  systemctl status ${SERVICE_NAME}"
echo "  journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "Check block production with:"
echo "  ${FULLNODE_BINARY} attach"
echo "  > eth.blockNumber"
