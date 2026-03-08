#!/bin/bash
# GydsChain SSL/TLS Certificate Setup v2.0
# Automated Let's Encrypt provisioning for netlifegy.com
# Includes: DNS validation, HSTS, OCSP stapling, auto-renewal
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

# ─── Step 1: Install dependencies ────────────────────────────
echo -e "${GREEN}[1/5]${NC} Installing dependencies..."
if ! command -v certbot &> /dev/null; then
    apt-get update -qq
    apt-get install -y -qq certbot python3-certbot-nginx
fi
if ! command -v dig &> /dev/null; then
    apt-get install -y -qq dnsutils
fi

# ─── Step 2: DNS Record Validation ──────────────────────────
echo -e "${GREEN}[2/5]${NC} Validating DNS records..."

SERVER_IP=$(curl -sf https://api.ipify.org || curl -sf https://ifconfig.me || hostname -I | awk '{print $1}')
echo -e "  Server public IP: ${CYAN}${SERVER_IP}${NC}"

DNS_ERRORS=0
DNS_WARNINGS=0

validate_dns() {
    local fqdn="$1"
    local expected_ip="$2"

    # Resolve A record
    local resolved_ip
    resolved_ip=$(dig +short A "$fqdn" 2>/dev/null | head -n1)

    if [[ -z "$resolved_ip" ]]; then
        echo -e "  ${RED}✗ ${fqdn}${NC} — No A record found"
        ((DNS_ERRORS++))
        return 1
    elif [[ "$resolved_ip" != "$expected_ip" ]]; then
        echo -e "  ${YELLOW}⚠ ${fqdn}${NC} → ${resolved_ip} (expected ${expected_ip})"
        ((DNS_WARNINGS++))
        return 0
    else
        echo -e "  ${GREEN}✓ ${fqdn}${NC} → ${resolved_ip}"
        return 0
    fi
}

# Check CAA records (must allow letsencrypt.org)
check_caa() {
    local domain="$1"
    local caa_records
    caa_records=$(dig +short CAA "$domain" 2>/dev/null)

    if [[ -n "$caa_records" ]]; then
        if echo "$caa_records" | grep -qi "letsencrypt.org"; then
            echo -e "  ${GREEN}✓ CAA${NC} — letsencrypt.org is allowed"
        else
            echo -e "  ${RED}✗ CAA${NC} — letsencrypt.org NOT in CAA records. Add: 0 issue \"letsencrypt.org\""
            ((DNS_ERRORS++))
        fi
    else
        echo -e "  ${GREEN}✓ CAA${NC} — No CAA records (all CAs allowed)"
    fi
}

echo ""
echo -e "${CYAN}Checking root domain:${NC}"
validate_dns "$DOMAIN" "$SERVER_IP"

echo ""
echo -e "${CYAN}Checking subdomains:${NC}"
for sub in "${SUBDOMAINS[@]}"; do
    validate_dns "${sub}.${DOMAIN}" "$SERVER_IP"
done

echo ""
echo -e "${CYAN}Checking CAA records:${NC}"
check_caa "$DOMAIN"

# Check for conflicting AAAA records
echo ""
echo -e "${CYAN}Checking for conflicting records:${NC}"
AAAA_ROOT=$(dig +short AAAA "$DOMAIN" 2>/dev/null)
if [[ -n "$AAAA_ROOT" ]]; then
    echo -e "  ${YELLOW}⚠ ${DOMAIN}${NC} has AAAA record: ${AAAA_ROOT} — ensure IPv6 also points to this server"
    ((DNS_WARNINGS++))
else
    echo -e "  ${GREEN}✓${NC} No conflicting AAAA records"
fi

echo ""
echo "───────────────────────────────────────────────────────────"
echo -e "  DNS Errors:   ${DNS_ERRORS}"
echo -e "  DNS Warnings: ${DNS_WARNINGS}"
echo "───────────────────────────────────────────────────────────"

if [[ $DNS_ERRORS -gt 0 ]]; then
    echo ""
    echo -e "${RED}❌ DNS validation failed with ${DNS_ERRORS} error(s).${NC}"
    echo -e "${YELLOW}Fix the DNS records above before requesting certificates.${NC}"
    echo ""
    echo -e "${CYAN}Required DNS records (add at your registrar):${NC}"
    echo -e "  A    @              → ${SERVER_IP}"
    for sub in "${SUBDOMAINS[@]}"; do
        echo -e "  A    ${sub}    → ${SERVER_IP}"
    done
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

if [[ $DNS_WARNINGS -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}⚠ ${DNS_WARNINGS} warning(s). Some records may point elsewhere.${NC}"
    read -p "Continue? (y/n) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

echo ""
echo -e "${GREEN}✅ DNS validation passed!${NC}"

# ─── Step 3: Build domain list and obtain certificates ───────
echo -e "${GREEN}[3/5]${NC} Obtaining certificates..."
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

# ─── Step 4: Setup auto-renewal ──────────────────────────────
echo -e "${GREEN}[4/5]${NC} Configuring auto-renewal..."
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-services.sh << 'EOF'
#!/bin/bash
systemctl reload nginx 2>/dev/null || true
echo "[$(date)] SSL certificates renewed and nginx reloaded" >> /var/log/gydschain/ssl-renewal.log
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-services.sh

# ─── Step 5: Test renewal ────────────────────────────────────
echo -e "${GREEN}[5/5]${NC} Testing renewal..."
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
