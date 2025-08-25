#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.dev}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"
FILE="${1:-}"

if [ -z "$FILE" ]; then
  echo "Usage: $0 backups/backup_YYYY-MM-DD_HHMMSS.sql[.gz]" >&2
  exit 1
fi

DC="docker compose --env-file \"$ENV_FILE\" -f \"$COMPOSE_FILE\""

if [[ "$FILE" == *.gz ]]; then
  zcat "$FILE" | eval $DC exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
else
  cat "$FILE" | eval $DC exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
fi

echo "✅ Restauration terminée depuis: $FILE"
