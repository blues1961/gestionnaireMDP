# DEV standard (mdp)

## Démarrer
ln -sfn .env.dev .env
set -a; . .env.dev; [ -f .env.local ] && . .env.local; set +a
docker compose -f docker-compose.dev.yml up -d --build

## Commandes utiles
./scripts/common/ps.sh
SVC=backend ./scripts/common/restart.sh
./scripts/common/logs.sh
./scripts/common/psql.sh

## Superuser (variables dans .env.local)
ADMIN_USERNAME=…  ADMIN_PASSWORD=…  ADMIN_EMAIL=…
./scripts/dev/superuser.sh

## URLs (DEV)
UI: http://localhost:5275
API: http://localhost:9004
Admin: http://localhost:9004/admin/
