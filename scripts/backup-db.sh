#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib/env_detect.sh"
env_detect_init
echo "INFO: APP_ENV=$APP_ENV | ENV_FILE=$ENV_FILE | COMPOSE_FILE=$COMPOSE_FILE"


BACKUP_DIR="${BACKUP_DIR:-backups}"
GZIP="${GZIP:-1}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"


mkdir -p "$BACKUP_DIR"
TS="$(date +%F_%H%M%S)"
OUTFILE="$BACKUP_DIR/backup_${TS}.sql"


dc exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$OUTFILE"


if [ "$GZIP" = "1" ]; then
gzip -f "$OUTFILE"; OUTFILE="${OUTFILE}.gz"
fi


[ -s "$OUTFILE" ] || { echo "ERROR: empty backup $OUTFILE" >&2; exit 1; }
find "$BACKUP_DIR" -type f -name 'backup_*.sql*' -mtime +"$RETENTION_DAYS" -print -delete || true


echo "OK: Backup created -> $OUTFILE"