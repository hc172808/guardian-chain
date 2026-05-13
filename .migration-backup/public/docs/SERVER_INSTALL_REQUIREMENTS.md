# GYDS / ChainCore — Server Install Requirements

> Hand this list to your server admin (or paste into Replit / a second AI dev like
> the one you're using alongside Lovable). It covers everything you need to install
> on a fresh Ubuntu 22.04 VPS to run the **frontend (CloudPanel)** + **node stack**
> (fullnode, litenode, RPC, explorer, indexer).

---

## 0. Base OS

- **Ubuntu 22.04 LTS** (recommended) or 24.04
- Min specs per role:
  - Frontend / CloudPanel: 2 vCPU, 4 GB RAM, 40 GB SSD
  - Fullnode: 4 vCPU, 8 GB RAM, 200 GB SSD
  - RPC / Indexer: 4 vCPU, 8 GB RAM, 100 GB SSD
  - Litenode: 1 vCPU, 1 GB RAM, 20 GB SSD

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install curl wget git unzip jq build-essential ca-certificates ufw
```

---

## 1. Frontend host (CloudPanel)

CloudPanel ships its own Nginx + PHP + Node + MariaDB. After install, create a
**Node.js site** (or **Static site** if you only deploy the built `dist/`).

```bash
# CloudPanel installer (official)
curl -sS https://installer.cloudpanel.io/ce/v2/install.sh -o install.sh
sudo bash install.sh
```

Then in CloudPanel UI → **Sites → Add Site → Node.js**:
- Domain: `app.netlifegy.com`
- Node version: 20 LTS
- App root: `/home/<site-user>/htdocs/app.netlifegy.com`

Build & upload (from your dev machine):
```bash
bun install   # or npm ci
bun run build # produces dist/
scp -r dist/* <site-user>@server:/home/<site-user>/htdocs/app.netlifegy.com/
```

If you serve as **Static site** instead, point the document root at the uploaded
`dist/` and CloudPanel will issue Let's Encrypt SSL automatically.

### Required env on the frontend
The Vite build bakes these in at build time — set them on the **build machine**, not the server:
```
VITE_SUPABASE_URL=https://rmwldjwkyhhaoqehdrbr.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key from Lovable Cloud settings>
VITE_SUPABASE_PROJECT_ID=rmwldjwkyhhaoqehdrbr
VITE_GYDS_RPC_LAN=https://rpc.netlifegy.com   # optional; private RPC override
```

---

## 2. Go toolchain (only on hosts that build/run the node)

```bash
GO_VERSION=1.22.5
wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee /etc/profile.d/go.sh
source /etc/profile.d/go.sh
go version  # → go version go1.22.5 linux/amd64
```

Build the node binaries:
```bash
cd /opt && sudo git clone <your-repo> chaincore && cd chaincore/public/blockchain-go
sudo /usr/local/go/bin/go build -o /usr/local/bin/gyds-fullnode ./cmd/fullnode
sudo /usr/local/go/bin/go build -o /usr/local/bin/gyds-litenode ./cmd/litenode
```

---

## 3. Database (only on the indexer / explorer host)

```bash
sudo apt -y install postgresql-15 postgresql-contrib-15
sudo -u postgres createuser -P gydsindex
sudo -u postgres createdb -O gydsindex gydschain
psql -U gydsindex -d gydschain -h localhost -f \
  /opt/chaincore/public/scripts/gydschain-schema.sql
```

The Supabase backend itself is **managed by Lovable Cloud** — you do **not** need
to install Supabase on your server. You only run Postgres locally if you also want
a self-hosted indexer (see `infra/supabase-selfhost/` for the optional self-host stack).

---

## 4. Docker (only if you run the explorer / indexer / RPC stack)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo apt -y install docker-compose-plugin
docker compose version
```

Then:
```bash
cd /opt/chaincore/public/docker
sudo cp .env.example .env   # edit secrets
sudo docker compose -f docker-compose.prod.yml up -d
```

---

## 5. Networking & security

```bash
# Firewall (script provided)
sudo bash /opt/chaincore/public/systemd/gyds-ufw.sh

# Fail2ban
sudo apt -y install fail2ban
sudo cp /opt/chaincore/public/systemd/gydschain-fail2ban.conf \
        /etc/fail2ban/jail.d/gydschain.conf
sudo systemctl enable --now fail2ban

# WireGuard (private node-to-node mesh)
sudo apt -y install wireguard
sudo cp /opt/chaincore/public/scripts/wireguard-config.template /etc/wireguard/wg0.conf
sudo systemctl enable --now wg-quick@wg0
```

Open ports per role:

| Role | Ports |
|------|-------|
| Frontend (CloudPanel) | 80, 443, 8443 (CP UI), 22 |
| Fullnode | 30303 tcp+udp (P2P), 8546 (RPC, behind nginx) |
| Bootnode | 30301 udp |
| RPC | 8547 (behind nginx + auth) |
| Mesh | 51820 udp (WireGuard) |

---

## 6. SSL / domain

CloudPanel issues Let's Encrypt certs automatically per site. For node hosts that
**don't** run CloudPanel, use the bundled script:

```bash
sudo bash /opt/chaincore/public/scripts/ssl-setup.sh
```

It issues a SAN cert across `netlifegy.com` + 9 subdomains (rpc, ws, indexer,
explorer, app, api, docs, bootnode, validator). HSTS + OCSP stapling + auto-renew
included.

---

## 7. Systemd services

```bash
sudo cp /opt/chaincore/public/systemd/gyds-*.service /etc/systemd/system/
sudo cp /opt/chaincore/public/scripts/node.env.template /opt/guardian-chain/node.env
# Edit /opt/guardian-chain/node.env — set FOUNDER_WALLET, BOOTNODE_ENODE, etc.
sudo systemctl daemon-reload
sudo systemctl enable --now gyds-fullnode   # or gyds-litenode
journalctl -u gyds-fullnode -f
```

---

## 8. Bootnode auto-discovery

Lite nodes / new fullnodes can fetch the active bootnode list at boot:
```bash
curl -s https://rmwldjwkyhhaoqehdrbr.functions.supabase.co/bootnodes?network=mainnet \
  | jq -r '.bootnodes[]'
```
This endpoint is public (`verify_jwt=false`) and edge-cached for 60 s.

---

## 9. Monitoring (optional but recommended)

```bash
sudo apt -y install prometheus-node-exporter
# Frontend: CloudPanel already exposes its own metrics on the CP UI.
```

---

## 10. Quick checklist

- [ ] Ubuntu 22.04 + base packages
- [ ] CloudPanel installed on frontend host
- [ ] DNS A-records for `app.netlifegy.com`, `rpc.netlifegy.com`, etc.
- [ ] Go 1.22+ on node hosts
- [ ] Postgres 15 on indexer host (or use managed)
- [ ] Docker on RPC/explorer host
- [ ] UFW + Fail2ban + WireGuard configured
- [ ] SSL certs issued (CloudPanel auto OR `ssl-setup.sh`)
- [ ] Systemd unit files copied + enabled
- [ ] `node.env` populated with real values
- [ ] Frontend `dist/` uploaded to CloudPanel site
- [ ] Smoke test: `curl https://app.netlifegy.com` returns the SPA shell
- [ ] Smoke test: `curl https://rpc.netlifegy.com` returns the RPC banner

---

## What to share with another AI dev (Replit etc.)

The whole repo is portable. To brief a second AI assistant, paste:

1. This file (`SERVER_INSTALL_REQUIREMENTS.md`)
2. `TODO.md` (full task ledger with statuses)
3. `DEVELOPMENT_LOG.md` (chronological change history)
4. `public/docs/SECURE_NODE_DEPLOYMENT.md` (WireGuard + SSL recipe)

That's enough for a second agent to understand the architecture and pick up work
without breaking what's already shipped.
