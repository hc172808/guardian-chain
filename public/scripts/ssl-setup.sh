#!/bin/bash
# GydsChain SSL/TLS Certificate Setup v2.0
# Automated Let's Encrypt provisioning for netlifegy.com
# Includes: HSTS, OCSP stapling, auto-renewal
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
DOMAIN="${DOMAIN:-netlifegy.com}"
EMAIL="${EMAIL:-admin@netlifegy.com}"
SUBDOMAINS=("www" "rpc" "rpc2" "rpc3" "explorer" "vpn" "api" "ws" "testnet-rpc")

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     GydsChain SSL/TLS Setup v2.0                          ║"
echo "║     Let's Encrypt | netlifegy.com                         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: Run as root (sudo bash ssl-setup.sh)${NC}"
   exit 1
fi

# ─── Step 1: Install Certbot ─────────────────────────────────
echo -e "${GREEN}[1/4]${NC} Installing Certbot..."
if ! command -v certbot &> /dev/null; then
    apt-get update -qq
    apt-get install -y -qq certbot python3-certbot-nginx
fi

# ─── Step 2: Build domain list and obtain certificates ───────
echo -e "${GREEN}[2/4]${NC} Obtaining certificates..."
DOMAIN_ARGS="-d $DOMAIN"
for sub in "${SUBDOMAINS[@]}"; do
    DOMAIN_ARGS="$DOMAIN_ARGS -d $sub.$DOMAIN"
done

echo -e "${CYAN}Domains:${NC}"
echo "  - $DOMAIN"
for sub in "${SUBDOMAINS[@]}"; do
    echo "  - $sub.$DOMAIN"
done
echo ""

NGINX_RUNNING=false
if systemctl is-active --quiet nginx; then
    NGINX_RUNNING=true
fi

if $NGINX_RUNNING; then
    certbot --nginx $DOMAIN_ARGS \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --redirect \
        --hsts \
        --staple-ocsp
else
    fuser -k 80/tcp 2>/dev/null || true
    certbot certonly --standalone $DOMAIN_ARGS \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL"
fi

# ─── Step 3: Setup auto-renewal ──────────────────────────────
echo -e "${GREEN}[3/4]${NC} Configuring auto-renewal..."
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-services.sh << 'EOF'
#!/bin/bash
systemctl reload nginx 2>/dev/null || true
echo "[$(date)] SSL certificates renewed and nginx reloaded" >> /var/log/gydschain/ssl-renewal.log
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-services.sh

# ─── Step 4: Test renewal ────────────────────────────────────
echo -e "${GREEN}[4/4]${NC} Testing renewal..."
certbot renew --dry-run

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ SSL/TLS setup complete!                                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Certificate Info:${NC}"
certbot certificates
echo ""
echo -e "${CYAN}Locations:${NC}"
echo "  Certificate: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "  Private Key: /etc/letsencrypt/live/$DOMAIN/privkey.pem"
echo ""
echo -e "${CYAN}Nginx SSL (add to server blocks):${NC}"
echo "    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;"
echo "    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;"
echo "    ssl_protocols TLSv1.2 TLSv1.3;"
echo "    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;"
echo "    ssl_prefer_server_ciphers off;"
echo "    add_header Strict-Transport-Security \"max-age=63072000\" always;"
echo ""
echo -e "${CYAN}Service Endpoints (SSL):${NC}"
echo "  https://rpc.netlifegy.com          - Main RPC"
echo "  https://rpc2.netlifegy.com         - Backup RPC #1"
echo "  https://rpc3.netlifegy.com         - Backup RPC #2"
echo "  wss://ws.netlifegy.com             - WebSocket"
echo "  https://explorer.netlifegy.com     - Block Explorer"
echo "  https://testnet-rpc.netlifegy.com  - Testnet RPC"
echo ""
echo -e "${CYAN}Auto-renewal:${NC}"
echo "  Certbot timer is enabled. Test: certbot renew --dry-run"
