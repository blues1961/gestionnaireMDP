#!/usr/bin/env bash
set -euo pipefail
# Restaure un dump SQL vers la BD de PROD.
# Usage:
#   ./scripts/prod-restore.sh                # dernier dump trouvé
#   ./scripts/prod-restore.sh backups/mon-dump.sql[.gz]

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DC="docker compose --env-file .env.prod -f docker-compose.prod.yml"

# 1) Sélection du dump
if [[ $# -ge 1 ]]; then
  DUMP="$1"
else
  DUMP="$(ls -1t backups/*.sql backups/*.sql.gz 2>/dev/null | head -n1 || true)"
fi

if [[ -z "${DUMP:-}" ]]; then
  echo "❌ Aucun dump trouvé dans backups/" >&2
  exit 1
fi

echo "➡️ Restauration PROD depuis: $DUMP"

# 2) Arrêt backend le temps de la restauration (optionnel)
eval $DC stop backend || true

# 3) Restauration
if [[ "$DUMP" == *.gz ]]; then
  zcat "$DUMP" | eval $DC exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
else
  cat "$DUMP" | eval $DC exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
fi

# 4) Migrer (si besoin)
eval $DC run --rm backend sh -lc 'python manage.py migrate --noinput'

# 5) Redémarrer backend
eval $DC up -d backend

# 6) Checks rapides
eval $DC exec -T db sh -lc '
  export PGPASSWORD="$POSTGRES_PASSWORD";
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT COUNT(*) AS users FROM auth_user;
    SELECT COUNT(*) AS passwords FROM api_passwordentry;
    SELECT COUNT(*) AS categories FROM api_category;
  "
'
echo "✅ Restauration PROD terminée."
