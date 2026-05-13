#!/bin/bash

set -e

echo "🚀 Starting FULL Guardian Chain deployment..."

# --- VARIABLES ---
APP_DIR="/opt/guardian-chain"
REPO_URL="https://github.com/hc172808/guardian-chain.git"
DOMAIN="your-domain.com"   # <-- CHANGE THIS
NODE_USER="$USER"

# --- UPDATE SYSTEM ---
sudo apt update && sudo apt upgrade -y

# --- INSTALL DEPENDENCIES ---
echo "🔧 Installing dependencies..."
sudo apt install -y git curl build-essential nginx certbot python3-certbot-nginx ufw docker.io docker-compose

# Enable Docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $NODE_USER

# Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# --- CLONE REPO ---
echo "📥 Cloning repo..."
sudo rm -rf $APP_DIR
sudo git clone $REPO_URL $APP_DIR
sudo chown -R $NODE_USER:$NODE_USER $APP_DIR
cd $APP_DIR

# --- ENV SETUP ---
if [ ! -f .env ]; then
cat <<EOT > .env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
NODE_ENV=production
EOT
fi

# --- FRONTEND BUILD ---
echo "🏗️ Building frontend..."
npm install
npm run build

# --- BACKEND (DOCKER) ---
echo "🐳 Starting blockchain backend..."

if [ -f "docker/docker-compose.yml" ]; then
    cd docker
    docker-compose up -d
    cd ..
else
    echo "⚠️ No docker-compose.yml found, skipping backend container setup"
fi

# --- FIREWALL ---
echo "🔥 Setting up firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# --- NGINX CONFIG ---
NGINX_FILE="/etc/nginx/sites-available/guardian-chain"

echo "⚙️ Configuring Nginx..."
sudo tee $NGINX_FILE > /dev/null <<EOT
server {
    listen 80;
    server_name $DOMAIN;

    root $APP_DIR/dist;
    index index.html;

    location / {
        try_files \$uri /index.html;
    }

    # Optional: proxy backend if needed
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOT

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf $NGINX_FILE /etc/nginx/sites-enabled/

sudo nginx -t
sudo systemctl restart nginx

# --- SSL ---
echo "🔐 Setting up HTTPS..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN

# --- SYSTEMD SERVICE (AUTO DEPLOY) ---
SERVICE_FILE="/etc/systemd/system/guardian-chain.service"

echo "⚙️ Creating auto-deploy service..."
sudo tee $SERVICE_FILE > /dev/null <<EOT
[Unit]
Description=Guardian Chain Auto Deploy
After=network.target docker.service

[Service]
Type=oneshot
User=$NODE_USER
WorkingDirectory=$APP_DIR
ExecStart=/bin/bash -c 'git pull && npm install && npm run build && cd docker && docker-compose up -d'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOT

sudo systemctl daemon-reload
sudo systemctl enable guardian-chain
sudo systemctl start guardian-chain

echo "✅ FULL deployment complete!"
echo "🌐 Your app: https://$DOMAIN"
echo "🐳 Backend running via Docker"
echo "🔁 Auto-deploy enabled on reboot"
