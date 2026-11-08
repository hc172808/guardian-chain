#!/usr/bin/env bash
# Register node services installed on the same host as the GYDS dashboard.
# This script uses the dashboard's local .env/database and never prints the DB URL.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/gydschain}"
ENV_FILE="${APP_DIR}/.env"
SHARED_CONFIG="${APP_DIR}/gyds-config.env"
SYSTEMD_UNIT_DIR="${SYSTEMD_UNIT_DIR:-/etc/systemd/system}"
REGISTERED_COUNT=0

log()  { printf '[nodes] %s\n' "$*"; }
warn() { printf '[nodes] WARNING: %s\n' "$*" >&2; }

read_env_value() {
  local file="$1" key="$2" line value
  [[ -f "$file" ]] || return 0
  line="$(grep -m1 -E "^${key}=" "$file" 2>/dev/null || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" ]]; then value="${value#\"}"; value="${value%\"}"; fi
  if [[ "$value" == \'*\' ]]; then value="${value#\'}"; value="${value%\'}"; fi
  printf '%s' "$value"
}

if [[ -n "${DATABASE_URL:-}" ]]; then
  DB_URL="$DATABASE_URL"
else
  DB_URL="$(read_env_value "$ENV_FILE" DATABASE_URL)"
fi

if [[ -z "$DB_URL" || ! -f "$ENV_FILE" ]]; then
  log "No local dashboard database found at ${ENV_FILE}; local services were not registered."
  log "For a separate dashboard host, register the node from its authenticated Node Installer page."
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  warn "psql is unavailable; the node services were installed but were not added to the dashboard."
  exit 0
fi

if ! psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -Atc 'SELECT 1' >/dev/null 2>&1; then
  warn "The dashboard database could not be reached; node registration was skipped."
  exit 0
fi

OWNER_ID="$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -Atc \
  "SELECT id FROM users WHERE lower(username) IN ('founder','admin') ORDER BY CASE lower(username) WHEN 'founder' THEN 0 ELSE 1 END LIMIT 1" \
  2>/dev/null || true)"
if [[ -z "$OWNER_ID" ]]; then
  warn "No founder/admin user exists yet; node registration was skipped."
  exit 0
fi

CHAIN_ID="${GYDS_CHAIN_ID:-$(read_env_value "$SHARED_CONFIG" GYDS_CHAIN_ID)}"
CHAIN_ID="${CHAIN_ID:-198282}"
case "$CHAIN_ID" in
  198281) NETWORK="testnet" ;;
  198283) NETWORK="devnet" ;;
  *)      NETWORK="mainnet" ;;
esac

NODE_USER="${NODE_USER:-${SUDO_USER:-}}"
if [[ -z "$NODE_USER" || "$NODE_USER" == "root" ]]; then
  NODE_USER="$(stat -c '%U' "$ENV_FILE" 2>/dev/null || true)"
fi
if [[ -z "$NODE_USER" || "$NODE_USER" == "root" ]]; then
  NODE_USER="ubuntu"
fi
NODE_HOME="$(getent passwd "$NODE_USER" | cut -d: -f6 || true)"
NODE_HOME="${NODE_HOME_OVERRIDE:-$NODE_HOME}"
SYSTEMD_USER_UNIT_DIR="${SYSTEMD_USER_UNIT_DIR:-${NODE_HOME}/.config/systemd/user}"

HOSTNAME_VALUE="$(hostname -f 2>/dev/null || hostname)"
# The dashboard's own node monitor must be able to reach local RPC services
# without relying on NAT loopback or a public firewall rule.
IP_ADDRESS="${NODE_MONITOR_IP:-127.0.0.1}"

service_active() {
  local service="$1"
  if systemctl is-active --quiet "$service"; then return 0; fi
  systemctl start "$service" >/dev/null 2>&1 || true
  systemctl is-active --quiet "$service"
}

user_lite_active() {
  local home="$1" user="$2" uid bus
  local unit="${SYSTEMD_USER_UNIT_DIR}/gyds-litenode.service"
  [[ -f "$unit" ]] || return 1
  uid="$(id -u "$user" 2>/dev/null)" || return 1
  bus="/run/user/${uid}/bus"

  if command -v loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$user" >/dev/null 2>&1 || true
  fi
  systemctl start "user@${uid}.service" >/dev/null 2>&1 || true
  for _ in {1..10}; do
    [[ -S "$bus" ]] && break
    sleep 1
  done
  [[ -S "$bus" ]] || return 1

  runuser -u "$user" -- env \
    HOME="$home" \
    XDG_RUNTIME_DIR="/run/user/${uid}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=${bus}" \
    systemctl --user start gyds-litenode >/dev/null 2>&1 || true
  runuser -u "$user" -- env \
    HOME="$home" \
    XDG_RUNTIME_DIR="/run/user/${uid}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=${bus}" \
    systemctl --user is-active --quiet gyds-litenode
}

register_node() {
  local node_type="$1" rpc_port="$2" active="$3"
  if ! psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 \
      -v owner_id="$OWNER_ID" \
      -v node_type="$node_type" \
      -v node_ip="$IP_ADDRESS" \
      -v node_hostname="$HOSTNAME_VALUE" \
      -v rpc_port="$rpc_port" \
      -v network="$NETWORK" \
      -v is_online="$active" <<'SQL' >/dev/null 2>&1
WITH existing AS (
  SELECT id
  FROM node_installations
  WHERE user_id = :'owner_id'
    AND node_type = :'node_type'
    AND network = :'network'
    AND COALESCE(rpc_port, 0) = COALESCE(NULLIF(:'rpc_port', '')::integer, 0)
  ORDER BY created_at DESC
  LIMIT 1
),
updated AS (
  UPDATE node_installations AS n
  SET ip_address = NULLIF(:'node_ip', ''),
      hostname = NULLIF(:'node_hostname', ''),
      rpc_port = NULLIF(:'rpc_port', '')::integer,
      is_approved = TRUE,
      approved_by = :'owner_id',
      approved_at = COALESCE(n.approved_at, NOW()),
      is_online = :'is_online'::boolean,
      last_heartbeat = CASE WHEN :'is_online'::boolean THEN NOW() ELSE n.last_heartbeat END
  FROM existing
  WHERE n.id = existing.id
  RETURNING n.id
)
INSERT INTO node_installations
  (user_id, node_type, ip_address, hostname, rpc_port, network, is_approved, approved_by, approved_at, is_online, last_heartbeat)
SELECT :'owner_id', :'node_type', NULLIF(:'node_ip', ''), NULLIF(:'node_hostname', ''),
       NULLIF(:'rpc_port', '')::integer, :'network', TRUE, :'owner_id', NOW(),
       :'is_online'::boolean, CASE WHEN :'is_online'::boolean THEN NOW() ELSE NULL END
WHERE NOT EXISTS (SELECT 1 FROM existing);
SQL
  then
    warn "Could not register ${node_type}; check the dashboard database schema and server logs."
    return 0
  fi
  REGISTERED_COUNT=$((REGISTERED_COUNT + 1))
  if [[ "$active" == "true" ]]; then
    log "${node_type}: running and visible in the dashboard (${NETWORK})."
  else
    log "${node_type}: installed but not active; visible as offline in the dashboard."
  fi
}

register_system_service() {
  local node_type="$1" service="$2" port="$3" unit
  unit="${SYSTEMD_UNIT_DIR}/${service}.service"
  [[ -f "$unit" ]] || return 0
  local active=false
  if service_active "$service"; then active=true; fi
  register_node "$node_type" "$port" "$active"
}

register_system_service "fullnode" "gyds-fullnode" "8545"
register_system_service "rpcnode" "gyds-rpcnode" "8547"
register_system_service "validatornode" "gyds-validatornode" "8547"
register_system_service "boostnode" "gyds-boostnode" "8547"
register_system_service "genesis" "gyds-genesis" "8547"
register_system_service "bootnode" "gyds-bootnode" ""

LITE_ACTIVE=false
if [[ -n "$NODE_HOME" ]] && user_lite_active "$NODE_HOME" "$NODE_USER"; then
  LITE_ACTIVE=true
fi
if [[ -n "$NODE_HOME" && -f "$SYSTEMD_USER_UNIT_DIR/gyds-litenode.service" ]]; then
  register_node "litenode" "8547" "$LITE_ACTIVE"
fi

if (( REGISTERED_COUNT == 0 )); then
  log "No installed GYDS node services were found on this host."
else
  log "Registered ${REGISTERED_COUNT} local node service(s)."
fi
