#!/usr/bin/env bash
# Create and verify a systemd unit that restores the dashboard API's PM2 list.
set -euo pipefail

die() { echo "[error] $*" >&2; exit 1; }

NODE_USER="${1:-${SUDO_USER:-}}"
[[ -n "$NODE_USER" ]] || die "Usage: sudo bash ensure-api-boot.sh <pm2-user>"
[[ "$EUID" -eq 0 ]] || die "Run as root so the PM2 systemd unit can be enabled."
[[ "$NODE_USER" =~ ^[a-zA-Z0-9_.-]+$ ]] || die "Invalid Linux username: $NODE_USER"
id -u "$NODE_USER" >/dev/null 2>&1 || die "Linux user does not exist: $NODE_USER"

NODE_HOME="$(getent passwd "$NODE_USER" | cut -d: -f6)"
[[ -n "$NODE_HOME" && -d "$NODE_HOME" ]] || die "Could not find the home directory for $NODE_USER."
[[ "$NODE_HOME" != *[[:space:]]* ]] || die "User home paths containing spaces are not supported by this unit."

PM2_BIN="$(su - "$NODE_USER" -c 'command -v pm2' 2>/dev/null || true)"
[[ -n "$PM2_BIN" && -x "$PM2_BIN" ]] || die "PM2 is not available to $NODE_USER; install PM2 and start the API first."
[[ "$PM2_BIN" != *[[:space:]]* ]] || die "PM2 executable paths containing spaces are not supported by this unit."
PM2_HOME="${NODE_HOME}/.pm2"
[[ -s "$PM2_HOME/dump.pm2" ]] || die "No saved PM2 process list exists for $NODE_USER. Start the API and run pm2 save first."

UNIT_NAME="pm2-${NODE_USER}.service"
UNIT_FILE="/etc/systemd/system/$UNIT_NAME"
PM2_PATH="$(dirname "$PM2_BIN"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
NODE_GROUP="$(id -gn "$NODE_USER")"

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=PM2 process manager for ${NODE_USER}
Documentation=https://pm2.keymetrics.io/
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=forking
User=${NODE_USER}
Group=${NODE_GROUP}
WorkingDirectory=${NODE_HOME}
Environment=PM2_HOME=${PM2_HOME}
Environment=PATH=${PM2_PATH}
PIDFile=${PM2_HOME}/pm2.pid
ExecStart=${PM2_BIN} resurrect
ExecReload=${PM2_BIN} reload all
ExecStop=${PM2_BIN} kill
Restart=on-failure
RestartSec=5
TimeoutStartSec=60

[Install]
WantedBy=multi-user.target
EOF
chmod 644 "$UNIT_FILE"

if command -v systemd-analyze >/dev/null 2>&1; then
  systemd-analyze verify "$UNIT_FILE" || die "Generated PM2 boot unit did not pass systemd validation."
fi

systemctl daemon-reload
systemctl enable "$UNIT_NAME"
if ! systemctl is-active --quiet "$UNIT_NAME"; then
  systemctl start "$UNIT_NAME"
fi
systemctl is-enabled --quiet "$UNIT_NAME" || die "$UNIT_NAME is not enabled at boot."
systemctl is-active --quiet "$UNIT_NAME" || {
  systemctl --no-pager --full status "$UNIT_NAME" || true
  die "$UNIT_NAME is not active."
}

echo "[ok] $UNIT_NAME is enabled and active; PM2 will restore its saved process list at boot."
