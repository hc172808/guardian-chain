#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
#  GYDSchain SSL/TLS Setup Script
#  Automated Let's Encrypt certificate provisioning for netlifegy.com
#═══════════════════════════════════════════════════════════════════════════════

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
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║           GYDSchain SSL/TLS Certificate Setup                         ║"
echo "║                   Let's Encrypt Automation                            ║"
echo "║                     netlifegy.com                                     ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Installing Certbot...${NC}"
    apt update
    apt install -y certbot python3-certbot-nginx
fi

# Build domain list
DOMAIN_ARGS="-d $DOMAIN"
for sub in "${SUBDOMAINS[@]}"; do
    DOMAIN_ARGS="$DOMAIN_ARGS -d $sub.$DOMAIN"
done

echo -e "${CYAN}Domains to certify:${NC}"
echo "  - $DOMAIN"
for sub in "${SUBDOMAINS[@]}"; do
    echo "  - $sub.$DOMAIN"
done
echo ""
echo -e "${CYAN}Service Mapping:${NC}"
echo "  rpc.netlifegy.com          - Main RPC endpoint"
echo "  rpc2.netlifegy.com         - Backup RPC #1"
echo "  rpc3.netlifegy.com         - Backup RPC #2"
echo "  ws.netlifegy.com           - WebSocket endpoint"
echo "  explorer.netlifegy.com     - Block explorer"
echo "  vpn.netlifegy.com          - WireGuard VPN server"
echo "  testnet-rpc.netlifegy.com  - Testnet RPC"
echo ""

# Check if nginx is running
NGINX_RUNNING=false
if systemctl is-active --quiet nginx; then
    NGINX_RUNNING=true
fi

# Choose method based on nginx status
if $NGINX_RUNNING; then
    echo -e "${GREEN}[1/3]${NC} Obtaining certificates via Nginx..."
    certbot --nginx $DOMAIN_ARGS \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --redirect \
        --hsts \
        --staple-ocsp
else
    echo -e "${GREEN}[1/3]${NC} Obtaining certificates via standalone..."
    
    # Stop anything on port 80
    fuser -k 80/tcp 2>/dev/null || true
    
    certbot certonly --standalone $DOMAIN_ARGS \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL"
fi

echo -e "${GREEN}[2/3]${NC} Setting up auto-renewal..."

# Create renewal hook
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
systemctl reload nginx 2>/dev/null || true
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# Test renewal
echo -e "${GREEN}[3/3]${NC} Testing certificate renewal..."
certbot renew --dry-run

# Verify certificates
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              SSL/TLS SETUP COMPLETE!                                   ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Certificate Information:${NC}"
certbot certificates
echo ""
echo -e "${CYAN}Certificate Locations:${NC}"
echo "  Certificate: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "  Private Key: /etc/letsencrypt/live/$DOMAIN/privkey.pem"
echo ""
echo -e "${CYAN}Auto-renewal:${NC}"
echo "  Certbot timer is enabled and will renew certificates automatically."
echo "  Test with: certbot renew --dry-run"
echo ""
echo -e "${CYAN}Nginx SSL Configuration (add to server blocks):${NC}"
echo ""
echo "    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;"
echo "    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;"
echo "    ssl_protocols TLSv1.2 TLSv1.3;"
echo "    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;"
echo "    ssl_prefer_server_ciphers off;"
echo "    add_header Strict-Transport-Security \"max-age=63072000\" always;"
echo ""
