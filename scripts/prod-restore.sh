#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib/env_detect.sh"
env_detect_init
echo "INFO: APP_ENV=$APP_ENV | ENV_FILE=$ENV_FILE | COMPOSE_FILE=$COMPOSE_FILE"


DUMP="${1:-}"
[ -n "$DUMP" ] || DUMP="$(ls -1t backups/*.sql backups/*.sql.gz 2>/dev/null | head -n1 || true)"
[ -n "${DUMP:-}" ] || { echo "ERROR: No dump found in backups/"; exit 1; }


dc stop backend || true


if [[ "$DUMP" == *.gz ]]; then
zcat "$DUMP" | dc exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
else
cat "$DUMP" | dc exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
fi


dc run --rm backend sh -lc 'python manage.py migrate --noinput'
dc up -d backend
dc exec -T db sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;"'


echo "OK: Restore + migrate + restart completed (dump: $DUMP)"