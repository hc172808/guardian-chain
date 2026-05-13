#!/bin/bash
# GydsChain Enterprise Mainnet Bootstrap Installer
# Sets up Bootnode, Validator, RPC, Fullnode, Lite node
set -e

# ─── CONFIG ─────────────────────────────
INSTALL_DIR="/opt/gydschain"
REPO_DIR="/opt/gydschain-chain"
REPO_URL="https://github.com/hc172808/guardian-chain.git"
CHAIN_ID=13370
GENESIS_FILE="genesis.json"

# Node Data & Logs
DATA_BOOTNODE="/var/lib/gydschain-bootnode"
DATA_VALIDATOR="/var/lib/gydschain-validator"
DATA_RPC="/var/lib/gydschain-rpc"
DATA_FULL="/var/lib/gydschain-full"
DATA_LITE="/var/lib/gydschain-lite"

LOG_BOOTNODE="/var/log/gydschain-bootnode"
LOG_VALIDATOR="/var/log/gydschain-validator"
LOG_RPC="/var/log/gydschain-rpc"
LOG_FULL="/var/log/gydschain-full"
LOG_LITE="/var/log/gydschain-lite"

# User Inputs
echo "Enter validator wallet address:"
read VALIDATOR_WALLET
echo "Enter RPC node URL for lite node (optional, leave blank to skip):"
read RPC_URL

# ─── STEP 0: CHECK ROOT ─────────────────
if [[ $EUID -ne 0 ]]; then
    echo "❌ Run as root: sudo bash mainnet-bootstrap.sh"
    exit 1
fi

# ─── STEP 1: INSTALL DEPENDENCIES ───────
apt-get update -qq
apt-get install -y -qq git golang-go build-essential ufw curl jq

# ─── STEP 2: CLONE REPO ─────────────────
if [ ! -d "$REPO_DIR" ]; then
    git clone "$REPO_URL" "$REPO_DIR"
else
    cd "$REPO_DIR"
    git pull
fi

# ─── STEP 3: BUILD BINARIES ─────────────
mkdir -p "$INSTALL_DIR"
cd "$REPO_DIR"
if [ -d "blockchain-go" ]; then cd blockchain-go; fi
echo "[BUILD] Fullnode binary..."
go build -ldflags="-s -w" -o "$INSTALL_DIR/gydsd" ./cmd/fullnode
chmod +x "$INSTALL_DIR/gydsd"
echo "[BUILD] Lite node binary..."
go build -ldflags="-s -w" -o "$INSTALL_DIR/litenode" ./cmd/litenode
chmod +x "$INSTALL_DIR/litenode"

# ─── STEP 4: CREATE DATA & LOG DIRECTORIES ─────────────
mkdir -p "$DATA_BOOTNODE" "$DATA_VALIDATOR" "$DATA_RPC" "$DATA_FULL" "$DATA_LITE"
mkdir -p "$LOG_BOOTNODE" "$LOG_VALIDATOR" "$LOG_RPC" "$LOG_FULL" "$LOG_LITE"

# ─── STEP 5: BOOTNODE SETUP ───────────────────────────
BOOTNODE_KEY="$DATA_BOOTNODE/bootnode.key"
if [ ! -f "$BOOTNODE_KEY" ]; then
    echo "[BOOTNODE] Generating key..."
    $INSTALL_DIR/gydsd bootnode -genkey "$BOOTNODE_KEY"
fi
BOOTNODE_ENODE=$($INSTALL_DIR/gydsd bootnode -nodekey "$BOOTNODE_KEY" -writeaddress)
echo "[BOOTNODE] Enode: $BOOTNODE_ENODE"

cat > /etc/systemd/system/gyds-bootnode.service << EOF
[Unit]
Description=GydsChain Bootnode
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=$INSTALL_DIR/gydsd bootnode --nodekey $BOOTNODE_KEY --verbosity 3
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:$LOG_BOOTNODE/node.log
StandardError=append:$LOG_BOOTNODE/error.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gyds-bootnode
systemctl start gyds-bootnode

# ─── STEP 6: COPY GENESIS ─────────────────────────────
if [ ! -f "$GENESIS_FILE" ]; then
    echo "⚠️ Place $GENESIS_FILE in the current folder before running the script!"
    exit 1
fi
cp "$GENESIS_FILE" "$DATA_VALIDATOR/$GENESIS_FILE"
cp "$GENESIS_FILE" "$DATA_RPC/$GENESIS_FILE"
cp "$GENESIS_FILE" "$DATA_FULL/$GENESIS_FILE"
cp "$GENESIS_FILE" "$DATA_LITE/$GENESIS_FILE"

# ─── STEP 7: INITIALIZE NODES ─────────────────────────
echo "[INIT] Initializing nodes..."
$INSTALL_DIR/gydsd init "$DATA_VALIDATOR/$GENESIS_FILE" --datadir "$DATA_VALIDATOR"
$INSTALL_DIR/gydsd init "$DATA_RPC/$GENESIS_FILE" --datadir "$DATA_RPC"
$INSTALL_DIR/gydsd init "$DATA_FULL/$GENESIS_FILE" --datadir "$DATA_FULL"
$INSTALL_DIR/litenode init "$DATA_LITE/$GENESIS_FILE" --datadir "$DATA_LITE"

# ─── STEP 8: CREATE SYSTEMD SERVICES ──────────────────

# Validator
cat > /etc/systemd/system/gyds-validator.service << EOF
[Unit]
Description=GydsChain Validator Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=$INSTALL_DIR/gydsd \\
  --datadir=$DATA_VALIDATOR \\
  --networkid=$CHAIN_ID \\
  --bootnodes=$BOOTNODE_ENODE \\
  --mine \\
  --unlock=$VALIDATOR_WALLET \\
  --allow-insecure-unlock
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:$LOG_VALIDATOR/node.log
StandardError=append:$LOG_VALIDATOR/error.log

[Install]
WantedBy=multi-user.target
EOF

# RPC Node
cat > /etc/systemd/system/gyds-rpc.service << EOF
[Unit]
Description=GydsChain RPC Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=$INSTALL_DIR/gydsd \\
  --datadir=$DATA_RPC \\
  --networkid=$CHAIN_ID \\
  --bootnodes=$BOOTNODE_ENODE \\
  --rpc \\
  --rpcaddr 0.0.0.0 \\
  --rpcport 8546
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:$LOG_RPC/node.log
StandardError=append:$LOG_RPC/error.log

[Install]
WantedBy=multi-user.target
EOF

# Full Node
cat > /etc/systemd/system/gyds-fullnode.service << EOF
[Unit]
Description=GydsChain Full Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=$INSTALL_DIR/gydsd \\
  --datadir=$DATA_FULL \\
  --networkid=$CHAIN_ID \\
  --bootnodes=$BOOTNODE_ENODE \\
  --rpc \\
  --rpcaddr 0.0.0.0 \\
  --rpcport 8546
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:$LOG_FULL/node.log
StandardError=append:$LOG_FULL/error.log

[Install]
WantedBy=multi-user.target
EOF

# Lite Node
cat > /etc/systemd/system/gyds-litenode.service << EOF
[Unit]
Description=GydsChain Lite Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
ExecStart=$INSTALL_DIR/litenode \\
  --datadir=$DATA_LITE \\
  --chain-id=$CHAIN_ID \\
  --bootnodes=$BOOTNODE_ENODE \\
  --rpc=$RPC_URL
Restart=always
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:$LOG_LITE/node.log
StandardError=append:$LOG_LITE/error.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gyds-validator gyds-rpc gyds-fullnode gyds-litenode
systemctl start gyds-validator gyds-rpc gyds-fullnode gyds-litenode

# ─── STEP 9: FIREWALL ─────────────────────
ufw allow 30303/tcp >/dev/null
ufw allow 30303/udp >/dev/null
ufw allow 8546/tcp >/dev/null
ufw reload >/dev/null

echo ""
echo "======================================"
echo "✅ GydsChain Mainnet Bootstrap Complete!"
echo "Bootnode Enode: $BOOTNODE_ENODE"
echo "Services: gyds-bootnode, gyds-validator, gyds-rpc, gyds-fullnode, gyds-litenode"
echo "Logs: /var/log/gydschain-*"
echo "Commands:"
echo "  systemctl status gyds-bootnode"
echo "  systemctl status gyds-validator"
echo "  systemctl status gyds-rpc"
echo "  systemctl status gyds-fullnode"
echo "  systemctl status gyds-litenode"
echo ""
