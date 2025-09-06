#!/usr/bin/env bash
set -euo pipefail
APP_DIR="/opt/apps/gestionnaire_mdp_zero_knowledge"
cd "$APP_DIR"

echo "== Pull code =="
git pull --ff-only

echo "== Backup DB (prod) =="
./scripts/backup-db.sh || true

echo "== Pull images =="
docker compose -f docker-compose.prod.yml --env-file .env.prod pull backend mdp_frontend_prod

echo "== Up services =="
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend mdp_frontend_prod

echo "== Health checks =="
for i in $(seq 1 30); do
  if curl -fsSI -H "X-Forwarded-Proto: https" http://127.0.0.1:9004/api/csrf/ \
      | head -n1 | grep -qE ' 204| 200'; then
    echo "Backend OK"
    break
  fi
  sleep 2
  [ $i -eq 30 ] && echo "Backend pas prêt" && exit 1
done
curl -fsSI http://127.0.0.1:9082/ | head -n1

echo "OK"
