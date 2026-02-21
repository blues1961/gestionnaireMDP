# DEV standard (mdp)

## Démarrer
make create-env            # génère .env.dev + .env.prod (FORCE=1 pour écraser, voir docs/create-env.md)
cp .env.local.example .env.local
make init-secret        # génère des secrets aléatoires hors ADMIN_* et synchronise PostgreSQL
ln -sfn .env.dev .env
set -a; . .env.dev; [ -f .env.local ] && . .env.local; set +a
docker compose -f docker-compose.dev.yml up -d --build

> `make init-secret` prend `.env.local.example` comme référence, régénère des valeurs aléatoires pour toutes les variables sauf `ADMIN_*`, puis applique automatiquement le nouveau `POSTGRES_PASSWORD` dans la base (conteneur `db`).  
> Définir `INIT_SECRET_UPDATE_DB=0` pour sauter la mise à jour de la DB si nécessaire.

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
