#!/bin/sh
# Starts the Caddy token proxy, then hands off to voicebox's own entrypoint
# (which drops privileges to the `voicebox` user and execs uvicorn).
set -e

if [ -z "$VOICEBOX_PROXY_TOKEN" ]; then
  echo "FATAL: VOICEBOX_PROXY_TOKEN is not set — refusing to start an unauthenticated proxy." >&2
  echo "       fly secrets set VOICEBOX_PROXY_TOKEN=<random> -a vismay-voicebox" >&2
  exit 1
fi

# The Fly volume mounts over /app/data root-owned on first boot; voicebox
# runs as its own user and expects these writable. Non-recursive chown of
# the directories is enough (files inside are created by voicebox itself)
# and stays fast even once the model cache is tens of GB.
for d in /app/data /app/data/generations /app/data/profiles /app/data/cache /app/data/hf-cache; do
  mkdir -p "$d"
  chown voicebox:voicebox "$d" 2>/dev/null || true
done

caddy run --config /etc/caddy/Caddyfile &

exec /usr/local/bin/entrypoint.sh "$@"
