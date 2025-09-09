#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 1) Charger l'env actif via le symlink .env (invariant) + secrets .env.$APP_ENV.local
if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "[ERR] .env (symlink) introuvable à la racine: $ROOT_DIR/.env" >&2
  exit 2
fi
set -a
# shellcheck source=/dev/null
. "$ROOT_DIR/.env"
set +a

: "${APP_ENV:?APP_ENV manquant dans .env (ex: dev|prod)}"
APP_SLUG="${APP_SLUG:-mdp}"
APP_SLUG_UP="${APP_SLUG^^}"

# Secrets selon l'env
if [[ -f "$ROOT_DIR/.env.${APP_ENV}.local" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$ROOT_DIR/.env.${APP_ENV}.local"
  set +a
fi

# 2) Vérifs invariants DB
: "${POSTGRES_DB:?POSTGRES_DB manquant}"
: "${POSTGRES_USER:?POSTGRES_USER manquant}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD manquant dans .env.${APP_ENV}.local}"

DB_CONT="${APP_SLUG}_db_${APP_ENV}"

# 3) Sanity check conteneur
if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONT"; then
  echo "[ERR] Conteneur '$DB_CONT' introuvable ou arrêté."
  echo "      Démarre-le puis relance. Ex.:"
  echo "      docker compose -f docker-compose.${APP_ENV}.yml --env-file .env up -d db"
  exit 3
fi

# 4) Préparer le chemin de sortie conforme: <repo>/backups/<app_slug>_db.YYYYMMDD-HHMMSS.dump
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$ROOT_DIR/backups"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/${APP_SLUG}_db.${STAMP}.dump"

echo "[*] ENV=${APP_ENV}  CONTAINER=${DB_CONT}  ${APP_SLUG_UP}_DB=${POSTGRES_DB}  USER=${POSTGRES_USER}"
echo "[*] Dump -> ${FILE}"

# 5) pg_dump dans le conteneur (format custom), copie locale, nettoyage
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONT" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c -f /tmp/backup.dump

docker cp "$DB_CONT:/tmp/backup.dump" "$FILE"
docker exec "$DB_CONT" rm -f /tmp/backup.dump

# 6) Validation du fichier
if [[ ! -s "$FILE" ]]; then
  echo "[ERR] Fichier de dump vide ou introuvable: $FILE" >&2
  exit 4
fi

echo "[OK] ${FILE}"
