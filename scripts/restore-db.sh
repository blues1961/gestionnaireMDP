#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"
FILE="${1:-}"

if [ -z "$FILE" ]; then
  echo "Usage: $0 backups/backup_YYYY-MM-DD_HHMMSS.sql[.gz]" >&2
  exit 1
fi

if [[ "$FILE" == *.gz ]]; then
  # Restauration depuis un dump compressé
  zcat "$FILE" | docker compose -f "$COMPOSE_FILE" exec -T db \
    sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
else
  # Restauration depuis un dump texte
  cat "$FILE" | docker compose -f "$COMPOSE_FILE" exec -T db \
    sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
fi

echo "✅ Restauration terminée depuis: $FILE"
