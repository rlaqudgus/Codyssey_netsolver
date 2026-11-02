#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu 22.04/24.04 EC2 instance. Run from the project folder:
#   bash deploy/setup-ec2.sh
# Then create /opt/net-solver/.env (see .env.example) and: sudo systemctl restart net-solver
set -euo pipefail

APP_DIR=/opt/net-solver
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

sudo apt-get update
sudo apt-get install -y nginx curl ca-certificates
# Node.js: keep an existing node >= 18, otherwise install 22 LTS from NodeSource (Ubuntu 22.04 ships node 12).
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Service user without login shell; app files owned by root, readable by everyone except .env.
id netsolver >/dev/null 2>&1 || sudo useradd --system --no-create-home --shell /usr/sbin/nologin netsolver
sudo mkdir -p "$APP_DIR"
sudo cp -r "$SRC_DIR/public" "$SRC_DIR/server" "$SRC_DIR/package.json" "$APP_DIR/"
if [ -f "$SRC_DIR/.env" ] && [ ! -f "$APP_DIR/.env" ]; then sudo cp "$SRC_DIR/.env" "$APP_DIR/.env"; fi
if [ -f "$APP_DIR/.env" ]; then sudo chown netsolver:netsolver "$APP_DIR/.env"; sudo chmod 600 "$APP_DIR/.env"; fi

sudo cp "$SRC_DIR/deploy/nginx.conf" /etc/nginx/sites-available/net-solver
sudo ln -sf /etc/nginx/sites-available/net-solver /etc/nginx/sites-enabled/net-solver
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

sudo cp "$SRC_DIR/deploy/net-solver.service" /etc/systemd/system/net-solver.service
sudo systemctl daemon-reload
sudo systemctl enable --now net-solver

echo "--- checks ---"
curl -s -o /dev/null -w 'localhost /        -> %{http_code}\n' http://localhost/
curl -s -w '  (%{http_code})\n'                http://localhost/health
curl -s -w '  (%{http_code})\n'                http://localhost/api/health
curl -s -o /dev/null -w 'outbound example.com -> %{http_code}\n' https://example.com
