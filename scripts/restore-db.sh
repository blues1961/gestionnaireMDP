#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "[ERR] .env (symlink) introuvable à la racine du repo: $ROOT_DIR/.env" >&2
  exit 2
fi

cd "$ROOT_DIR"

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

select_latest_backup() {
  local -a matches=()
  local glob
  for glob in "$@"; do
    while IFS= read -r path; do
      matches+=("$path")
    done < <(compgen -G "$glob" || true)
  done
  if ((${#matches[@]} == 0)); then
    return 1
  fi
  LC_ALL=C ls -1t -- "${matches[@]}" 2>/dev/null | head -n1
}

detect_backup_kind() {
  local base="$1"
  local slug="$2"
  local stamp
  if [[ "$base" == "${slug}_db-"*".sql.gz" ]]; then
    stamp="${base#${slug}_db-}"
    stamp="${stamp%.sql.gz}"
    if [[ "$stamp" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
      printf 'sql.gz\n'
      return 0
    fi
  elif [[ "$base" == "${slug}_db-"*".sql" ]]; then
    stamp="${base#${slug}_db-}"
    stamp="${stamp%.sql}"
    if [[ "$stamp" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
      printf 'sql\n'
      return 0
    fi
  elif [[ "$base" == "${slug}_db."*".dump" ]]; then
    stamp="${base#${slug}_db.}"
    stamp="${stamp%.dump}"
    if [[ "$stamp" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
      printf 'dump\n'
      return 0
    fi
  fi
  return 1
}

# ───────────────────────────────────────────────────────────────────────────────
# Sélection du backup : arg 1 ou dernier fichier ./backups/${APP_SLUG}_db-*.sql.gz
# ───────────────────────────────────────────────────────────────────────────────
BACKUPS_DIR="${BACKUPS_DIR:-$ROOT_DIR/backups}"
DUMP_PATH="${1:-}"
BACKUP_KIND=""

if [[ -z "$DUMP_PATH" ]]; then
  if ! DUMP_PATH="$(select_latest_backup \
    "${BACKUPS_DIR}/${APP_SLUG}_db-*.sql.gz" \
    "${BACKUPS_DIR}/${APP_SLUG}_db-*.sql" \
    "${BACKUPS_DIR}/${APP_SLUG}_db.*.dump" \
    "${BACKUPS_DIR}/db-*.dump" \
  )"; then
    echo "[ERR] Aucun backup compatible trouvé dans ${BACKUPS_DIR}/" >&2
    echo "      Attendu: ${APP_SLUG}_db-YYYYMMDD-HHMMSS.sql.gz (format actuel)" >&2
    echo "      Legacy accepté: ${APP_SLUG}_db.YYYYMMDD-HHMMSS.dump" >&2
    exit 2
  fi
  echo "[INFO] Aucun fichier fourni : sélection auto du plus récent → ${DUMP_PATH}"
else
  if [[ ! -f "$DUMP_PATH" && -f "$ROOT_DIR/$DUMP_PATH" ]]; then
    DUMP_PATH="$ROOT_DIR/$DUMP_PATH"
  fi
fi

if [[ ! -f "$DUMP_PATH" ]]; then
  echo "[ERR] Backup introuvable: $DUMP_PATH" >&2
  exit 2
fi

BASENAME="$(basename -- "$DUMP_PATH")"
if ! BACKUP_KIND="$(detect_backup_kind "$BASENAME" "$APP_SLUG")"; then
  echo "[ERR] Nom de backup invalide: ${BASENAME}" >&2
  echo "      Attendu: ${APP_SLUG}_db-YYYYMMDD-HHMMSS.sql.gz (nouveau format)" >&2
  echo "      Legacy accepté: ${APP_SLUG}_db.YYYYMMDD-HHMMSS.dump" >&2
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
  echo "[ERR] Conteneur '$DB_CONT' introuvable ou arrêté." >&2
  echo "      Démarre-le puis relance : ex.\n      docker compose -f docker-compose.${APP_ENV}.yml --env-file .env up -d db" >&2
  exit 3
fi

TMP_ERR="$(mktemp)"
cleanup() {
  rm -f "$TMP_ERR"
}
trap cleanup EXIT

handle_restore_failure() {
  local rc="$1"
  echo
  echo "[ERR] La restauration a échoué."
  if grep -qiE 'could not .* lock|being accessed by other users|statement timeout|deadlock detected' "$TMP_ERR"; then
    echo "[TIP] Des verrous sont probablement tenus par le backend."
    echo "      Arrête le backend puis relance cette commande. Ex. :"
    echo "      docker compose --env-file .env -f docker-compose.${APP_ENV}.yml stop backend"
  fi
  exit "$rc"
}

: > "$TMP_ERR"
set +e
docker exec -i "$DB_CONT" sh -lc "
set -e
export PGPASSWORD=\"$POSTGRES_PASSWORD\"

echo '[INFO] Prépare le schéma public (DROP/CREATE/GRANT)...'
psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -c 'DROP SCHEMA IF EXISTS public CASCADE;'
psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -c 'CREATE SCHEMA public AUTHORIZATION $POSTGRES_USER;'
psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -c 'GRANT USAGE, CREATE ON SCHEMA public TO $POSTGRES_USER;'
" 2> >(tee "$TMP_ERR" >&2)
rc=$?
set -e
(( rc == 0 )) || handle_restore_failure "$rc"

case "$BACKUP_KIND" in
  sql.gz)
    echo "[INFO] Injection via psql depuis archive compressée (.sql.gz)"
    : > "$TMP_ERR"
    set +e
    gunzip -c "$DUMP_PATH" | docker exec -i "$DB_CONT" sh -lc "
set -e
export PGPASSWORD=\"$POSTGRES_PASSWORD\"
psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\"
" 2> >(tee "$TMP_ERR" >&2)
    rc=$?
    set -e
    (( rc == 0 )) || handle_restore_failure "$rc"
    ;;
  sql)
    echo "[INFO] Injection via psql depuis fichier .sql"
    : > "$TMP_ERR"
    set +e
    cat "$DUMP_PATH" | docker exec -i "$DB_CONT" sh -lc "
set -e
export PGPASSWORD=\"$POSTGRES_PASSWORD\"
psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\"
" 2> >(tee "$TMP_ERR" >&2)
    rc=$?
    set -e
    (( rc == 0 )) || handle_restore_failure "$rc"
    ;;
  dump)
    RESTORE_TMP="/tmp/restore.dump"
    echo "[INFO] Legacy pg_dump custom format détecté (.dump) → pg_restore"
    docker cp "$DUMP_PATH" "$DB_CONT:$RESTORE_TMP"
    : > "$TMP_ERR"
    set +e
    docker exec -i "$DB_CONT" sh -lc "
set -e
export PGPASSWORD=\"$POSTGRES_PASSWORD\"
pg_restore --no-owner --role=\"$POSTGRES_USER\" -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" \"$RESTORE_TMP\"
" 2> >(tee "$TMP_ERR" >&2)
    rc=$?
    set -e
    docker exec "$DB_CONT" rm -f "$RESTORE_TMP" >/dev/null 2>&1 || true
    (( rc == 0 )) || handle_restore_failure "$rc"
    ;;
  *)
    echo "[ERR] Format de backup non supporté: $BACKUP_KIND" >&2
    exit 2
    ;;
esac

echo "[OK] Restauration terminée."
