#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -L .env && "$(readlink .env)" == '.env.dev' ]] || { echo 'Activer le développement avec make dev.' >&2; exit 1; }
set -a
. ./.env.dev
set +a
[[ "$APP_ENV" == dev ]] || { echo 'Test réservé au développement.' >&2; exit 1; }
if [[ "${KEY_MIGRATION_BROWSER:-0}" == 1 ]]; then
  command -v node >/dev/null || { echo 'Node requis sur l’hôte pour la recette navigateur.' >&2; exit 1; }
  [[ -f "${PLAYWRIGHT_MODULE:-}" ]] || { echo 'PLAYWRIGHT_MODULE doit désigner le module Playwright externe (voir README_DEV).' >&2; exit 1; }
fi
compose=(docker compose --env-file .env.dev -f docker-compose.dev.yml)
"${compose[@]}" exec -T backend python manage.py migrate --check
run_id="$(cat /proc/sys/kernel/random/uuid)"
created=0
cleanup() {
  if [[ "$created" == 1 ]]; then
    "${compose[@]}" exec -T backend python manage.py key_migration_fixture cleanup --run-id "$run_id" || {
      echo "Nettoyage à reprendre : make cleanup-key-migration RUN_ID=$run_id" >&2
      return 1
    }
  fi
}
trap cleanup EXIT
printf 'Test de migration sur fixtures, identifiant de reprise : %s\n' "$run_id"
"${compose[@]}" exec -T backend python manage.py key_migration_fixture prepare --run-id "$run_id"
created=1
if [[ "${KEY_MIGRATION_BROWSER:-0}" == 1 ]]; then
  KEY_MIGRATION_RUN_ID="$run_id" MIGRATION_TEST_BASE="http://127.0.0.1:${DEV_VITE_PORT:-5174}/api/" node frontend/tests/key-migration-browser.mjs
else
  "${compose[@]}" exec -T -e "KEY_MIGRATION_RUN_ID=$run_id" -e 'MIGRATION_TEST_BASE=http://frontend:5173/api/' frontend node tests/key-migration-live.mjs
fi
