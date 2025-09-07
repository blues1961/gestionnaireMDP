#!/usr/bin/env bash
set -euo pipefail

# ───────────────────────── config de base ─────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SLUG="${APP_SLUG:-mdp}"

DUMP_PATH="${1:-}"
if [[ -z "${DUMP_PATH}" || ! -f "${DUMP_PATH}" ]]; then
  echo "Usage: $0 /chemin/vers/db.YYYYMMDD-HHMMSS.dump" >&2
  exit 2
fi

# ───────────────────────── détection env ─────────────────────────
detect_env() {
  # priorité à ENV_OVERRIDE si fourni (dev|prod)
  if [[ "${ENV_OVERRIDE:-}" == "dev" || "${ENV_OVERRIDE:-}" == "prod" ]]; then
    echo "${ENV_OVERRIDE}"
    return
  fi
  local dev="${APP_SLUG}_db_dev" prod="${APP_SLUG}_db_prod"
  local have_dev have_prod
  have_dev="$(docker ps --format '{{.Names}}' | grep -E "^${dev}\$" || true)"
  have_prod="$(docker ps --format '{{.Names}}' | grep -E "^${prod}\$" || true)"
  if [[ -n "$have_dev" && -z "$have_prod" ]]; then echo "dev"; return; fi
  if [[ -z "$have_dev" && -n "$have_prod" ]]; then echo "prod"; return; fi
  # défaut si les deux / aucun détecté
  echo "dev"
}

ENV="$(detect_env)"
DB_CONT="${APP_SLUG}_db_${ENV}"

# ───────────────────────── charger .env ─────────────────────────
set -a
# shellcheck source=/dev/null
source "$ROOT_DIR/.env.$ENV"
[[ -f "$ROOT_DIR/.env.$ENV.local" ]] && source "$ROOT_DIR/.env.$ENV.local"
set +a

: "${POSTGRES_USER:?POSTGRES_USER manquant dans .env.$ENV}"
: "${POSTGRES_DB:?POSTGRES_DB manquant dans .env.$ENV}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD manquant (mettre dans .env.$ENV.local)}"

echo "[*] ENV=${ENV}  CONTAINER=${DB_CONT}  DB=${POSTGRES_DB}  USER=${POSTGRES_USER}"
echo "[*] Restore ${DUMP_PATH}"

# ───────────────────────── copier le dump ───────────────────────
docker cp "${DUMP_PATH}" "${DB_CONT}:/tmp/restore.dump"

# ───────────────────────── helpers SQL ──────────────────────────
# Essayes avec 'mdpuser' (superuser du cluster docker), sinon retombe sur $POSTGRES_USER
sql_db_super_or_app() {
  local sql="$1"
  docker exec -i "${DB_CONT}" sh -lc "
    psql -U mdpuser      -d postgres -v ON_ERROR_STOP=1 -c \"$sql\" 2>/dev/null \
    || psql -U \"$POSTGRES_USER\" -d postgres -v ON_ERROR_STOP=1 -c \"$sql\"
  "
}

# ───────────────────────── ensure DB existe ─────────────────────
docker exec -i "${DB_CONT}" sh -lc "
  psql -U mdpuser -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'\" | grep -q 1 \
  || psql -U mdpuser -d postgres -v ON_ERROR_STOP=1 \
       -c \"CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER} TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';\" \
  || psql -U \"${POSTGRES_USER}\" -d postgres -v ON_ERROR_STOP=1 \
       -c \"CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER} TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';\"
"

# ───────────────────────── search_path + droits ─────────────────
sql_db_super_or_app "ALTER DATABASE ${POSTGRES_DB} SET search_path=public;"
sql_db_super_or_app "ALTER ROLE ${POSTGRES_USER} SET search_path=public;"

docker exec -i "${DB_CONT}" sh -lc "
  psql -U \"${POSTGRES_USER}\" -d \"${POSTGRES_DB}\" -v ON_ERROR_STOP=1 -c \"ALTER SCHEMA public OWNER TO ${POSTGRES_USER};\"
  psql -U \"${POSTGRES_USER}\" -d \"${POSTGRES_DB}\" -v ON_ERROR_STOP=1 -c \"GRANT USAGE, CREATE ON SCHEMA public TO ${POSTGRES_USER};\"
"

# ───────────────────────── reset schéma + restore ───────────────
docker exec -i "${DB_CONT}" sh -lc "
  set -e
  psql -U \"${POSTGRES_USER}\" -d \"${POSTGRES_DB}\" -v ON_ERROR_STOP=1 -c \"DROP SCHEMA IF EXISTS public CASCADE;\"
  psql -U \"${POSTGRES_USER}\" -d \"${POSTGRES_DB}\" -v ON_ERROR_STOP=1 -c \"CREATE SCHEMA public AUTHORIZATION ${POSTGRES_USER};\"
  psql -U \"${POSTGRES_USER}\" -d \"${POSTGRES_DB}\" -v ON_ERROR_STOP=1 -c \"GRANT USAGE, CREATE ON SCHEMA public TO ${POSTGRES_USER};\"
  pg_restore -U \"${POSTGRES_USER}\" -d \"${POSTGRES_DB}\" /tmp/restore.dump
  rm -f /tmp/restore.dump
"

echo "[OK] restore terminé"
