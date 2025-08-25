#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=scripts/lib/env_detect.sh
. "$(dirname "$0")/lib/env_detect.sh"
env_detect_init
echo "INFO: APP_ENV=$APP_ENV | ENV_FILE=$ENV_FILE | COMPOSE_FILE=$COMPOSE_FILE"


# Permet d'indiquer un fichier, mais par défaut prend le DERNIER dump
FILE="${1:-}"
if [ -z "$FILE" ]; then
FILE="$(ls -1t backups/*.sql backups/*.sql.gz 2>/dev/null | head -n1 || true)"
fi
[ -n "${FILE:-}" ] || { echo "ERROR: No dump found in backups/" >&2; exit 1; }


echo "INFO: Using dump -> $FILE"


# Reset complet du schéma avant restauration (évite les erreurs relation exists/duplicate key)
echo "INFO: Dropping and recreating schema 'public'..."
dc exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION \"$POSTGRES_USER\";"'


# Restauration du dump (plain SQL, gz ou non)
if [[ "$FILE" == *.gz ]]; then
zcat "$FILE" | dc exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
else
cat "$FILE" | dc exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
fi


echo "OK: Restore completed from $FILE"