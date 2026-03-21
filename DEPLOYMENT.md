# GYDSchain Deployment Guide

This guide covers deploying the full GYDSchain stack — blockchain nodes and the ChainCore dashboard — to production.

---

## Architecture Overview

```
                    ┌─────────────────────────────────────┐
                    │           netlifegy.com               │
                    │  Nginx  ──  ChainCore Dashboard SPA   │
                    └──────────────────┬──────────────────-┘
                                       │ Supabase (Auth + DB)
               ┌───────────────────────┼───────────────────────┐
               │                       │                        │
         Validator Node          RPC Node(s)          Indexer DB
         (port 8546)            (8549, 8550)          (Postgres)
               │
          Fullnode(s)
         (port 8547)
```

The dashboard is a **pure frontend SPA** — it talks directly to Supabase and to public RPC endpoints. No backend server is needed for the dashboard.

---

## Prerequisites

- Ubuntu 22.04 LTS server(s)
- Docker Engine 24+ and Docker Compose v2 (`docker compose`)
- Domain DNS pointing to your server (`netlifegy.com`, `rpc.netlifegy.com`, etc.)
- A Supabase project (free tier works)
- The `blockchain-go/` Go source code in the project root (required for node Docker images)

---

## 1. Deploy the Dashboard Only

Use this when you only want to deploy the frontend dashboard (no local blockchain node).

```bash
# Set required variables
export DOMAIN=netlifegy.com
export GYDS_SSL_EMAIL=admin@netlifegy.com
export VITE_SUPABASE_URL=https://your-project.supabase.co
export VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
export VITE_SUPABASE_PROJECT_ID=your-project-id

# Run as root
sudo -E bash public/scripts/deploy-dashboard.sh
```

This will:
1. Install Node.js and Nginx
2. Clone the repo and build the SPA
3. Configure Nginx to serve it
4. Obtain a Let's Encrypt SSL certificate

---

## 2. Deploy the Full Blockchain Stack

### Step 1: Prepare environment file

```bash
cp public/scripts/.env.production.template .env.production
# Edit .env.production and fill in all values
nano .env.production
```

Key values to set:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID`
- `POSTGRES_PASSWORD` — generate with `openssl rand -hex 32`
- `INDEXER_DB_PASSWORD` — generate with `openssl rand -hex 16`
- `GYDS_SSL_EMAIL`

### Step 2: Generate validator key (first run only)

```bash
mkdir -p public/docker/validator-key
openssl rand -hex 32 > public/docker/validator-key/validator.key
chmod 600 public/docker/validator-key/validator.key
```

### Step 3: Start the stack

```bash
docker compose -f public/docker/docker-compose.prod.yml --env-file .env.production up -d
```

### Step 4: Verify health

```bash
# Check all containers are running
docker compose -f public/docker/docker-compose.prod.yml ps

# Check validator node health
curl http://localhost:8546/health

# Check explorer
curl http://localhost:3000/health
```

---

## 3. Deploy Individual Nodes (Remote Servers)

```bash
# Deploy a fullnode to a remote server interactively
bash public/scripts/deploy-remote-fullnode.sh
```

Or install directly on a server:

```bash
# On the target server (Ubuntu 22.04, as root):
bash install-fullnode.sh    # Founder/validator node
bash install-litenode.sh    # Lite node (public access)
bash install-node.sh fullnode  # Generic installer
```

---

## 4. SSL Certificate Setup

If you need to set up SSL on an existing server:

```bash
export GYDS_SSL_EMAIL=admin@netlifegy.com
sudo -E bash public/scripts/ssl-setup.sh
```

This validates DNS records and requests certificates for all GYDSchain subdomains.

---

## 5. Database Schema Setup

To set up or reset the indexer database schema:

```bash
# Requires SUPABASE_DB_URL in environment or interactive input
bash public/scripts/setup-gydschain.sh
```

The schema file is at `public/scripts/gydschain-schema.sql` (mirrors `public/docker/init-indexer.sql`).

---

## Network Endpoints

| Endpoint | Purpose |
|---|---|
| `https://netlifegy.com` | ChainCore Dashboard |
| `https://rpc.netlifegy.com` | Primary RPC |
| `https://rpc2.netlifegy.com` | Backup RPC #1 |
| `https://rpc3.netlifegy.com` | Backup RPC #2 |
| `wss://ws.netlifegy.com` | WebSocket |
| `https://explorer.netlifegy.com` | Block Explorer |
| `https://vpn.netlifegy.com` | WireGuard VPN |
| `https://testnet-rpc.netlifegy.com` | Testnet RPC |

Chain ID: **13370**

---

## Monitoring & Logs

```bash
# View all container logs
docker compose -f public/docker/docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f public/docker/docker-compose.prod.yml logs -f validator

# Check systemd service (bare-metal install)
journalctl -u gyds-fullnode -f

# Check Fail2Ban status
fail2ban-client status
```

---

## Updating

```bash
# Pull latest code
git pull

# Rebuild and restart explorer
docker compose -f public/docker/docker-compose.prod.yml up -d --build explorer

# Rebuild all (triggers node restart — use with care on mainnet)
docker compose -f public/docker/docker-compose.prod.yml up -d --build
```
