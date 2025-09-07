#!/usr/bin/env bash
set -euo pipefail

# ───────────────────────────────────────────────────────────────────────────────
# Config auto : lit .env (symlink) et .env.local pour récupérer APP_ENV, etc.
# ───────────────────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "[ERR] .env (symlink) introuvable à la racine du repo: $ROOT_DIR/.env" >&2
  exit 2
fi

# charge .env + .env.local dans l'environnement du shell
set -a
# shellcheck source=/dev/null
. "$ROOT_DIR/.env"
if [[ -f "$ROOT_DIR/.env.local" ]]; then
  # shellcheck source=/dev/null
  . "$ROOT_DIR/.env.local"
fi
set +a

: "${APP_ENV:?APP_ENV manquant dans .env/.env.local (ex: dev|prod)}"
APP_SLUG="${APP_SLUG:-mdp}"

DUMP_PATH="${1:-}"
if [[ -z "$DUMP_PATH" ]]; then
  echo "Usage: $0 <path/to/file.dump>"
  echo "Ex.   : $0 ./backups/db.20250906-234037.dump"
  exit 2
fi

if [[ ! -f "$DUMP_PATH" ]]; then
  echo "[ERR] Dump introuvable: $DUMP_PATH" >&2
  exit 2
fi

# On supporte uniquement les dumps 'pg_dump --format=custom' (.dump)
if [[ "${DUMP_PATH##*.}" != "dump" ]]; then
  echo "[ERR] Format non supporté. Fournis un dump au format 'custom' (.dump)." >&2
  exit 2
fi

# Variables DB attendues dans .env/.env.local
: "${POSTGRES_DB:?POSTGRES_DB manquant dans .env/.env.local}"
: "${POSTGRES_USER:?POSTGRES_USER manquant dans .env/.env.local}"

DB_CONT="${APP_SLUG}_db_${APP_ENV}"

echo "[*] ENV=$APP_ENV  CONTAINER=$DB_CONT  DB=$POSTGRES_DB  USER=$POSTGRES_USER"
echo "[*] Restore $DUMP_PATH -> $POSTGRES_DB"

# ───────────────────────────────────────────────────────────────────────────────
# Sanity check : le conteneur DB existe-t-il ?
# ───────────────────────────────────────────────────────────────────────────────
if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONT"; then
  echo "[ERR] Conteneur '$DB_CONT' introuvable ou arrêté."
  echo "      Démarre-le puis relance : ex. 'docker compose up -d db' (service) ou vérifie container_name."
  exit 3
fi

# ───────────────────────────────────────────────────────────────────────────────
# Copie du dump dans le conteneur
# ───────────────────────────────────────────────────────────────────────────────
docker cp "$DUMP_PATH" "$DB_CONT:/tmp/restore.dump"
echo "[OK] dump copié dans le conteneur"

# ───────────────────────────────────────────────────────────────────────────────
# Exécution dans le conteneur DB :
# - DROP SCHEMA public CASCADE (peut échouer si backend tient des verrous)
# - CREATE SCHEMA public AUTHORIZATION <user>
# - GRANT USAGE, CREATE
# - pg_restore (format custom)
# ───────────────────────────────────────────────────────────────────────────────
set +e
docker exec -i "$DB_CONT" sh -lc "
set -e
echo '[INFO] Prépare le schéma public (DROP/CREATE/GRANT)...'
psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -c \"DROP SCHEMA IF EXISTS public CASCADE;\"
psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -c \"CREATE SCHEMA public AUTHORIZATION $POSTGRES_USER;\"
psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -c \"GRANT USAGE, CREATE ON SCHEMA public TO $POSTGRES_USER;\"

echo '[INFO] Restauration avec pg_restore...'
pg_restore -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" /tmp/restore.dump

rm -f /tmp/restore.dump
" 2> >(tee /tmp/restore.err >&2)
rc=$?
set -e

if [[ $rc -ne 0 ]]; then
  echo
  echo "[ERR] La restauration a échoué."
  if grep -qiE 'could not .* lock|being accessed by other users|statement timeout|deadlock detected' /tmp/restore.err; then
    echo "[TIP] Des verrous sont probablement tenus par le backend."
    echo "      Arrête le backend puis relance cette commande."
    echo "      Ex.: docker compose --env-file .env -f docker-compose.${APP_ENV}.yml stop backend"
  fi
  exit "$rc"
fi

echo "[OK] Restauration terminée."
