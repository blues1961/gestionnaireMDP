#!/usr/bin/env bash
set -euo pipefail

# ========= Config par défaut (surchargeables via l'env) =========
: "${APP_ENV:=dev}"
: "${ENV_FILE:=.env.dev.local}"
: "${COMPOSE_FILE:=docker-compose.dev.yml}"
: "${DB_SERVICE:=mdp_db}"
: "${BACKEND_SERVICE:=mdp_backend}"
: "${DUMP:=}"     # si vide -> dernier dump dans backups/

# ========= Helpers =========
dc() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

log() { printf "%s %s\n" "[INFO]" "$*"; }
err() { printf "%s %s\n" "[ERR ]" "$*" >&2; }

# ========= Sanity =========
if [[ "$APP_ENV" != "dev" ]]; then
  err "APP_ENV=$APP_ENV. Par sécurité, n’exécute que sur dev (export APP_ENV=dev)"; exit 2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  err "ENV_FILE introuvable: $ENV_FILE"; exit 2
fi

# Charge quelques variables utiles (si présentes)
export $(grep -E '^(POSTGRES_DB|POSTGRES_USER)=' "$ENV_FILE" | sed 's/#.*//' || true)

: "${POSTGRES_DB:=mdp_dev}"
: "${POSTGRES_USER:=mdpuser}"

# Sélection du dump si non fourni
if [[ -z "${DUMP}" ]]; then
  DUMP="$(ls -1t backups/*.sql backups/*.sql.gz 2>/dev/null | head -n1 || true)"
fi
if [[ -z "${DUMP}" || ! -f "$DUMP" ]]; then
  err "Aucun dump trouvé. Place un fichier dans ./backups ou passe DUMP=/chemin/mon_dump.sql(.gz)"
  exit 2
fi

log "APP_ENV=$APP_ENV | ENV_FILE=$ENV_FILE | COMPOSE_FILE=$COMPOSE_FILE"
log "DB_SERVICE=$DB_SERVICE | BACKEND_SERVICE=$BACKEND_SERVICE"
log "POSTGRES_DB=$POSTGRES_DB | POSTGRES_USER=$POSTGRES_USER"
log "Dump = $DUMP"

# ========= Étapes =========
log "1) Stop $BACKEND_SERVICE pour libérer la DB"
dc stop "$BACKEND_SERVICE" >/dev/null || true

log "2) S'assure que $DB_SERVICE est up"
dc up -d "$DB_SERVICE" >/dev/null

log "3) (Re)création propre de la base avec TEMPLATE=template0 (évite les soucis de collation)"
dc exec -T "$DB_SERVICE" sh -lc '
  set -e
  psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";" \
    -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\" TEMPLATE template0;"
'

log "4) Restauration du dump dans $POSTGRES_DB"
if [[ "$DUMP" == *.gz ]]; then
  gzip -dc "$DUMP" | dc exec -T "$DB_SERVICE" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
else
  cat "$DUMP" | dc exec -T "$DB_SERVICE" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
fi

log "5) Redémarre $BACKEND_SERVICE + migrations (idempotent)"
dc up -d "$BACKEND_SERVICE" >/dev/null
dc exec -T "$BACKEND_SERVICE" python manage.py migrate --noinput || true

log "6) Compteurs rapides"
dc exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select count(*) as passwords  from api_passwordentry;" \
  -c "select count(*) as categories from api_category;"

log "OK: restauration terminée."
