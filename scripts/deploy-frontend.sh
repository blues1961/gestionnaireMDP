#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib/env_detect.sh"
env_detect_init
echo "INFO: APP_ENV=$APP_ENV | ENV_FILE=$ENV_FILE | COMPOSE_FILE=$COMPOSE_FILE"


VITE_API_BASE="$(read_env VITE_API_BASE || true)"; VITE_API_BASE="${VITE_API_BASE:-/api}"


FRONTEND_DIR="./frontend"
BUILD_DIR="$FRONTEND_DIR/dist"
DEPLOY_DIR="/var/www/app.mon-site.ca"


pushd "$FRONTEND_DIR" >/dev/null
export VITE_API_BASE
npm ci
npm run build
popd >/dev/null


sudo rsync -a --delete "$BUILD_DIR"/ "$DEPLOY_DIR"/
if systemctl status apache2 >/dev/null 2>&1; then sudo systemctl reload apache2 || true; fi


echo "OK: Frontend deployed to $DEPLOY_DIR (VITE_API_BASE=$VITE_API_BASE)"