#!/bin/sh
set -eu

cd /app/backend
python -c "from app.models.db import wait_for_db; wait_for_db()"

WORKERS="${WEB_CONCURRENCY:-2}"
# Trust X-Forwarded-* only from the host (Caddy) and Docker bridge networks.
FORWARDED_ALLOW_IPS="${FORWARDED_ALLOW_IPS:-127.0.0.1,172.16.0.0/12}"
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --proxy-headers \
  --forwarded-allow-ips="$FORWARDED_ALLOW_IPS" \
  --timeout-keep-alive 120 \
  --workers "$WORKERS"
