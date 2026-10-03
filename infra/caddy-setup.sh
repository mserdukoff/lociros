#!/bin/sh
# Put Caddy (HTTPS) in front of the Lociros API on the Lightsail box.
# Usage: sudo sh infra/caddy-setup.sh api.lociros.com
# Point the domain's A record at the instance's static IP before running this.
set -eu

DOMAIN="${1:-${API_DOMAIN:-}}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo sh infra/caddy-setup.sh api.example.com" >&2
  exit 1
fi
HERE="$(cd "$(dirname "$0")" && pwd)"

if ! command -v caddy >/dev/null 2>&1; then
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy 2>/dev/null || true
sed "s/{\$API_DOMAIN:api.lociros.com}/$DOMAIN/" "$HERE/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

echo "Caddy is serving https://$DOMAIN -> 127.0.0.1:8000"
echo "Now, in the Lightsail firewall: keep 22, 80, 443 open and remove 8000."
echo "Then set NLP_BACKEND_URL=https://$DOMAIN on both Vercel projects and redeploy."
