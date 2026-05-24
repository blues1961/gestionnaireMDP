#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "ERREUR: $1" >&2
  exit 1
}

[ -f "INVARIANTS.md" ] || fail "INVARIANTS.md est manquant"
[ -f ".env.template.example" ] || fail ".env.template.example est manquant"
[ -f ".env.template" ] || fail ".env.template est manquant"
[ -f ".env.dev" ] || fail ".env.dev est manquant"
[ -f ".env.prod" ] || fail ".env.prod est manquant"
[ -f ".env.local" ] || fail ".env.local est manquant"
[ -L ".env" ] || fail ".env doit être un lien symbolique vers .env.dev ou .env.prod"

TARGET="$(readlink .env)"
if [ "$TARGET" != ".env.dev" ] && [ "$TARGET" != ".env.prod" ]; then
  fail ".env doit pointer vers .env.dev ou .env.prod"
fi

set -a
. .env
set +a

[ -n "${APP_NAME:-}" ] || fail "APP_NAME est manquant"
[ -n "${APP_SLUG:-}" ] || fail "APP_SLUG est manquant"
[ -n "${APP_DEPOT:-}" ] || fail "APP_DEPOT est manquant"
[ -n "${APP_NO:-}" ] || fail "APP_NO est manquant"
[ -n "${APP_ENV:-}" ] || fail "APP_ENV est manquant"

[ "$APP_ENV" = "dev" ] || [ "$APP_ENV" = "prod" ] || fail "APP_ENV doit être dev ou prod"

EXPECTED_DB_PORT=$((5432 + APP_NO))
EXPECTED_VITE_PORT=$((5173 + APP_NO))
EXPECTED_API_PORT=$((8000 + APP_NO + 1))

if [ "$APP_ENV" = "dev" ]; then
  [ "${DEV_DB_PORT:-}" = "$EXPECTED_DB_PORT" ] || fail "DEV_DB_PORT devrait être $EXPECTED_DB_PORT"
  [ "${DEV_VITE_PORT:-}" = "$EXPECTED_VITE_PORT" ] || fail "DEV_VITE_PORT devrait être $EXPECTED_VITE_PORT"
  [ "${DEV_API_PORT:-}" = "$EXPECTED_API_PORT" ] || fail "DEV_API_PORT devrait être $EXPECTED_API_PORT"
fi

[ "${POSTGRES_USER:-}" = "${APP_SLUG}_pg_user" ] || fail "POSTGRES_USER devrait être ${APP_SLUG}_pg_user"
[ "${POSTGRES_DB:-}" = "${APP_SLUG}_pg_db" ] || fail "POSTGRES_DB devrait être ${APP_SLUG}_pg_db"
[ "${VITE_API_BASE:-}" = "/api" ] || fail "VITE_API_BASE devrait être /api"

if [ "$APP_ENV" = "prod" ]; then
  [ "${PROD_DB_PORT:-}" = "$EXPECTED_DB_PORT" ] || fail "PROD_DB_PORT devrait être $EXPECTED_DB_PORT"
  [ "${PROD_API_PORT:-}" = "$EXPECTED_API_PORT" ] || fail "PROD_API_PORT devrait être $EXPECTED_API_PORT"
  [ "${PROD_FRONT_PORT:-}" = "$((8079 + APP_NO))" ] || fail "PROD_FRONT_PORT devrait être $((8079 + APP_NO))"
  [ -n "${TRAEFIK_DOCKER_NETWORK:-}" ] || fail "TRAEFIK_DOCKER_NETWORK est manquant en prod"
fi

[ -f "docker-compose.dev.yml" ] || fail "docker-compose.dev.yml est manquant"
[ -f "docker-compose.prod.yml" ] || fail "docker-compose.prod.yml est manquant"

SERVICES="$(docker compose --env-file .env.dev -f docker-compose.dev.yml config --services)"
printf '%s\n' "$SERVICES" | grep -qx "db" || fail "Le service db doit exister en dev"
printf '%s\n' "$SERVICES" | grep -qx "backend" || fail "Le service backend doit exister en dev"
printf '%s\n' "$SERVICES" | grep -qx "frontend" || fail "Le service frontend doit exister en dev"
if printf '%s\n' "$SERVICES" | grep -qx "vite"; then
  fail "Le service vite ne doit plus exister en dev"
fi

PROD_CONFIG="$(
  set -a
  . ./.env.prod
  set +a
  docker compose --env-file .env.prod -f docker-compose.prod.yml config
)"
printf '%s\n' "$PROD_CONFIG" | grep -q "container_name: ${APP_SLUG}_db_prod" || fail "Le conteneur prod db doit suivre ${APP_SLUG}_db_prod"
printf '%s\n' "$PROD_CONFIG" | grep -q "container_name: ${APP_SLUG}_backend_prod" || fail "Le conteneur prod backend doit suivre ${APP_SLUG}_backend_prod"
printf '%s\n' "$PROD_CONFIG" | grep -q "container_name: ${APP_SLUG}_frontend_prod" || fail "Le conteneur prod frontend doit suivre ${APP_SLUG}_frontend_prod"
printf '%s\n' "$PROD_CONFIG" | grep -q "name: ${APP_SLUG}_appnet" || fail "Le réseau appnet prod doit suivre ${APP_SLUG}_appnet"
printf '%s\n' "$PROD_CONFIG" | grep -q "name: ${APP_SLUG}_prod_pgdata" || fail "Le volume prod pgdata doit suivre ${APP_SLUG}_prod_pgdata"
if rg -n 'container_name:\s*mdp_|name:\s*mdp_prod_pgdata|traefik\.http\.(routers|services|middlewares)\.mdp-' docker-compose.prod.yml >/dev/null; then
  fail "docker-compose.prod.yml ne doit plus figer des noms ou labels mdp_*"
fi

grep -q "^\.env$" .gitignore || fail ".gitignore doit ignorer .env"
grep -q "^\.env.local$" .gitignore || fail ".gitignore doit ignorer .env.local"

echo "OK: invariants valides pour APP_ENV=$APP_ENV"
