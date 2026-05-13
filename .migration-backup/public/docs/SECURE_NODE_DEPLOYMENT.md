# Securing a GYDSChain Node: WireGuard + SSL

This document closes out **INF-12** (WireGuard mesh for private node-to-node P2P)
and **INF-13** (Let's Encrypt SSL for public RPC/Explorer endpoints).

Both of the underlying artifacts already ship in this repo — this guide is the
operator-facing recipe that ties them together for a hardened production
deployment of `netlifegy.com`.

---

## 1. WireGuard mesh (INF-12)

**Artifact:** `public/scripts/wireguard-config.template`

### Why
- Encrypts P2P gossip between fullnodes, validators, and the indexer.
- Lets you keep RPC ports (`8546`/`8547`) bound to the WG IP only, never the
  public internet.
- Survives DDoS at the public edge because peers only talk over WG.

### Server-side (one host as the WG hub)
```bash
# 1. Install
apt install -y wireguard wireguard-tools

# 2. Generate hub keypair
cd /etc/wireguard
umask 077
wg genkey | tee hub_private.key | wg pubkey > hub_public.key

# 3. Create /etc/wireguard/wg0.conf
cat > wg0.conf <<'EOF'
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = <PASTE hub_private.key>
PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
EOF

# 4. Open the port (UFW recipe lives at public/systemd/gyds-ufw.sh)
ufw allow 51820/udp
systemctl enable --now wg-quick@wg0
```

### Client/peer (per node)
1. Copy `public/scripts/wireguard-config.template` to the peer.
2. Replace `YOUR_PRIVATE_KEY_HERE`, `SERVER_PUBLIC_KEY_HERE`, and `Address`
   with the values from the admin (each peer gets a unique `10.0.0.X/32`).
3. Save as `/etc/wireguard/wg0.conf`, then `wg-quick up wg0`.
4. Confirm with `wg show` — handshake should appear within seconds.

### Bind RPC to the WG interface only
In `node.env`:
```
GYDS_RPC_BIND=10.0.0.1
GYDS_P2P_BIND=10.0.0.1
```
Public traffic hits Nginx → terminates TLS → proxies to `10.0.0.1:8546`.

---

## 2. SSL / TLS (INF-13)

**Artifact:** `public/scripts/ssl-setup.sh`

Run **on the public-facing host** (the one fronted by Nginx):

```bash
sudo DOMAIN=netlifegy.com EMAIL=admin@netlifegy.com bash public/scripts/ssl-setup.sh
```

What the script does (already implemented, see source):
1. Installs `certbot` + `python3-certbot-nginx`.
2. Validates A/AAAA + CAA records for `netlifegy.com` and the
   `www / rpc / rpc2 / rpc3 / explorer / vpn / api / ws / testnet-rpc`
   subdomains via `dig`.
3. Aborts loudly if any DNS record is missing or points elsewhere — refuses
   to spam the Let's Encrypt rate limiter.
4. Issues a single SAN certificate covering all subdomains.
5. Wires HSTS + OCSP stapling into the existing `public/docker/nginx.conf`.
6. Installs the certbot renewal timer (`systemctl status certbot.timer`).

### Verify
```bash
curl -sI https://rpc.netlifegy.com | grep -i strict-transport
openssl s_client -servername rpc.netlifegy.com -connect rpc.netlifegy.com:443 < /dev/null \
  | openssl x509 -noout -dates -subject -issuer
```

---

## 3. End-to-end traffic flow

```
                                   public internet
                                          │ TLS :443
                                          ▼
                                   ┌──────────────┐
                                   │   Nginx      │  ← INF-13
                                   │ (HSTS, OCSP) │
                                   └──────┬───────┘
                                          │ HTTP 10.0.0.1:8546
                                          ▼
                       ┌──────────────────────────────────────┐
                       │           WireGuard mesh             │  ← INF-12
                       │  10.0.0.1 hub  ↔  10.0.0.X peers     │
                       └──────────────────────────────────────┘
                                          │
                          ┌───────────────┼────────────────┐
                          ▼               ▼                ▼
                     validator        fullnode          indexer
                     (10.0.0.2)      (10.0.0.3)       (10.0.0.4)
```

After both steps the public surface is **only**:
- `:443` (Nginx, TLS-terminated)
- `:51820/udp` (WireGuard handshake)
- `:30303` P2P discovery (optional — can also be moved inside WG)

Everything else (`8546`, `8547`, `5432`, `9090`) stays on `10.0.0.0/24`.
