#!/bin/sh
# Build the API image here, ship it to Lightsail, run migrations, rolling restart, health-check.
# Usage: API_HOST=ubuntu@1.2.3.4 sh scripts/deploy-api.sh
# Optional: SSH_KEY=~/.ssh/lightsail.pem  PLATFORM=linux/amd64  PUBLIC_URL=https://api.lociros.com
#           API_REPLICAS=2  KEEP_IMAGES=3
# Undo with scripts/rollback-api.sh (schema changes are not reverted).
set -eu

: "${API_HOST:?Set API_HOST=ubuntu@PUBLIC_IP}"
PLATFORM="${PLATFORM:-linux/amd64}"
REPO="${REPO:-lociros-backend}"
IMAGE="$REPO:latest"
PUBLIC_URL="${PUBLIC_URL:-https://api.lociros.com}"
KEEP_IMAGES="${KEEP_IMAGES:-3}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_OPTS=""
if [ -n "${SSH_KEY:-}" ]; then
  SSH_OPTS="-i $SSH_KEY"
fi
# shellcheck disable=SC2086
ssh_box() { ssh $SSH_OPTS "$API_HOST" "$@"; }

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running here. Start Docker Desktop (open -a Docker) and try again." >&2
  exit 1
fi

cd "$ROOT"
REV="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "Warning: deploying with uncommitted changes on top of $REV" >&2
  REV="$REV-dirty"
fi

echo "Building $REPO:$REV ($PLATFORM)..."
docker build --platform "$PLATFORM" -f backend/Dockerfile -t "$IMAGE" -t "$REPO:$REV" .

echo "Shipping image to $API_HOST..."
docker save "$IMAGE" "$REPO:$REV" | gzip | ssh_box 'gzip -d | docker load'
# shellcheck disable=SC2086
scp $SSH_OPTS scripts/lightsail-run.sh "$API_HOST":lightsail-run.sh

echo "Running migrations..."
ssh_box "docker run --rm --env-file /opt/lociros/.env -e APP_ENV=production \
  --entrypoint sh $IMAGE -c 'cd /app/backend && alembic upgrade head'"

echo "Rolling restart (${API_REPLICAS:-2} replicas)..."
# Prune and trim old tags whether or not the restart succeeds, so a failed deploy never fills the disk.
ssh_box "IMAGE=$IMAGE API_REPLICAS=${API_REPLICAS:-2} sh lightsail-run.sh; rc=\$?; \
  docker images $REPO --format '{{.Tag}}' | grep -v '^latest\$' | tail -n +$((KEEP_IMAGES + 1)) \
    | xargs -r -I{} docker rmi $REPO:{} >/dev/null 2>&1; \
  docker image prune -f >/dev/null; exit \$rc"

echo "Checking $PUBLIC_URL/api/health/ready..."
curl -fsS --max-time 20 "$PUBLIC_URL/api/health/ready" && echo
echo "Deployed $REV."
