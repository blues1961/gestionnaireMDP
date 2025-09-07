#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SLUG="${APP_SLUG:-mdp}"

# --- auto-détection de l'env (dev/prod) ---
detect_env() {
  # priorité à la variable d'override si définie
  if [[ "${ENV_OVERRIDE:-}" == "prod" || "${ENV_OVERRIDE:-}" == "dev" ]]; then
    echo "$ENV_OVERRIDE"; return
  fi

  local dev_cont="${APP_SLUG}_db_dev"
  local prod_cont="${APP_SLUG}_db_prod"
  local dev_running="" prod_running=""

  dev_running="$(docker ps --format '{{.Names}}' | grep -E "^${dev_cont}\$" || true)"
  prod_running="$(docker ps --format '{{.Names}}' | grep -E "^${prod_cont}\$" || true)"

  if [[ -n "$dev_running" && -z "$prod_running" ]]; then echo "dev"; return; fi
  if [[ -z "$dev_running" && -n "$prod_running" ]]; then echo "prod"; return; fi
  # si les deux (ou aucun) → défaut dev
  echo "dev"
}

ENV="$(detect_env)"
DB_CONT="${APP_SLUG}_db_${ENV}"

# --- charger les variables de l'env ---
set -a
source "$ROOT_DIR/.env.$ENV"
[[ -f "$ROOT_DIR/.env.$ENV.local" ]] && source "$ROOT_DIR/.env.$ENV.local"
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$ROOT_DIR/backups"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/db.$STAMP.dump"

echo "[*] ENV=$ENV  CONTAINER=$DB_CONT  DB=$POSTGRES_DB  USER=$POSTGRES_USER"
echo "[*] Dump -> $FILE"

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONT" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c -f /tmp/backup.dump

docker cp "$DB_CONT:/tmp/backup.dump" "$FILE"
docker exec "$DB_CONT" rm -f /tmp/backup.dump
echo "[OK] $FILE"
