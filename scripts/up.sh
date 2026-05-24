#!/usr/bin/env bash
set -euo pipefail

./scripts/check-invariants.sh

set -a
. .env
set +a

SERVICE="${SERVICE:-${1:-}}"

if [ -n "$SERVICE" ]; then
  docker compose --env-file .env --env-file .env.local -f "docker-compose.${APP_ENV}.yml" up -d --build "$SERVICE"
else
  docker compose --env-file .env --env-file .env.local -f "docker-compose.${APP_ENV}.yml" up -d --build
fi
