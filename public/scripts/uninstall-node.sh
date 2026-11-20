#!/usr/bin/env bash
# Safely uninstall GYDS node services without deleting chain data or keys.
set -euo pipefail

DRY_RUN=false
INSTALL_USER="${NODE_INSTALL_USER:-${SUDO_USER:-${USER:-}}}"
ROLES=()
ALL_ROLES=(fullnode rpcnode litenode boostnode genesis validatornode bootnode termux)

usage() {
  cat <<'EOF'
Usage: uninstall-node.sh [--dry-run] [--all | role ...]

Roles: fullnode rpcnode litenode boostnode genesis validatornode bootnode termux

This removes known GYDS service units, node binaries, and node-specific proxy
or fail2ban files. It keeps chain data, validator keys, wallets, config files,
logs, shared system users, firewall rules, and dashboard node registrations.
The real uninstall requires typing UNINSTALL to confirm.
EOF
}

normalize_role() {
  case "$1" in
    rpc) echo rpcnode ;;
    lite) echo litenode ;;
    validator) echo validatornode ;;
    *) echo "$1" ;;
  esac
}

while (($#)); do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --dry-run) DRY_RUN=true ;;
    --all) ROLES+=("${ALL_ROLES[@]}") ;;
    --*) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      role="$(normalize_role "$1")"
      if [[ ! " ${ALL_ROLES[*]} " == *" $role "* ]]; then
        echo "Unknown node role: $1" >&2
        usage >&2
        exit 2
      fi
      ROLES+=("$role")
      ;;
  esac
  shift
done

if ((${#ROLES[@]} == 0)); then
  usage >&2
  exit 2
fi

# Deduplicate roles while preserving the user's order.
UNIQUE_ROLES=()
for role in "${ROLES[@]}"; do
  found=false
  for existing in "${UNIQUE_ROLES[@]}"; do
    [[ "$role" == "$existing" ]] && found=true && break
  done
  [[ "$found" == true ]] || UNIQUE_ROLES+=("$role")
done
ROLES=("${UNIQUE_ROLES[@]}")

NEEDS_ROOT=false
for role in "${ROLES[@]}"; do
  case "$role" in
    fullnode|rpcnode|boostnode|genesis|validatornode|bootnode) NEEDS_ROOT=true ;;
  esac
done
if [[ "$NEEDS_ROOT" == true && "$EUID" -ne 0 && "$DRY_RUN" != true ]]; then
  echo "System node services require root. Re-run this command with sudo." >&2
  exit 1
fi

if [[ -z "$INSTALL_USER" || "$INSTALL_USER" == "root" && -n "${SUDO_USER:-}" ]]; then
  INSTALL_USER="${SUDO_USER:-root}"
fi
INSTALL_HOME="$HOME"
if [[ -n "$INSTALL_USER" ]] && command -v getent >/dev/null 2>&1; then
  resolved_home="$(getent passwd "$INSTALL_USER" | cut -d: -f6)"
  [[ -n "$resolved_home" ]] && INSTALL_HOME="$resolved_home"
fi

if [[ "$DRY_RUN" != true ]]; then
  printf 'Selected node roles: %s\n' "${ROLES[*]}"
  echo "This removes service units and node executables only."
  echo "Chain data, validator keys, wallets, configuration, and logs will be kept."
  echo "Firewall rules, shared service users, and dashboard node registrations will be left unchanged."
  read -r -p "Type UNINSTALL to continue: " answer
  [[ "$answer" == "UNINSTALL" ]] || { echo "Uninstall cancelled."; exit 0; }
fi

warn() { printf '[warning] %s\n' "$*" >&2; }
do_remove_file() {
  local path="$1"
  if [[ "$DRY_RUN" == true ]]; then
    printf '[dry-run] would remove file %s\n' "$path"
  elif [[ -e "$path" || -L "$path" ]]; then
    rm -f -- "$path"
    printf '[removed] %s\n' "$path"
  fi
}

remove_system_unit() {
  local unit="$1" marker="$2" unit_file="/etc/systemd/system/$1"
  if [[ "$DRY_RUN" == true ]]; then
    printf '[dry-run] would stop/disable %s and remove its unit if it matches %s\n' "$unit" "$marker"
    return
  fi
  [[ -f "$unit_file" || -L "$unit_file" ]] || return 0
  if ! grep -Fq -- "$marker" "$unit_file"; then
    warn "Leaving $unit in place because its unit file does not match the expected GYDS executable."
    return 0
  fi
  systemctl disable --now "$unit" >/dev/null 2>&1 || warn "Could not stop/disable $unit; removing its matching unit file."
  rm -f -- "$unit_file"
  SYSTEM_UNIT_CHANGED=true
  printf '[removed] %s\n' "$unit_file"
}

remove_nginx_site() {
  local name="$1" available="/etc/nginx/sites-available/$1"
  local enabled="/etc/nginx/sites-enabled/$1"
  local conf="/etc/nginx/conf.d/$1.conf"
  if [[ "$DRY_RUN" == true ]]; then
    printf '[dry-run] would remove the node-specific Nginx site %s if it points to this node\n' "$name"
    return
  fi

  if [[ -L "$enabled" ]]; then
    local target
    target="$(readlink -f "$enabled" 2>/dev/null || true)"
    if [[ "$target" == "$available" ]]; then
      do_remove_file "$enabled"
      NGINX_CHANGED=true
    else
      warn "Leaving Nginx link $enabled because it points somewhere else."
    fi
  elif [[ -e "$enabled" ]]; then
    warn "Leaving non-symlink Nginx entry $enabled for manual review."
  fi

  if [[ -f "$available" ]] && grep -Eq 'proxy_pass[[:space:]]+http://127\.0\.0\.1:' "$available"; then
    do_remove_file "$available"
    NGINX_CHANGED=true
  fi
  if [[ -f "$conf" ]] && grep -Eq 'proxy_pass[[:space:]]+http://127\.0\.0\.1:' "$conf"; then
    do_remove_file "$conf"
    NGINX_CHANGED=true
  fi
}

remove_fail2ban_file() {
  local path="$1"
  if [[ "$DRY_RUN" == true ]]; then
    printf '[dry-run] would remove node-specific fail2ban file %s\n' "$path"
  elif [[ -f "$path" ]]; then
    do_remove_file "$path"
    FAIL2BAN_CHANGED=true
  fi
}

remove_system_binary() {
  local binary="$1"
  do_remove_file "$binary"
}

remove_user_node() {
  local role="$1" uid runtime bus home
  home="$INSTALL_HOME"
  if [[ -z "$home" || ! -d "$home" ]]; then
    warn "Could not find the install user's home directory; skipping $role."
    return
  fi

  if [[ "$role" == "litenode" ]]; then
    local unit="$home/.config/systemd/user/gyds-litenode.service"
    local wants_link="$home/.config/systemd/user/default.target.wants/gyds-litenode.service"
    local binary="$home/.gydschain/bin/gyds-litenode"
    local start_script="$home/.gydschain/start.sh"
    local user_unit_marker="$home/.gydschain/start.sh"
    local remove_unit_link=false

    if [[ "$DRY_RUN" == true ]]; then
      printf '[dry-run] would stop the user lite-node service for %s\n' "$INSTALL_USER"
      remove_unit_link=true
    elif [[ -f "$unit" ]] && grep -Fq -- "$user_unit_marker" "$unit"; then
      if [[ "$EUID" -eq 0 && "$INSTALL_USER" != "root" ]]; then
        uid="$(id -u "$INSTALL_USER" 2>/dev/null || true)"
        runtime="/run/user/$uid"
        bus="$runtime/bus"
        if [[ -n "$uid" && -S "$bus" ]] && command -v runuser >/dev/null 2>&1; then
          runuser -u "$INSTALL_USER" -- env XDG_RUNTIME_DIR="$runtime" DBUS_SESSION_BUS_ADDRESS="unix:path=$bus" \
            systemctl --user disable --now gyds-litenode.service >/dev/null 2>&1 || warn "Could not stop the user lite-node service."
        else
          warn "No active user systemd bus for $INSTALL_USER; stopping matching node processes directly."
          if command -v pkill >/dev/null 2>&1; then
            pkill -TERM -x -u "$INSTALL_USER" gyds-litenode 2>/dev/null || true
          fi
        fi
      else
        systemctl --user disable --now gyds-litenode.service >/dev/null 2>&1 || warn "Could not stop the user lite-node service."
      fi
      do_remove_file "$unit"
      USER_UNIT_CHANGED=true
      remove_unit_link=true
    elif [[ ! -e "$unit" && ! -L "$unit" ]]; then
      remove_unit_link=true
    fi
    if [[ "$remove_unit_link" == true && -L "$wants_link" ]] &&
        [[ "$(readlink "$wants_link" 2>/dev/null || true)" == "../gyds-litenode.service" ]]; then
      do_remove_file "$wants_link"
      USER_UNIT_CHANGED=true
    fi

    if [[ "$EUID" -ne 0 && "$DRY_RUN" != true ]]; then
      pkill -TERM -x gyds-litenode 2>/dev/null || true
    fi
    do_remove_file "$binary"
    do_remove_file "$start_script"
    return
  fi

  # Termux's launcher and Android boot hook are removed; its wallet and chain
  # files under ~/.gyds remain untouched.
  local termux_binary="$home/.gyds/bin/gyds-litenode"
  local termux_start="$home/start-gyds.sh"
  local termux_stop="$home/stop-gyds.sh"
  local termux_boot="$home/.termux/boot/start-gyds.sh"
  if [[ "$DRY_RUN" != true ]]; then
    if [[ -x "$termux_stop" ]]; then bash "$termux_stop" >/dev/null 2>&1 || true; fi
    if command -v pkill >/dev/null 2>&1; then
      if [[ "$EUID" -eq 0 && -n "$INSTALL_USER" ]]; then
        pkill -TERM -x -u "$INSTALL_USER" gyds-litenode 2>/dev/null || true
      else
        pkill -TERM -x gyds-litenode 2>/dev/null || true
      fi
    fi
  else
    printf '[dry-run] would stop the Termux lite-node process for %s\n' "$INSTALL_USER"
  fi
  do_remove_file "$termux_binary"
  do_remove_file "$termux_start"
  do_remove_file "$termux_stop"
  if [[ -f "$termux_boot" ]] && grep -Fq -- "$termux_start" "$termux_boot"; then
    do_remove_file "$termux_boot"
  fi
}

SYSTEM_UNIT_CHANGED=false
USER_UNIT_CHANGED=false
NGINX_CHANGED=false
FAIL2BAN_CHANGED=false

for role in "${ROLES[@]}"; do
  printf '\n== %s ==\n' "$role"
  case "$role" in
    fullnode)
      remove_system_unit gyds-fullnode.service /usr/local/bin/gyds-fullnode
      remove_system_unit gydschain-fullnode.service /opt/gydschain/gyds-fullnode
      remove_system_binary /usr/local/bin/gyds-fullnode
      remove_system_binary /opt/gydschain/gyds-fullnode
      remove_nginx_site gyds-fullnode
      remove_fail2ban_file /etc/fail2ban/jail.d/gyds-fullnode.conf
      ;;
    rpcnode)
      remove_system_unit gyds-rpcnode.service /usr/local/bin/gyds-rpcnode
      remove_system_binary /usr/local/bin/gyds-rpcnode
      remove_nginx_site gyds-rpcnode
      remove_fail2ban_file /etc/fail2ban/jail.d/gyds-rpcnode.conf
      ;;
    litenode)
      # Some older local-node installs use a system service; the normal lite
      # installer uses a per-user service. Remove either only when recognized.
      if [[ "$EUID" -eq 0 || "$DRY_RUN" == true ]]; then
        remove_system_unit gyds-litenode.service /usr/local/bin/gyds-litenode
        remove_system_binary /usr/local/bin/gyds-litenode
      else
        warn "Not root; system-wide lite-node service will be left unchanged."
      fi
      remove_user_node litenode
      ;;
    boostnode)
      remove_system_unit gyds-boostnode.service /usr/local/bin/gyds-boostnode
      remove_system_binary /usr/local/bin/gyds-boostnode
      ;;
    genesis)
      remove_system_unit gyds-genesis.service /usr/local/bin/gyds-genesis
      remove_system_binary /usr/local/bin/gyds-genesis
      ;;
    validatornode)
      remove_system_unit gyds-validatornode.service /usr/local/bin/gyds-validatornode
      remove_system_binary /usr/local/bin/gyds-validatornode
      remove_nginx_site gyds-validatornode
      remove_fail2ban_file /etc/fail2ban/jail.d/gyds-validatornode.conf
      ;;
    bootnode)
      remove_system_unit gyds-bootnode.service /usr/local/bin/gyds-bootnode
      remove_system_binary /usr/local/bin/gyds-bootnode
      remove_fail2ban_file /etc/fail2ban/jail.d/gyds-bootnode.conf
      remove_fail2ban_file /etc/fail2ban/filter.d/gyds-bootnode.conf
      ;;
    termux)
      remove_user_node termux
      ;;
  esac
done

if [[ "$DRY_RUN" == true ]]; then
  printf '\n[dry-run] chain data, wallets, validator keys, configs, and logs are not removed.\n'
  exit 0
fi

if [[ "$SYSTEM_UNIT_CHANGED" == true ]]; then
  systemctl daemon-reload
fi
if [[ "$USER_UNIT_CHANGED" == true ]]; then
  if [[ "$EUID" -eq 0 && "$INSTALL_USER" != "root" ]]; then
    user_uid="$(id -u "$INSTALL_USER" 2>/dev/null || true)"
    user_runtime="/run/user/$user_uid"
    if [[ -n "$user_uid" && -S "$user_runtime/bus" ]] && command -v runuser >/dev/null 2>&1; then
      runuser -u "$INSTALL_USER" -- env XDG_RUNTIME_DIR="$user_runtime" DBUS_SESSION_BUS_ADDRESS="unix:path=$user_runtime/bus" \
        systemctl --user daemon-reload >/dev/null 2>&1 || warn "Could not reload $INSTALL_USER's user systemd manager."
    fi
  elif [[ "$EUID" -ne 0 ]]; then
    systemctl --user daemon-reload >/dev/null 2>&1 || true
  fi
fi
if [[ "$NGINX_CHANGED" == true ]]; then
  if command -v nginx >/dev/null 2>&1 && nginx -t; then
    systemctl reload nginx >/dev/null 2>&1 || warn "Nginx configuration is valid, but reload failed."
  else
    warn "Nginx configuration test failed; review the remaining Nginx configuration before reloading."
  fi
fi
if [[ "$FAIL2BAN_CHANGED" == true ]]; then
  fail2ban-client reload >/dev/null 2>&1 || warn "Could not reload fail2ban; node-specific files were removed."
fi

echo
echo "Uninstall finished. Chain data, keys, wallets, configs, and logs were preserved."
echo "Firewall rules and dashboard node registrations were left unchanged."
