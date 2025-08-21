#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
. ./.env.prod
set +a

FRONTEND_DIR="./frontend"
BUILD_DIR="$FRONTEND_DIR/dist"
DEPLOY_DIR="/var/www/app.mon-site.ca"

pushd "$FRONTEND_DIR" >/dev/null
  echo "Build du frontend avec VITE_API_BASE=$API_BASE"
  export VITE_API_BASE="$API_BASE"
  npm ci
  npm run build
popd >/dev/null

sudo rsync -a --delete "$BUILD_DIR"/ "$DEPLOY_DIR"/
sudo systemctl reload apache2

echo "✅ Frontend déployé dans $DEPLOY_DIR et Apache rechargé"
