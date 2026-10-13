#!/bin/sh
# Put the previous API image back on Lightsail with a rolling restart.
# Usage: API_HOST=ubuntu@1.2.3.4 sh scripts/rollback-api.sh
# Optional: SSH_KEY=~/.ssh/lightsail.pem  TO=<git short hash>  API_REPLICAS=2  PUBLIC_URL=...
# Migrations are not reverted: roll back only to an image that works with the current schema.
set -eu

: "${API_HOST:?Set API_HOST=ubuntu@PUBLIC_IP}"
REPO="${REPO:-lociros-backend}"
PUBLIC_URL="${PUBLIC_URL:-https://api.lociros.com}"
SSH_OPTS=""
if [ -n "${SSH_KEY:-}" ]; then
  SSH_OPTS="-i $SSH_KEY"
fi
# shellcheck disable=SC2086
ssh_box() { ssh $SSH_OPTS "$API_HOST" "$@"; }

echo "Images on the box (newest first):"
ssh_box "docker images $REPO --format '  {{.Tag}}  {{.ID}}  {{.CreatedSince}}'"

if [ -z "${TO:-}" ]; then
  current="$(ssh_box "docker image inspect -f '{{.Id}}' $REPO:latest")"
  TO="$(ssh_box "docker images $REPO --no-trunc --format '{{.Tag}} {{.ID}}'" \
    | awk -v cur="$current" '$1 != "latest" && $2 != cur { print $1; exit }')"
fi
[ -n "$TO" ] || { echo "No earlier image to roll back to." >&2; exit 1; }

echo "Rolling back to $REPO:$TO..."
ssh_box "docker tag $REPO:$TO $REPO:latest && IMAGE=$REPO:latest API_REPLICAS=${API_REPLICAS:-2} sh lightsail-run.sh"
curl -fsS --max-time 20 "$PUBLIC_URL/api/health/ready" && echo
echo "Now serving $TO."
