#!/bin/sh
# Build the API image here, ship it to Lightsail, run migrations, restart, health-check.
# Usage: API_HOST=ubuntu@1.2.3.4 sh scripts/deploy-api.sh
# Optional: SSH_KEY=~/.ssh/lightsail.pem  PLATFORM=linux/amd64  PUBLIC_URL=https://api.lociros.com
set -eu

: "${API_HOST:?Set API_HOST=ubuntu@PUBLIC_IP}"
PLATFORM="${PLATFORM:-linux/amd64}"
IMAGE="${IMAGE:-lociros-backend:latest}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_OPTS=""
if [ -n "${SSH_KEY:-}" ]; then
  SSH_OPTS="-i $SSH_KEY"
fi
# shellcheck disable=SC2086
ssh_box() { ssh $SSH_OPTS "$API_HOST" "$@"; }

cd "$ROOT"
REV="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "Warning: deploying with uncommitted changes on top of $REV" >&2
fi

echo "Building $IMAGE ($PLATFORM) at $REV..."
docker build --platform "$PLATFORM" -f backend/Dockerfile -t "$IMAGE" .

echo "Shipping image to $API_HOST..."
docker save "$IMAGE" | gzip | ssh_box 'gzip -d | docker load'
# shellcheck disable=SC2086
scp $SSH_OPTS scripts/lightsail-run.sh "$API_HOST":lightsail-run.sh

echo "Running migrations..."
ssh_box "docker run --rm --env-file /opt/lociros/.env -e APP_ENV=production \
  --entrypoint sh $IMAGE -c 'cd /app/backend && alembic upgrade head'"

echo "Restarting..."
ssh_box "IMAGE=$IMAGE sh lightsail-run.sh"

if [ -n "${PUBLIC_URL:-}" ]; then
  echo "Checking $PUBLIC_URL..."
  curl -fsS "$PUBLIC_URL/health" && echo
fi
echo "Deployed $REV."
