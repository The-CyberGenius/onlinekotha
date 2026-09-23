#!/bin/bash
# ===================================================================
# OnlineKotha EC2 Setup Script (Ubuntu 22.04 / 24.04)
# Run this script on your EC2 instance to prepare the environment.
# ===================================================================

set -e # Exit immediately if a command exits with a non-zero status

echo "==> Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

echo "==> Installing prerequisite packages (git, curl, nginx, build-essential)..."
sudo apt-get install -y curl git nginx build-essential ufw

echo "==> Installing Node.js (v20 LTS)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> Installing PM2 globally..."
sudo npm install -g pm2

echo "==> Setting up Nginx..."
# We will remove the default Nginx config and wait for you to link the new one.
sudo rm -f /etc/nginx/sites-enabled/default

echo "==> Setting up UFW Firewall..."
# Allow Nginx (Port 80/443) and SSH (Port 22)
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw --force enable

echo ""
echo "==================================================================="
echo "✅ Prerequisites installed successfully!"
echo "Node Version: $(node -v)"
echo "NPM Version: $(npm -v)"
echo "PM2 Version: $(pm2 -v)"
echo ""
echo "Next Steps:"
echo "1. Upload your codebase to a directory (e.g., /home/ubuntu/onlinekotha)"
echo "2. cd /home/ubuntu/onlinekotha"
echo "3. Run: npm install"
echo "4. Copy your local .env file to the server."
echo "5. Create the logs/ and data/ directories."
echo "6. Run: pm2 start ecosystem.config.js"
echo "7. Link Nginx config: sudo ln -s /home/ubuntu/onlinekotha/scripts/nginx.conf /etc/nginx/sites-enabled/onlinekotha"
echo "8. Restart Nginx: sudo systemctl restart nginx"
echo "==================================================================="
