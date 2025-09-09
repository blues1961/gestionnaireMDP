#!/usr/bin/env bash
set -euo pipefail

# ───────────────────────────────────────────────────────────────────────────────
# Config auto : lit .env (symlink actif) puis .env.${APP_ENV}.local si présent.
# ───────────────────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "[ERR] .env (symlink) introuvable à la racine du repo: $ROOT_DIR/.env" >&2
  exit 2
fi

# charge .env
set -a
# shellcheck source=/dev/null
. "$ROOT_DIR/.env"
set +a

: "${APP_ENV:?APP_ENV manquant dans .env (ex: dev|prod)}"
APP_SLUG="${APP_SLUG:-mdp}"
APP_SLUG_UP="${APP_SLUG^^}"   # ex. mdp -> MDP

# charge .env.${APP_ENV}.local si présent (prioritaire), sinon .env.local (legacy)
set -a
if [[ -f "$ROOT_DIR/.env.${APP_ENV}.local" ]]; then
  # shellcheck source=/dev/null
  . "$ROOT_DIR/.env.${APP_ENV}.local"
elif [[ -f "$ROOT_DIR/.env.local" ]]; then
  # shellcheck source=/dev/null
  . "$ROOT_DIR/.env.local"
fi
set +a

# ───────────────────────────────────────────────────────────────────────────────
# Sélection du dump : arg 1 ou dernier fichier ./backups/${APP_SLUG}_db.*.dump
# ───────────────────────────────────────────────────────────────────────────────
BACKUPS_DIR="${BACKUPS_DIR:-$ROOT_DIR/backups}"
DUMP_PATH="${1:-}"

# motif imposé par l'invariant de nommage
PATTERN="${BACKUPS_DIR}/${APP_SLUG}_db.*.dump"

if [[ -z "$DUMP_PATH" ]]; then
  # prend le plus récent par ordre de modification correspondant au motif
  if ! DUMP_PATH="$(ls -1t ${PATTERN} 2>/dev/null | head -n1)"; then
    echo "[ERR] Aucun dump compatible trouvé dans ${BACKUPS_DIR}/"
    echo "      Attendu: ${APP_SLUG}_db.YYYYMMDD-HHMMSS.dump  (ex: ${APP_SLUG}_db.20250906-230139.dump)"
    exit 2
  fi
  if [[ -z "${DUMP_PATH}" ]]; then
    echo "[ERR] Aucun dump compatible trouvé dans ${BACKUPS_DIR}/"
    echo "      Attendu: ${APP_SLUG}_db.YYYYMMDD-HHMMSS.dump"
    exit 2
  fi
  echo "[INFO] Aucun fichier fourni : sélection auto du plus récent → ${DUMP_PATH}"
else
  # valide le nom passé en argument
  BASENAME="$(basename -- "$DUMP_PATH")"
  if [[ ! "$BASENAME" =~ ^${APP_SLUG}_db\.[0-9]{8}-[0-9]{6}\.dump$ ]]; then
    echo "[ERR] Nom de dump invalide: ${BASENAME}"
    echo "      Attendu: ${APP_SLUG}_db.YYYYMMDD-HHMMSS.dump  (ex: ${APP_SLUG}_db.20250906-230139.dump)"
    echo "      Renomme le fichier ou fournis un dump conforme."
    exit 2
  fi
fi

if [[ ! -f "$DUMP_PATH" ]]; then
  echo "[ERR] Dump introuvable: $DUMP_PATH" >&2
  exit 2
fi

# Variables DB attendues (invariants POSTGRES_*)
: "${POSTGRES_DB:?POSTGRES_DB manquant}"
: "${POSTGRES_USER:?POSTGRES_USER manquant}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD manquant dans .env.${APP_ENV}.local}"

DB_CONT="${APP_SLUG}_db_${APP_ENV}"

echo "[*] ENV=${APP_ENV}  CONTAINER=${DB_CONT}  ${APP_SLUG_UP}_DB=${POSTGRES_DB}  USER=${POSTGRES_USER}"
echo "[*] Restore ${DUMP_PATH} -> ${APP_SLUG_UP}_DB=${POSTGRES_DB}"

# ───────────────────────────────────────────────────────────────────────────────
# Sanity check : le conteneur DB existe-t-il ?
# ───────────────────────────────────────────────────────────────────────────────
if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONT"; then
  echo "[ERR] Conteneur '$DB_CONT' introuvable ou arrêté."
  echo "      Démarre-le puis relance : ex."
  echo "      docker compose -f docker-compose.${APP_ENV}.yml --env-file .env up -d db"
  exit 3
fi

# ───────────────────────────────────────────────────────────────────────────────
# Copie du dump dans le conteneur
# ───────────────────────────────────────────────────────────────────────────────
docker cp "$DUMP_PATH" "$DB_CONT:/tmp/restore.dump"
echo "[OK] dump copié dans le conteneur"

# ───────────────────────────────────────────────────────────────────────────────
# Exec dans le conteneur DB :
# - DROP/CREATE schema public (+ GRANT)
# - pg_restore en ré-attribuant au rôle POSTGRES_USER
# ───────────────────────────────────────────────────────────────────────────────
set +e
docker exec -i "$DB_CONT" sh -lc "
set -e
export PGPASSWORD=\"$POSTGRES_PASSWORD\"

echo '[INFO] Prépare le schéma public (DROP/CREATE/GRANT)...'
psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -c \"DROP SCHEMA IF EXISTS public CASCADE;\"
psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -c \"CREATE SCHEMA public AUTHORIZATION $POSTGRES_USER;\"
psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -c \"GRANT USAGE, CREATE ON SCHEMA public TO $POSTGRES_USER;\"

echo '[INFO] Restauration avec pg_restore (--no-owner --role=$POSTGRES_USER)...'
pg_restore --no-owner --role=\"$POSTGRES_USER\" -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" /tmp/restore.dump

rm -f /tmp/restore.dump
" 2> >(tee /tmp/restore.err >&2)
rc=$?
set -e

if [[ $rc -ne 0 ]]; then
  echo
  echo "[ERR] La restauration a échoué."
  if grep -qiE 'could not .* lock|being accessed by other users|statement timeout|deadlock detected' /tmp/restore.err; then
    echo "[TIP] Des verrous sont probablement tenus par le backend."
    echo "      Arrête le backend puis relance cette commande. Ex. :"
    echo "      docker compose --env-file .env -f docker-compose.${APP_ENV}.yml stop backend"
  fi
  exit "$rc"
fi

echo "[OK] Restauration terminée."
