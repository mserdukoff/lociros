#!/bin/sh
# Run on the Lightsail box after Docker is installed and the image is loaded.
# Expects /opt/lociros/.env (production values, session-pooler DATABASE_URL).
set -eu

IMAGE="${IMAGE:-lociros-backend:latest}"
NAME="${NAME:-lociros-api}"
ENV_FILE="${ENV_FILE:-/opt/lociros/.env}"
AUDIO_HOST_DIR="${AUDIO_HOST_DIR:-/opt/lociros/audio}"
# Caddy on the host terminates HTTPS (infra/caddy-setup.sh). Set PUBLISH=8000:8000
# only while there is no domain yet and the firewall must expose :8000 directly.
PUBLISH="${PUBLISH:-127.0.0.1:8000:8000}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

# TTS files live here so they survive container recreation. The image runs as uid 1000.
mkdir -p "$AUDIO_HOST_DIR" 2>/dev/null || sudo mkdir -p "$AUDIO_HOST_DIR"
chown 1000:1000 "$AUDIO_HOST_DIR" 2>/dev/null || sudo chown 1000:1000 "$AUDIO_HOST_DIR"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -e APP_ENV=production \
  -e WEB_CONCURRENCY=1 \
  -e GENERATE_WORKERS=2 \
  -e DATA_DIR=/app/data \
  -e AUDIO_DIR=/app/backend/audio \
  -v "$AUDIO_HOST_DIR:/app/backend/audio" \
  -p "$PUBLISH" \
  "$IMAGE"

echo "Waiting for /health (first boot seeds the library and can take several minutes)..."
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    curl -fsS "http://127.0.0.1:8000/api/health/ready" || true
    echo
    echo "API is up on $PUBLISH"
    exit 0
  fi
  sleep 10
done

echo "Container did not become healthy. Logs:" >&2
docker logs --tail 80 "$NAME" >&2
exit 1
