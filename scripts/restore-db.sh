#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib/env_detect.sh"
env_detect_init
echo "INFO: APP_ENV=$APP_ENV | ENV_FILE=$ENV_FILE | COMPOSE_FILE=$COMPOSE_FILE"


FILE="${1:-}"
[ -n "$FILE" ] || { echo "Usage: $0 backups/backup_YYYY-MM-DD_HHMMSS.sql[.gz]" >&2; exit 1; }


if [[ "$FILE" == *.gz ]]; then
zcat "$FILE" | dc exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
else
cat "$FILE" | dc exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
fi


echo "OK: Restore completed from $FILE"