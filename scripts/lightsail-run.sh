#!/bin/sh
# Run on the Lightsail box after Docker is installed and the image is loaded.
# Starts Redis and API_REPLICAS API containers on 127.0.0.1:8001.., restarting
# them one at a time so nginx keeps serving from the others (zero downtime).
# Expects /opt/lociros/.env (production values, session-pooler DATABASE_URL).
set -eu

IMAGE="${IMAGE:-lociros-backend:latest}"
ENV_FILE="${ENV_FILE:-/opt/lociros/.env}"
AUDIO_HOST_DIR="${AUDIO_HOST_DIR:-/opt/lociros/audio}"
# Each warm replica holds ~1.7 GB of language models: 2 fits a 4 GB box with swap.
API_REPLICAS="${API_REPLICAS:-2}"
# Generation threads per replica. They mostly wait on OpenRouter and hold no DB
# connection while waiting, so every replica runs them and a rolling deploy never
# pauses generation. Replica 1 also runs the daily news scheduler and seeding.
GENERATE_WORKERS="${GENERATE_WORKERS:-4}"
# Steady state is ~1.1 GB per replica; the cap stops one runaway from taking the box.
API_MEMORY="${API_MEMORY:-1800m}"
API_MEMORY_SWAP="${API_MEMORY_SWAP:-2600m}"
BIND="${BIND:-127.0.0.1}"
NETWORK=lociros
REDIS_NAME=lociros-redis
UPSTREAM=/etc/nginx/lociros/upstream.conf

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }

# Supabase's session pooler holds one Postgres connection per client (pool
# size 15 on Nano/Micro). replicas x (DB_POOL_SIZE + DB_MAX_OVERFLOW) must stay
# under it: 2 x (4 + 3) = 14. Values in the env file win.
POOL=""
grep -q '^DB_POOL_SIZE=' "$ENV_FILE" || POOL="$POOL -e DB_POOL_SIZE=4"
grep -q '^DB_MAX_OVERFLOW=' "$ENV_FILE" || POOL="$POOL -e DB_MAX_OVERFLOW=3"
have_nginx() { command -v nginx >/dev/null 2>&1 && [ -d /etc/nginx/lociros ]; }

# Writes the nginx upstream; replica $1 (if given) is marked down so nginx stops
# sending it new requests before it is replaced.
write_upstream() {
  have_nginx || return 0
  tmp="$(mktemp)"
  {
    echo "# Rewritten by scripts/lightsail-run.sh on every deploy."
    echo "upstream lociros_api {"
    echo "    least_conn;"
    # sh has no locals: a counter named i here would clobber the deploy loop's.
    n=1
    while [ "$n" -le "$API_REPLICAS" ]; do
      flag=""
      [ "$n" = "${1:-}" ] && flag=" down"
      echo "    server 127.0.0.1:$((8000 + n)) max_fails=3 fail_timeout=10s$flag;"
      n=$((n + 1))
    done
    echo "    keepalive 64;"
    echo "    keepalive_timeout 60s;"
    echo "}"
  } > "$tmp"
  as_root cp "$tmp" "$UPSTREAM"
  rm -f "$tmp"
  as_root nginx -t -q && as_root systemctl reload nginx
}

wait_healthy() {
  name="$1"; port="$2"
  # First boot of replica 1 seeds the library and can take several minutes.
  for _ in $(seq 1 90); do
    if curl -fsS "http://127.0.0.1:$port/api/health/ready" >/dev/null 2>&1; then
      return 0
    fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" != "true" ]; then
      break
    fi
    sleep 5
  done
  echo "$name did not become healthy. Logs:" >&2
  docker logs --tail 80 "$name" >&2
  return 1
}

# TTS files live here so they survive container recreation. The image runs as uid 1000.
mkdir -p "$AUDIO_HOST_DIR" 2>/dev/null || as_root mkdir -p "$AUDIO_HOST_DIR"
chown 1000:1000 "$AUDIO_HOST_DIR" 2>/dev/null || as_root chown 1000:1000 "$AUDIO_HOST_DIR"

docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null

# Rate-limit windows and cooldowns only; nothing durable, so no persistence.
if [ "$(docker inspect -f '{{.State.Running}}' "$REDIS_NAME" 2>/dev/null)" != "true" ]; then
  docker rm -f "$REDIS_NAME" >/dev/null 2>&1 || true
  docker run -d \
    --name "$REDIS_NAME" \
    --network "$NETWORK" \
    --restart unless-stopped \
    --memory 128m \
    --log-opt max-size=10m --log-opt max-file=3 \
    redis:7-alpine \
    redis-server --save "" --appendonly no --maxmemory 64mb --maxmemory-policy allkeys-lru >/dev/null
fi

# If a replica fails to come up, do not leave it marked down: nginx's max_fails
# routes around a dead backend, and the next deploy should start from full capacity.
trap 'rc=$?; [ "$rc" -ne 0 ] && write_upstream; exit "$rc"' EXIT

# Highest replica first: a replica that does not exist yet starts while the
# lower ones keep serving, so scaling 1 -> 2 never leaves nginx with no backend.
i="$API_REPLICAS"
while [ "$i" -ge 1 ]; do
  name="lociros-api-$i"
  port=$((8000 + i))
  if [ "$i" -eq 1 ]; then
    role="-e GENERATE_WORKERS=$GENERATE_WORKERS -e NEWS_SCHEDULER=true -e SKIP_SEED=false"
  else
    role="-e GENERATE_WORKERS=$GENERATE_WORKERS -e NEWS_SCHEDULER=false -e SKIP_SEED=true"
  fi

  if [ "$API_REPLICAS" -gt 1 ] && docker inspect "$name" >/dev/null 2>&1; then
    write_upstream "$i"
  fi
  echo "Starting $name on $BIND:$port..."
  docker stop -t 40 "$name" >/dev/null 2>&1 || true
  docker rm -f "$name" >/dev/null 2>&1 || true
  # shellcheck disable=SC2086
  docker run -d \
    --name "$name" \
    --network "$NETWORK" \
    --restart unless-stopped \
    --stop-timeout 40 \
    --memory "$API_MEMORY" \
    --memory-swap "$API_MEMORY_SWAP" \
    --env-file "$ENV_FILE" \
    -e APP_ENV=production \
    -e WEB_CONCURRENCY=1 \
    -e REDIS_URL="${REDIS_URL:-redis://$REDIS_NAME:6379/0}" \
    $role \
    $POOL \
    -e DATA_DIR=/app/data \
    -e AUDIO_DIR=/app/backend/audio \
    -v "$AUDIO_HOST_DIR:/app/backend/audio" \
    --log-opt max-size=20m --log-opt max-file=5 \
    -p "$BIND:$port:8000" \
    "$IMAGE" >/dev/null
  wait_healthy "$name" "$port"
  echo "$name is healthy."
  i=$((i - 1))
done
write_upstream

# Scale down: remove replicas above API_REPLICAS, and the pre-nginx single
# container once nginx is serving the replicas.
for name in $(docker ps -a --format '{{.Names}}' | grep -E '^lociros-api(-[0-9]+)?$' || true); do
  idx="${name#lociros-api}"
  idx="${idx#-}"
  if [ -z "$idx" ]; then
    if have_nginx && systemctl is-active --quiet nginx; then
      echo "Removing legacy container $name (nginx now balances the replicas)."
      docker stop -t 40 "$name" >/dev/null 2>&1 || true
      docker rm -f "$name" >/dev/null 2>&1 || true
    fi
  elif [ "$idx" -gt "$API_REPLICAS" ]; then
    echo "Removing $name (above API_REPLICAS=$API_REPLICAS)."
    docker stop -t 40 "$name" >/dev/null 2>&1 || true
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
done

echo "API is up: $API_REPLICAS replica(s) on $BIND:8001-$((8000 + API_REPLICAS)), Redis at $REDIS_NAME."
have_nginx || echo "nginx is not set up yet; run: sudo sh infra/nginx-setup.sh api.lociros.com you@example.com"
