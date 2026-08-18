#!/usr/bin/env bash
# install.sh — sets up the GYDS miner on Ubuntu (or any systemd-based Linux
# server): installs Node.js, dependencies, and registers a systemd service so
# the miner (and its web dashboard) auto-starts on boot and after crashes.
#
# Usage:
#   sudo bash install.sh
#
# After install:
#   - Edit /opt/gyds-miner/config.json with your wallet address (or use the
#     web dashboard once it's running).
#   - Dashboard: http://<server-ip>:4500
#   - Logs:      journalctl -u gyds-miner -f
set -euo pipefail

INSTALL_DIR="/opt/gyds-miner"
SERVICE_NAME="gyds-miner"
NODE_MAJOR="20"
RUN_USER="${SUDO_USER:-$(whoami)}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this script with sudo: sudo bash install.sh"
  exit 1
fi

echo "== GYDS Miner installer =="

# ── 1. Install Node.js if missing/old ───────────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt "$NODE_MAJOR" ]; then
  echo "-- Installing Node.js ${NODE_MAJOR}.x --"
  apt-get update -y
  apt-get install -y --no-install-recommends curl ca-certificates gnupg
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs build-essential
else
  echo "-- Node.js $(node -v) already installed --"
fi

# ── 2. Copy miner files ──────────────────────────────────────────────────────
echo "-- Installing miner to ${INSTALL_DIR} --"
mkdir -p "$INSTALL_DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR"/
cd "$INSTALL_DIR"

if [ ! -f config.json ]; then
  cp config.example.json config.json
  echo "-- Created config.json from example. --"
fi

# Require the wallet that will receive mining rewards during installation.
# It must be a real GYDS/EVM address, not the example placeholder or a user ID.
CURRENT_ADDRESS="$(node -e "try{const c=require('./config.json'); console.log(c.minerAddress||'')}catch(e){console.log('')}" 2>/dev/null || true)"
MINER_ADDRESS="${GYDS_MINER_ADDRESS:-$CURRENT_ADDRESS}"
while [[ ! "$MINER_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; do
  if [ ! -t 0 ]; then
    echo "A valid wallet is required. Re-run interactively or set GYDS_MINER_ADDRESS."
    exit 1
  fi
  read -r -p "Enter the GYDS wallet address for mining rewards (0x + 40 hex characters): " MINER_ADDRESS
  if [[ ! "$MINER_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "Invalid wallet address. Please enter the address created/imported in the GYDS Wallet page."
  fi
done

GYDS_MINER_ADDRESS="$MINER_ADDRESS" node <<'NODE'
const fs = require('fs');
const file = 'config.json';
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.minerAddress = process.env.GYDS_MINER_ADDRESS;
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
NODE
echo "-- Mining rewards will be sent to ${MINER_ADDRESS} --"

# ── 3. Install dependencies ──────────────────────────────────────────────────
echo "-- Installing npm dependencies --"
npm install --omit=dev --no-audit --no-fund

chown -R "$RUN_USER":"$RUN_USER" "$INSTALL_DIR"

# ── 4. Register systemd service ─────────────────────────────────────────────
echo "-- Registering systemd service --"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=GYDS Miner (with web dashboard)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=$(command -v node) ${INSTALL_DIR}/miner.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# ── 5. Open the dashboard port (best-effort, ufw only) ──────────────────────
WEB_PORT=$(node -e "try{console.log(require('${INSTALL_DIR}/config.json').webPort || 4500)}catch(e){console.log(4500)}")
if command -v ufw >/dev/null 2>&1; then
  ufw allow "${WEB_PORT}/tcp" >/dev/null 2>&1 || true
fi

IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}')

echo ""
echo "======================================================"
echo " GYDS Miner installed and running as a systemd service"
echo "======================================================"
echo " Dashboard:   http://${IP_ADDR:-<server-ip>}:${WEB_PORT}"
echo " Config file: ${INSTALL_DIR}/config.json"
echo " Logs:        journalctl -u ${SERVICE_NAME} -f"
echo " Restart:     systemctl restart ${SERVICE_NAME}"
echo " Stop:        systemctl stop ${SERVICE_NAME}"
echo ""
echo "Set your wallet address in the dashboard (or config.json) to start earning."
echo "======================================================"
