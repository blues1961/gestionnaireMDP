#!/usr/bin/env bash
set -euo pipefail

# Restaure un dump SQL vers la BD de PROD (docker-compose.prod.yml / .env.prod).
# Utilisation:
#   ./scripts/prod-restore.sh                # prend le dernier dump (db-dev-*.sql ou db-*.sql)
#   ./scripts/prod-restore.sh backups/mon-dump.sql

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

# 1) Sélection du dump
if [[ $# -ge 1 ]]; then
  DUMP="$1"
  [[ -f "$DUMP" ]] || { echo "Dump introuvable: $DUMP" >&2; exit 1; }
else
  DUMP="$(ls -1t backups/db-dev-*.sql backups/db-*.sql 2>/dev/null | head -n 1 || true)"
  [[ -n "${DUMP:-}" ]] || { echo "Aucun dump trouvé dans ./backups" >&2; exit 1; }
fi
echo "→ Dump sélectionné: $DUMP"

# 2) Stop backend pour libérer les connexions
$COMPOSE stop backend

# 3) Reset propre (depuis 'postgres' pour éviter de se tuer soi-même)
$COMPOSE exec -T db sh -lc '
  export PGPASSWORD="$POSTGRES_PASSWORD";
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "
    REVOKE CONNECT ON DATABASE $POSTGRES_DB FROM PUBLIC, $POSTGRES_USER;
  ";
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '\''$POSTGRES_DB'\'' AND pid <> pg_backend_pid();
  ";
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO $POSTGRES_USER;
  ";
'

# 4) Import du dump
echo "→ Import en cours…"
cat "$DUMP" | $COMPOSE exec -T db sh -lc '
  export PGPASSWORD="$POSTGRES_PASSWORD";
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
'

# 5) Redémarrage du backend
$COMPOSE up -d backend

# 6) Vérifications rapides (comptages clés)
$COMPOSE exec -T db sh -lc '
  export PGPASSWORD="$POSTGRES_PASSWORD";
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT COUNT(*) AS users FROM auth_user;
    SELECT COUNT(*) AS passwords FROM api_passwordentry;
    SELECT COUNT(*) AS categories FROM api_category;
  "
'

echo "✅ Restauration terminée."
