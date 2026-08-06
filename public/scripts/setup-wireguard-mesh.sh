#!/bin/bash
# GYDS WireGuard Mesh — Auto-provision all founder nodes into a VPN mesh
# Generates server + peer configs, distributes them, and brings up the mesh.
#
# Usage:
#   On the first (bootstrap) node:
#     bash setup-wireguard-mesh.sh --init --peers "10.8.0.2:node1-pubkey,10.8.0.3:node2-pubkey"
#
#   On each peer node:
#     bash setup-wireguard-mesh.sh --join --server 10.8.0.1 --server-pubkey <KEY> --ip 10.8.0.2
#
# After running, wg0 interface is up. Check: wg show

set -e

WG_IF="wg0"
WG_PORT="51820"
SUBNET="10.8.0.0/24"
DNS="1.1.1.1"
CONFIG_DIR="/etc/wireguard"
STATE_DIR="/var/lib/gyds/wireguard"

MODE=""
MY_IP=""
SERVER_IP=""
SERVER_PUBKEY=""
PEERS_CSV=""

log() { echo -e "\033[0;36m[WireGuard Mesh]\033[0m $*"; }
ok()  { echo -e "\033[0;32m✓\033[0m $*"; }
err() { echo -e "\033[0;31m✗\033[0m $*"; exit 1; }

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --init)         MODE="init" ;;
        --join)         MODE="join" ;;
        --ip)           MY_IP="$2"; shift ;;
        --server)       SERVER_IP="$2"; shift ;;
        --server-pubkey) SERVER_PUBKEY="$2"; shift ;;
        --peers)        PEERS_CSV="$2"; shift ;;
        --port)         WG_PORT="$2"; shift ;;
        *) echo "Unknown: $1"; exit 1 ;;
    esac
    shift
done

[ -z "$MODE" ] && err "Specify --init (bootstrap node) or --join (peer node)"

# Install WireGuard if missing
if ! command -v wg >/dev/null 2>&1; then
    log "Installing WireGuard..."
    apt-get update -qq && apt-get install -y wireguard
fi

mkdir -p "$CONFIG_DIR" "$STATE_DIR"
chmod 700 "$CONFIG_DIR"

generate_keypair() {
    local name="$1"
    local priv="${STATE_DIR}/${name}.priv"
    local pub="${STATE_DIR}/${name}.pub"
    if [ ! -f "$priv" ]; then
        wg genkey | tee "$priv" | wg pubkey > "$pub"
        chmod 600 "$priv"
    fi
    PRIVATE_KEY=$(cat "$priv")
    PUBLIC_KEY=$(cat "$pub")
}

# ── INIT MODE (bootstrap / server node) ──────────────────────────────────────
if [ "$MODE" = "init" ]; then
    MY_IP="${MY_IP:-10.8.0.1}"
    log "Initialising WireGuard mesh as bootstrap node ($MY_IP)"

    generate_keypair "server"
    SERVER_PRIVATE="$PRIVATE_KEY"
    SERVER_PUBLIC="$PUBLIC_KEY"

    ok "Server keypair: $(cat ${STATE_DIR}/server.pub)"

    # Build [Interface] section
    cat > "${CONFIG_DIR}/${WG_IF}.conf" << EOF
[Interface]
Address = ${MY_IP}/24
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIVATE}
PostUp   = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
DNS = ${DNS}

EOF

    # Add peers from CSV: "10.8.0.2:pubkey1,10.8.0.3:pubkey2"
    if [ -n "$PEERS_CSV" ]; then
        IFS=',' read -ra PEER_LIST <<< "$PEERS_CSV"
        for PEER in "${PEER_LIST[@]}"; do
            PEER_IP=$(echo "$PEER" | cut -d: -f1)
            PEER_KEY=$(echo "$PEER" | cut -d: -f2)
            cat >> "${CONFIG_DIR}/${WG_IF}.conf" << EOF
[Peer]
PublicKey = ${PEER_KEY}
AllowedIPs = ${PEER_IP}/32

EOF
            ok "Added peer: $PEER_IP ($PEER_KEY)"
        done
    fi

    # Enable IP forwarding
    echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-gyds-wireguard.conf
    sysctl -p /etc/sysctl.d/99-gyds-wireguard.conf >/dev/null

    # Open firewall
    if command -v ufw >/dev/null 2>&1; then
        ufw allow ${WG_PORT}/udp comment "GYDS WireGuard" 2>/dev/null || true
    fi

    # Enable and start
    systemctl enable wg-quick@${WG_IF}
    systemctl restart wg-quick@${WG_IF} || wg-quick up ${WG_IF}

    ok "WireGuard mesh bootstrap node running!"
    echo ""
    echo "======================================================"
    echo " Bootstrap Node: ${MY_IP}"
    echo " Public Key    : ${SERVER_PUBLIC}"
    echo " Listen Port   : ${WG_PORT}"
    echo " Subnet        : ${SUBNET}"
    echo ""
    echo " Share this with peer nodes:"
    echo "   --server $(curl -s ifconfig.me) --server-pubkey ${SERVER_PUBLIC}"
    echo "======================================================"

# ── JOIN MODE (peer node) ─────────────────────────────────────────────────────
elif [ "$MODE" = "join" ]; then
    [ -z "$MY_IP" ]         && err "--ip is required (e.g. 10.8.0.2)"
    [ -z "$SERVER_IP" ]     && err "--server is required (bootstrap public IP)"
    [ -z "$SERVER_PUBKEY" ] && err "--server-pubkey is required"

    log "Joining WireGuard mesh as peer ($MY_IP)"

    generate_keypair "peer-${MY_IP//./-}"
    PEER_PRIVATE="$PRIVATE_KEY"
    PEER_PUBLIC="$PUBLIC_KEY"

    cat > "${CONFIG_DIR}/${WG_IF}.conf" << EOF
[Interface]
Address = ${MY_IP}/24
PrivateKey = ${PEER_PRIVATE}
DNS = ${DNS}

[Peer]
PublicKey = ${SERVER_PUBKEY}
Endpoint = ${SERVER_IP}:${WG_PORT}
AllowedIPs = ${SUBNET}
PersistentKeepalive = 25
EOF

    # Open firewall
    if command -v ufw >/dev/null 2>&1; then
        ufw allow ${WG_PORT}/udp comment "GYDS WireGuard peer" 2>/dev/null || true
    fi

    systemctl enable wg-quick@${WG_IF}
    systemctl restart wg-quick@${WG_IF} || wg-quick up ${WG_IF}

    ok "WireGuard peer connected to mesh!"
    echo ""
    echo "======================================================"
    echo " Peer IP     : ${MY_IP}"
    echo " Public Key  : ${PEER_PUBLIC}"
    echo " Server      : ${SERVER_IP}:${WG_PORT}"
    echo ""
    echo " Add this peer to the bootstrap node config:"
    echo "   [Peer]"
    echo "   PublicKey  = ${PEER_PUBLIC}"
    echo "   AllowedIPs = ${MY_IP}/32"
    echo ""
    echo " Then run on bootstrap node:"
    echo "   wg addconf ${WG_IF} <(echo '[Peer]')"
    echo "   # Or: systemctl restart wg-quick@${WG_IF}"
    echo "======================================================"
fi

# Verify
echo ""
log "WireGuard status:"
wg show 2>/dev/null || echo "(not yet running)"
