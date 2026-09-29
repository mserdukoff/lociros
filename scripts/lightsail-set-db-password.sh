#!/bin/sh
# Run on the Lightsail box after resetting the Supabase database password.
# Prompts for the new password, writes it into DATABASE_URL in /opt/lociros/.env,
# then recreates lociros-api from the image it is running now.
set -eu

ENV_FILE="${ENV_FILE:-/opt/lociros/.env}"
NAME="${NAME:-lociros-api}"

printf "New Supabase database password: "
stty -echo
read -r DB_PASSWORD
stty echo
printf "\n"
[ -n "$DB_PASSWORD" ] || { echo "Empty password, nothing changed." >&2; exit 1; }

sudo cp "$ENV_FILE" "$ENV_FILE.bak"
DB_PASSWORD="$DB_PASSWORD" sudo --preserve-env=DB_PASSWORD python3 - "$ENV_FILE" <<'PY'
import os, re, sys, urllib.parse
path = sys.argv[1]
text = open(path).read()
password = urllib.parse.quote(os.environ["DB_PASSWORD"], safe="")
new, count = re.subn(
    r"^(DATABASE_URL=\S+?://[^:@/\s]+:)[^@\s]*(@)",
    lambda m: m.group(1) + password + m.group(2),
    text,
    flags=re.M,
)
if count != 1:
    sys.exit(f"Expected one DATABASE_URL with a password in {path}, found {count}. Nothing changed.")
open(path, "w").write(new)
print(f"Updated DATABASE_URL in {path} (backup at {path}.bak)")
PY

IMAGE="$(docker inspect -f '{{.Image}}' "$NAME")"
IMAGE="$IMAGE" NAME="$NAME" ENV_FILE="$ENV_FILE" sh "$(dirname "$0")/lightsail-run.sh"
