#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=scripts/lib/env_detect.sh
. "$(dirname "$0")/lib/env_detect.sh"
env_detect_init
echo "INFO: APP_ENV=$APP_ENV | ENV_FILE=$ENV_FILE | COMPOSE_FILE=$COMPOSE_FILE"

# --- Sélection du dump ---
DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  DUMP="$(ls -1t backups/*.sql backups/*.sql.gz 2>/dev/null | head -n1 || true)"
fi
if [ -z "${DUMP:-}" ]; then
  echo "ERROR: No dump found in backups/" >&2
  exit 1
fi

# --- Chemin vers restore-db.sh ---
RESTORE_SH="$(dirname "$0")/restore-db.sh"
if [ ! -x "$RESTORE_SH" ]; then
  echo "ERROR: $RESTORE_SH not found or not executable" >&2
  exit 2
fi

echo "INFO: Using dump -> $DUMP"
echo "INFO: Stopping backend to avoid concurrent writes..."
dc stop backend || true

# --- Restauration (déléguée) ---
echo "INFO: Restoring DB..."
"$RESTORE_SH" "$DUMP"

# --- Migrations & redémarrage backend ---
echo "INFO: Running migrations..."
dc run --rm backend sh -lc 'python manage.py migrate --noinput'

echo "INFO: Starting backend..."
dc up -d backend

# --- Sanity check DB ---
echo "INFO: Sanity check (SELECT 1)"
dc exec -T db sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;"'

echo "OK: Restore + migrate + restart completed (dump: $DUMP)"
