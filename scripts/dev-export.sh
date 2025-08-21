#!/usr/bin/env bash
set -euo pipefail

# Dump la BD de DEV (service "db" de docker-compose.dev.yml) vers ./backups/db-dev-<timestamp>.sql
# Aucune variable host requise : on lit POSTGRES_* dans le conteneur et on exporte PGPASSWORD à la volée.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TS="$(date +"%Y%m%d-%H%M%S")"
mkdir -p ./backups

echo "→ Export DEV vers ./backups/db-dev-$TS.sql"
docker compose -f docker-compose.dev.yml exec -T db \
  sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "./backups/db-dev-$TS.sql"

ls -lh "./backups/db-dev-$TS.sql"
echo "OK."
