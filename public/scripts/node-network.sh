#!/usr/bin/env bash
# Shared network setup for the bundled GYDS node installers.
# Source this file from an installer; it does not run commands on its own.

node_network_resolve_p2p_host() {
  local host="${GYDS_P2P_ADVERTISE_HOST:-}"

  if [[ -z "$host" ]] && command -v curl >/dev/null 2>&1; then
    host="$(curl -4fsS --connect-timeout 3 --max-time 6 https://api.ipify.org 2>/dev/null | tr -d '[:space:]' || true)"
  fi

  [[ -n "$host" ]] || {
    echo "ERROR: Set GYDS_P2P_ADVERTISE_HOST to this node's externally reachable IP or DNS name." >&2
    echo "A node cannot advertise 127.0.0.1 or a private address to internet peers." >&2
    return 1
  }
  [[ "$host" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || {
    echo "ERROR: GYDS_P2P_ADVERTISE_HOST must be a hostname or IPv4 address without a scheme or port." >&2
    return 1
  }
  case "${host,,}" in
    localhost|127.*|0.0.0.0)
      echo "ERROR: GYDS_P2P_ADVERTISE_HOST cannot be localhost or a wildcard address." >&2
      return 1
      ;;
  esac

  GYDS_P2P_ADVERTISE_HOST="$host"
  export GYDS_P2P_ADVERTISE_HOST
}

node_network_allow_tcp_port() {
  local port="$1" label="${2:-GYDS service}"
  local -a root_cmd=()
  if [[ "$EUID" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      root_cmd=(sudo)
    else
      echo "WARNING: Cannot change the local firewall without root; open TCP ${port} in the host/cloud firewall."
      return 0
    fi
  fi
  [[ "$port" =~ ^[0-9]{1,5}$ ]] && (( 10#$port >= 1 && 10#$port <= 65535 )) || {
    echo "ERROR: Invalid TCP port: $port" >&2
    return 1
  }

  if command -v ufw >/dev/null 2>&1; then
    "${root_cmd[@]}" ufw allow "${port}/tcp" comment "$label" >/dev/null
    if ! "${root_cmd[@]}" ufw status 2>/dev/null | grep -qi 'Status: active'; then
      echo "WARNING: UFW is inactive. The TCP rule is saved but not enforced yet."
    fi
    return 0
  fi

  if command -v firewall-cmd >/dev/null 2>&1; then
    if "${root_cmd[@]}" firewall-cmd --state >/dev/null 2>&1; then
      "${root_cmd[@]}" firewall-cmd --permanent --add-port="${port}/tcp" >/dev/null
      "${root_cmd[@]}" firewall-cmd --reload
      return 0
    fi
  fi

  echo "WARNING: No active UFW/firewalld rule manager found; open TCP ${port} in the host/cloud firewall."
}

node_network_allow_p2p_tcp() {
  node_network_allow_tcp_port "$1" "GYDS P2P"
}

node_network_report_p2p() {
  local port="$1"
  echo "P2P endpoint: enode advertised at ${GYDS_P2P_ADVERTISE_HOST}:${port} (TCP)"
  echo "If peers still cannot connect, allow inbound TCP ${port} in the cloud/security-group firewall and any router/NAT."
}

node_network_tcp_listener_ready() {
  local port="$1"
  command -v ss >/dev/null 2>&1 || return 2
  ss -ltnH 2>/dev/null | awk -v port=":${port}" '$4 ~ (port "$") { found=1 } END { exit !found }'
}

node_network_report_tcp_listener() {
  local port="$1"
  if node_network_tcp_listener_ready "$port"; then
    echo "Local listener confirmed on TCP ${port}."
  else
    echo "WARNING: No local TCP listener detected on ${port}; check the node service log."
  fi
}

