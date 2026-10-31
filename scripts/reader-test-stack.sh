#!/usr/bin/env bash
# The isolated stack the reader browser tests run against (docs/document-architecture.md, Testing):
# its own compose project (wbtest), images, volumes, network and ports, so the local "workbench"
# stack is never touched. The app is at https://localhost:18443 (Caddy's internal CA; WebKit sends
# Secure cookies only over HTTPS), the API at 127.0.0.1:15173. Arguments go to docker compose:
#
#   scripts/reader-test-stack.sh up -d --build                      build the working tree and start
#   scripts/reader-test-stack.sh up -d --build --force-recreate web rebuild one service
#   scripts/reader-test-stack.sh down                               stop (add -v to drop its data)
#
# The first run writes $WBTEST_DIR/.env (default /tmp/wbtest) from .env.example with fresh secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${WBTEST_DIR:-/tmp/wbtest}"
ENV_FILE="$DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  mkdir -p "$DIR"
  secret() { openssl rand -hex 24; }
  sed -e "s|^SITE_ADDRESS=.*|SITE_ADDRESS=localhost|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secret)|" \
      -e "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=$(secret)|" \
      -e "s|^RABBITMQ_PASS=.*|RABBITMQ_PASS=$(secret)|" \
      -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(secret)|" \
      -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(secret)|" \
      -e "s|^WEBAUTHN_ORIGIN=.*|WEBAUTHN_ORIGIN=https://localhost:18443|" \
      -e "s|^OLLAMA_BASE_URL=.*|OLLAMA_BASE_URL=http://host.docker.internal:11434|" \
      -e "s|^API_PORT=.*|API_PORT=15173|" \
      "$ROOT/.env.example" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "wrote $ENV_FILE" >&2
fi
exec docker compose -p wbtest --env-file "$ENV_FILE" -f "$ROOT/docker-compose.yml" \
  -f "$ROOT/scripts/reader-test-stack.override.yml" "$@"
