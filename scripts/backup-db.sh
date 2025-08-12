#!/usr/bin/env bash
set -euo pipefail

# Config via variables d'env (valeurs par défaut ci-dessous)
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"  # ou docker-compose.yml en prod
BACKUP_DIR="${BACKUP_DIR:-backups}"
GZIP="${GZIP:-1}"                 # 1 = compresser en .gz, 0 = garder .sql
RETENTION_DAYS="${RETENTION_DAYS:-14}"  # supprimer les backups plus vieux que N jours

mkdir -p "$BACKUP_DIR"
TS="$(date +%F_%H%M%S)"
OUTFILE="$BACKUP_DIR/backup_${TS}.sql"

# Dump depuis le conteneur PostgreSQL
# (les variables $POSTGRES_USER / $POSTGRES_DB sont lues dans le conteneur)
docker compose -f "$COMPOSE_FILE" exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$OUTFILE"

# Compression optionnelle
if [ "$GZIP" = "1" ]; then
  gzip -f "$OUTFILE"
  OUTFILE="${OUTFILE}.gz"
fi

# Vérification basique (fichier non vide)
if [ ! -s "$OUTFILE" ]; then
  echo "Backup échoué: fichier vide $OUTFILE" >&2
  exit 1
fi

# Rotation (supprime les backups plus vieux que RETENTION_DAYS)
find "$BACKUP_DIR" -type f -name 'backup_*.sql*' -mtime +"$RETENTION_DAYS" -print -delete || true

echo "✅ Backup OK: $OUTFILE"
