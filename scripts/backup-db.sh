#!/usr/bin/env bash
set -euo pipefail

# Par défaut: dev. Prod: ENV_FILE=.env.prod COMPOSE_FILE=docker-compose.prod.yml ./scripts/backup-db.sh
ENV_FILE="${ENV_FILE:-.env.dev}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"

BACKUP_DIR="${BACKUP_DIR:-backups}"
GZIP="${GZIP:-1}"                 # 1 = .gz, 0 = .sql
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
TS="$(date +%F_%H%M%S)"
OUTFILE="$BACKUP_DIR/backup_${TS}.sql"

DC="docker compose --env-file \"$ENV_FILE\" -f \"$COMPOSE_FILE\""

# Dump depuis le conteneur DB (pg_dump lit POSTGRES_* dans le conteneur)
eval $DC exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$OUTFILE"

if [ "$GZIP" = "1" ]; then
  gzip -f "$OUTFILE"
  OUTFILE="${OUTFILE}.gz"
fi

# Sanity check
if [ ! -s "$OUTFILE" ]; then
  echo "❌ Backup échoué: fichier vide $OUTFILE" >&2
  exit 1
fi

# Rotation
find "$BACKUP_DIR" -type f -name 'backup_*.sql*' -mtime +"$RETENTION_DAYS" -print -delete || true

echo "✅ Backup OK: $OUTFILE"
