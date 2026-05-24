#!/usr/bin/env bash
set -euo pipefail

./scripts/check-invariants.sh

set -a
. .env
set +a

docker compose --env-file .env --env-file .env.local -f "docker-compose.${APP_ENV}.yml" exec backend python manage.py migrate
