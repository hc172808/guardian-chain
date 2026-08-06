# GYDSchain Network - DNS & Server Setup Guide

Complete guide for deploying the GYDSchain blockchain network infrastructure on `netlifegy.com`.

## 📋 Prerequisites

- Domain: `netlifegy.com` (registered and accessible)
- VPS/Server: Ubuntu 22.04 LTS with minimum 4GB RAM, 100GB SSD
- Root/sudo access to the server
- Public static IP address

---

## 🌐 DNS Configuration

### Required DNS Records

Add the following DNS records at your domain registrar (Cloudflare, Namecheap, GoDaddy, etc.):

| Type | Name | Value | TTL | Purpose |
|------|------|-------|-----|---------|
| A | @ | `YOUR_SERVER_IP` | 3600 | Root domain |
| A | www | `YOUR_SERVER_IP` | 3600 | WWW subdomain |
| A | rpc | `YOUR_SERVER_IP` | 3600 | RPC endpoint for blockchain |
| A | explorer | `YOUR_SERVER_IP` | 3600 | Block explorer |
| A | vpn | `YOUR_SERVER_IP` | 3600 | WireGuard VPN endpoint |
| A | api | `YOUR_SERVER_IP` | 3600 | REST API (optional) |
| A | ws | `YOUR_SERVER_IP` | 3600 | WebSocket endpoint |
| TXT | _dmarc | `v=DMARC1; p=reject;` | 3600 | Email security |

### Example with Cloudflare

```bash
# Using Cloudflare API (replace with your values)
curl -X POST "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/dns_records" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "rpc",
    "content": "YOUR_SERVER_IP",
    "ttl": 3600,
    "proxied": false
  }'
```

### Verify DNS Propagation

```bash
# Check all records
dig +short netlifegy.com
dig +short rpc.netlifegy.com
dig +short explorer.netlifegy.com
dig +short vpn.netlifegy.com

# Or use online tools
# https://dnschecker.org
# https://mxtoolbox.com/DNSLookup.aspx
```

---

## 🖥️ Server Initial Setup

### 1. Update System

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential ufw fail2ban
```

### 2. Configure Firewall (UFW)

```bash
# Reset and configure UFW
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH (change port if using non-standard)
sudo ufw allow 22/tcp

# HTTP/HTTPS for web services
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Blockchain P2P
sudo ufw allow 8545/tcp

# RPC (internal only - proxied through nginx)
# sudo ufw allow 8546/tcp

# WireGuard VPN
sudo ufw allow 51820/udp

# WebSocket
sudo ufw allow 8547/tcp

# Enable firewall
sudo ufw enable
sudo ufw status verbose
```

### 3. Configure Fail2Ban

```bash
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```

Add these settings:
```ini
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 600
```

```bash
sudo systemctl restart fail2ban
sudo systemctl enable fail2ban
```

### 4. Create Service User

```bash
sudo useradd -r -s /bin/false chaincore
sudo mkdir -p /var/lib/chaincore
sudo chown chaincore:chaincore /var/lib/chaincore
```

---

## 🔒 SSL/TLS with Let's Encrypt

### Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Obtain Certificates

```bash
# Stop nginx temporarily if running
sudo systemctl stop nginx 2>/dev/null || true

# Get certificates for all domains
sudo certbot certonly --standalone \
  -d netlifegy.com \
  -d www.netlifegy.com \
  -d rpc.netlifegy.com \
  -d explorer.netlifegy.com \
  -d vpn.netlifegy.com \
  -d api.netlifegy.com \
  --non-interactive \
  --agree-tos \
  --email admin@netlifegy.com
```

### Alternative: With Nginx Running

```bash
sudo certbot --nginx \
  -d netlifegy.com \
  -d www.netlifegy.com \
  -d rpc.netlifegy.com \
  -d explorer.netlifegy.com \
  -d vpn.netlifegy.com \
  --non-interactive \
  --agree-tos \
  --email admin@netlifegy.com
```

### Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Cron is auto-configured, but verify:
sudo systemctl status certbot.timer
```

---

## 🌍 Nginx Reverse Proxy Configuration

### Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### Main Configuration

Create `/etc/nginx/sites-available/netlifegy.com`:

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=rpc_limit:10m rate=100r/s;
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=50r/s;
limit_conn_zone $binary_remote_addr zone=ws_conn:10m;

# Upstream definitions
upstream blockchain_rpc {
    server 127.0.0.1:8546;
    keepalive 32;
}

upstream blockchain_ws {
    server 127.0.0.1:8547;
    keepalive 32;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name netlifegy.com www.netlifegy.com rpc.netlifegy.com explorer.netlifegy.com api.netlifegy.com;
    return 301 https://$server_name$request_uri;
}

# Main website
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name netlifegy.com www.netlifegy.com;

    ssl_certificate /etc/letsencrypt/live/netlifegy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/netlifegy.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /var/www/netlifegy.com;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://blockchain_rpc/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# RPC endpoint
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name rpc.netlifegy.com;

    ssl_certificate /etc/letsencrypt/live/netlifegy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/netlifegy.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;

    location / {
        limit_req zone=rpc_limit burst=50 nodelay;
        
        # Handle CORS preflight
        if ($request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin "*";
            add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
            add_header Access-Control-Allow-Headers "Content-Type, Authorization";
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }

        proxy_pass http://blockchain_rpc;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket endpoint
    location /ws {
        limit_conn ws_conn 100;
        
        proxy_pass http://blockchain_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}

# Block Explorer
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name explorer.netlifegy.com;

    ssl_certificate /etc/letsencrypt/live/netlifegy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/netlifegy.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=63072000" always;

    root /var/www/explorer.netlifegy.com;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://blockchain_rpc/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Enable Configuration

```bash
sudo ln -sf /etc/nginx/sites-available/netlifegy.com /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔐 WireGuard VPN Setup

### Install WireGuard

```bash
sudo apt install -y wireguard wireguard-tools
```

### Generate Server Keys

```bash
cd /etc/wireguard
umask 077
wg genkey | tee server_private.key | wg pubkey > server_public.key
```

### Server Configuration

Create `/etc/wireguard/wg0.conf`:

```ini
[Interface]
Address = 10.13.37.1/24
ListenPort = 51820
PrivateKey = YOUR_SERVER_PRIVATE_KEY
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
SaveConfig = true

# Lite Node 1
# [Peer]
# PublicKey = CLIENT_PUBLIC_KEY
# AllowedIPs = 10.13.37.2/32
```

### Enable IP Forwarding

```bash
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Start WireGuard

```bash
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
sudo wg show
```

---

## ⛓️ Blockchain Node Deployment

### Install Full Node

```bash
# Download and run installer
curl -fsSL https://netlifegy.com/scripts/install-fullnode.sh | sudo bash
```

### Configure Full Node

Edit `/etc/chaincore/node.env`:

```bash
# Full Node Configuration
NODE_TYPE=fullnode
CHAIN_ID=198282
DATA_DIR=/var/lib/chaincore
RPC_PORT=8546
P2P_PORT=8545
WS_PORT=8547
STORAGE_SIZE=100
MAX_PEERS=50

# Founder mode (for genesis node)
FOUNDER_MODE=true
VALIDATOR_KEY=/etc/chaincore/validator.key

# Network
PUBLIC_RPC=https://rpc.netlifegy.com
PUBLIC_WS=wss://rpc.netlifegy.com/ws
EXPLORER_URL=https://explorer.netlifegy.com
```

### Start Node

```bash
sudo systemctl start chaincore-fullnode
sudo systemctl enable chaincore-fullnode

# Check logs
sudo journalctl -u chaincore-fullnode -f
```

---

## 📊 Monitoring Setup

### Install Prometheus & Grafana

```bash
# Add Grafana repo
sudo apt install -y apt-transport-https software-properties-common
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
echo "deb https://packages.grafana.com/oss/deb stable main" | sudo tee /etc/apt/sources.list.d/grafana.list

# Install
sudo apt update
sudo apt install -y prometheus grafana

# Enable services
sudo systemctl enable prometheus grafana-server
sudo systemctl start prometheus grafana-server
```

### Grafana Access

- URL: `http://YOUR_SERVER_IP:3000`
- Default credentials: `admin` / `admin`

---

## ✅ Verification Checklist

```bash
# 1. Check DNS resolution
dig +short rpc.netlifegy.com

# 2. Test SSL certificates
curl -vI https://rpc.netlifegy.com 2>&1 | grep -i "SSL certificate"

# 3. Test RPC endpoint
curl -X POST https://rpc.netlifegy.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

# 4. Check WireGuard
sudo wg show

# 5. Check node status
sudo systemctl status chaincore-fullnode

# 6. Check all services
sudo systemctl status nginx
sudo systemctl status wg-quick@wg0
```

---

## 🆘 Troubleshooting

### SSL Issues
```bash
# Force renew certificates
sudo certbot renew --force-renewal

# Check certificate expiry
sudo certbot certificates
```

### Nginx Issues
```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log
```

### Node Issues
```bash
# Check node logs
sudo journalctl -u chaincore-fullnode -f --no-pager -n 100

# Restart node
sudo systemctl restart chaincore-fullnode
```

### WireGuard Issues
```bash
# Check interface
sudo wg show

# Restart WireGuard
sudo systemctl restart wg-quick@wg0

# Check logs
sudo journalctl -u wg-quick@wg0
```

---

## 📝 Quick Reference

| Service | URL | Port |
|---------|-----|------|
| Main Site | https://netlifegy.com | 443 |
| RPC Endpoint | https://rpc.netlifegy.com | 443 |
| WebSocket | wss://rpc.netlifegy.com/ws | 443 |
| Block Explorer | https://explorer.netlifegy.com | 443 |
| VPN | vpn.netlifegy.com | 51820/UDP |
| P2P Network | netlifegy.com | 8545 |

---

**Last Updated:** 2024
**Network:** GYDSchain Mainnet (Chain ID: 198282)
