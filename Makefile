# Makefile — Calendrier (aligné sur INVARIANTS)
# - .env est un symlink vers .env.<env> (ex: .env.dev)
# - Services Compose fixes: db, backend, vite
# - Secrets seulement dans .env.<env>.local
# - Front utilise /api (chemin relatif), Vite proxy -> backend:8000

SHELL := /bin/bash
.ONESHELL:
.DEFAULT_GOAL := help

# Détecte l'environnement courant via le symlink .env
APP_ENV := $(shell . ./.env; echo $$APP_ENV)
COMPOSE := docker compose --env-file .env.$(APP_ENV) -f docker-compose.$(APP_ENV).yml
TREE_IGNORE := .git|node_modules|dist|__pycache__|.mypy_cache|.pytest_cache|.venv|backups|project-tree-*.txt|*.py[co]|*.sqlite3|*.log|*.cache|*.cookies|*.sql|*.sql.gz|*.dump|*.bak

.PHONY: help env-check \
 tree \
 up down stop start restart ps logs sh migrate createsuperuser whoami token-test \
 backup-db restore-db push-secret push-secret-all-remote push-secret-single pull-secret pull-secret-all-remote pull-secret-single init-root-secret backup-env restore-env reset-dev-db seed-dev psql \
 up-backend up-db up-vite stop-backend stop-db stop-vite restart-backend restart-db restart-vite \
 logs-backend logs-db logs-vite exec-backend exec-db exec-vite clean reseed rebuild

help: ## Liste les commandes disponibles
	@echo -e "Usage: make <target>\n"
	@grep -E '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) \
	 | sed -E 's/^([a-zA-Z0-9_-]+):.*## (.*)$$/\1\t\2/' \
	 | sort -f \
	 | awk -F'\t' '{printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

tree: ## Arborescence du projet (4 niveaux, ignore les artefacts courants)
	@tree -L 4 --dirsfirst --prune -I "$(TREE_IGNORE)"

env-check: ## Vérifie .env -> .env.$(APP_ENV) et docker-compose.$(APP_ENV).yml
	test -L .env || { echo "Symlink .env manquant (ex: ln -snf .env.dev .env)"; exit 1; }
	test -f .env.$(APP_ENV) || { echo ".env.$(APP_ENV) introuvable"; exit 1; }
	test -f docker-compose.$(APP_ENV).yml || { echo "docker-compose.$(APP_ENV).yml introuvable"; exit 1; }

up: env-check ## Démarre la stack (db, backend, vite)
	$(COMPOSE) up -d --build

start: up ## Alias de up

down: env-check ## Stoppe et supprime la stack
	$(COMPOSE) down

stop: down ## Alias de down

restart: env-check ## Redémarre les services
	$(COMPOSE) restart

ps: env-check ## Statut des conteneurs
	$(COMPOSE) ps

ps-ports: env-check ## Conteneurs (nom → ports, triés)
	docker ps --format '{{.Names}}\t{{.Ports}}' \
	  | sort \
	  | column -t -s $$'\t'

logs: env-check ## Logs suivis (tous les services)
	$(COMPOSE) logs -f --tail=200

sh: env-check ## Shell dans le backend
	$(COMPOSE) exec backend bash || $(COMPOSE) run --rm backend bash

migrate: env-check ## Django: migrations
	$(COMPOSE) exec -T backend python manage.py migrate

createsuperuser: env-check ## Crée/MAJ admin via ADMIN_* (.env.<env>.local)
	set -a ; . ./.env ; [ -f ./.env.$(APP_ENV).local ] && . ./.env.$(APP_ENV).local || true ; set +a ; \
	$(COMPOSE) exec -T \
	  -e ADMIN_USERNAME="$$ADMIN_USERNAME" \
	  -e ADMIN_EMAIL="$$ADMIN_EMAIL" \
	  -e ADMIN_PASSWORD="$$ADMIN_PASSWORD" \
	  backend python manage.py shell -c 'import os; from django.contrib.auth import get_user_model; U=get_user_model(); u=os.getenv("ADMIN_USERNAME") or "admin"; e=os.getenv("ADMIN_EMAIL") or "admin@example.com"; p=os.getenv("ADMIN_PASSWORD") or "changeme"; obj,_=U.objects.update_or_create(username=u, defaults={"email":e}); obj.set_password(p); obj.is_staff=True; obj.is_superuser=True; obj.save(); print(f"superuser OK: {obj.username}")'

whoami: env-check ## Test /api/whoami (via port API)
	PORT=$$(. ./.env; echo $$DEV_API_PORT); curl -sS "http://localhost:$$PORT/api/whoami/" | jq . || true

token-test: env-check ## JWT create -> whoami (DEV)
	set -a ; . ./.env ; [ -f ./.env.$(APP_ENV).local ] && . ./.env.$(APP_ENV).local || true ; set +a ; \
	curl -sS "http://localhost:$$DEV_API_PORT/api/auth/jwt/create/" \
	  -H 'Content-Type: application/json' \
	  -d "$$(jq -n --arg u "$$ADMIN_USERNAME" --arg p "$$ADMIN_PASSWORD" '{username:$$u, password:$$p}')" \
	  | tee /tmp/jwt.json >/dev/null ; \
	ACC=$$(jq -r '.access // empty' /tmp/jwt.json) ; test -n "$$ACC" || { echo "Échec JWT"; exit 1; } ; \
	curl -sS "http://localhost:$$DEV_API_PORT/api/whoami/" -H "Authorization: Bearer $$ACC" | jq .

# Sauvegarde / restauration DB (DEV)
backups-dir:
	mkdir -p backups

backup-db: env-check backups-dir ## Sauvegarder la DB de dev -> backups/<app_slug>_db-<ts>.sql.gz
	set -a ; . ./.env ; [ -f ./.env.$(APP_ENV).local ] && . ./.env.$(APP_ENV).local || true ; set +a ; \
	SLUG=$${APP_SLUG:-mdp} ; TS=$$(date +%Y%m%d-%H%M%S) ; OUT=$${OUT:-backups/$${SLUG}_db-$$TS.sql.gz} ; \
	echo "Backup -> $$OUT" ; \
	$(COMPOSE) exec -T db pg_dump -U "$$POSTGRES_USER" "$$POSTGRES_DB" | gzip > "$$OUT"

restore-db: env-check ## Restaurer la DB depuis BACKUP=<fichier.{sql.gz,dump}> (dernier par défaut)
	set -a ; . ./.env ; [ -f ./.env.$(APP_ENV).local ] && . ./.env.$(APP_ENV).local || true ; set +a ; \
	SLUG=$${APP_SLUG:-mdp} ; PATTERN_DESC=backups/$${SLUG}_db-<timestamp>.sql.gz ; \
	FILE=$${BACKUP:-$$(ls -1t backups/$${SLUG}_db-*.sql.gz backups/$${SLUG}_db-*.sql backups/$${SLUG}_db.*.dump backups/db-*.dump backups/*.dump 2>/dev/null | head -n1)} ; \
	test -n "$$FILE" -a -f "$$FILE" || { echo "Aucun backup trouvé ($$PATTERN_DESC) ou BACKUP invalide"; exit 1; } ; \
	echo "Restore <- $$FILE" ; \
	$(COMPOSE) exec -T db psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' ; \
	case "$$FILE" in \
	  *.sql.gz) gunzip -c "$$FILE" | $(COMPOSE) exec -T db psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" ;; \
	  *.sql)    $(COMPOSE) exec -T db psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < "$$FILE" ;; \
	  *.dump)   $(COMPOSE) exec -T db pg_restore -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" --no-owner --no-privileges < "$$FILE" ;; \
	  *)        echo "Format de backup non supporté: $$FILE"; exit 1 ;; \
	esac

push-secret: env-check ## Sauvegarder dev+prod vers l'API de prod (/api/secrets)
	set -euo pipefail
	PROD_HOST="$$(set -a; . ./.env.prod; set +a; echo "$$APP_HOST")"
	API_BASE_URL="$${API_BASE_URL:-https://$${PROD_HOST}/api}"
	echo "Push secret bundles vers: $$API_BASE_URL (dev + prod)"
	API_BASE_URL="$$API_BASE_URL" BUNDLE_ENV=dev ./scripts/push-secret.sh dev
	API_BASE_URL="$$API_BASE_URL" BUNDLE_ENV=prod ./scripts/push-secret.sh prod

push-secret-all-remote: push-secret ## Alias de compatibilite (dev+prod vers API de prod)

push-secret-single: env-check ## Sauvegarder un seul env (SECRET_ENV=dev|prod, mode legacy)
	./scripts/push-secret.sh $${SECRET_ENV:-$(APP_ENV)}

pull-secret: env-check ## Restaurer dev+prod depuis l'API de prod (/api/secrets)
	set -euo pipefail
	PROD_HOST="$$(set -a; . ./.env.prod; set +a; echo "$$APP_HOST")"
	API_BASE_URL="$${API_BASE_URL:-https://$${PROD_HOST}/api}"
	echo "Pull secret bundles depuis: $$API_BASE_URL (dev + prod)"
	API_BASE_URL="$$API_BASE_URL" BUNDLE_ENV=dev FORCE="$${FORCE:-0}" ./scripts/pull-secret.sh dev
	API_BASE_URL="$$API_BASE_URL" BUNDLE_ENV=prod FORCE="$${FORCE:-0}" ./scripts/pull-secret.sh prod
	ln -snf ".env.$(APP_ENV)" ./.env
	echo ".env -> .env.$(APP_ENV)"

pull-secret-all-remote: pull-secret ## Alias de compatibilite (dev+prod depuis API de prod)

pull-secret-single: env-check ## Restaurer un seul env (SECRET_ENV=dev|prod, mode legacy)
	./scripts/pull-secret.sh $${SECRET_ENV:-$(APP_ENV)}

init-root-secret: ## Générer PULL_ROOT_SECRET dans .env.root.local (FORCE=1 pour régénérer)
	./scripts/init-pull-root-secret.sh

backup-env: push-secret ## Alias de push-secret

restore-env: pull-secret ## Alias de pull-secret

reset-dev-db: env-check ## Réinitialiser la DB de dev (drop/create/migrate)
	bash scripts/dev/reset-dev-db.sh

seed-dev: env-check ## Injecter des données de test
	bash scripts/dev/seed-dev.sh

psql: env-check ## psql dans le conteneur DB
	$(COMPOSE) exec db psql -U $$(. ./.env; echo $$POSTGRES_USER) -d $$(. ./.env; echo $$POSTGRES_DB)

# --- Shortcuts courants
reseed: env-check ## (db) Réinitialise puis ré-injecte les données de dev
	$(MAKE) reset-dev-db
	$(MAKE) seed-dev

rebuild: env-check ## (compose) Rebuild images (no-cache) puis relance en détaché
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d --build

# --- Aides par service (db | backend | vite)
up-backend: env-check ## (svc) Démarrer backend uniquement
	$(COMPOSE) up -d backend
up-db: env-check ## (svc) Démarrer db uniquement
	$(COMPOSE) up -d db
up-vite: env-check ## (svc) Démarrer vite uniquement
	$(COMPOSE) up -d vite

stop-backend: env-check ## (svc) Stopper backend
	$(COMPOSE) stop backend
stop-db: env-check ## (svc) Stopper db
	$(COMPOSE) stop db
stop-vite: env-check ## (svc) Stopper vite
	$(COMPOSE) stop vite

restart-backend: env-check ## (svc) Redémarrer backend
	$(COMPOSE) restart backend
restart-db: env-check ## (svc) Redémarrer db
	$(COMPOSE) restart db
restart-vite: env-check ## (svc) Redémarrer vite
	$(COMPOSE) restart vite

logs-backend: env-check ## (svc) Logs backend (suivis)
	$(COMPOSE) logs -f --tail=200 backend
logs-db: env-check ## (svc) Logs db (suivis)
	$(COMPOSE) logs -f --tail=200 db
logs-vite: env-check ## (svc) Logs vite (suivis)
	$(COMPOSE) logs -f --tail=200 vite

exec-backend: env-check ## (svc) Shell dans backend
	$(COMPOSE) exec backend bash || $(COMPOSE) run --rm backend bash
exec-db: env-check ## (svc) Shell dans db
	$(COMPOSE) exec db bash || true
exec-vite: env-check ## (svc) Shell dans vite
	$(COMPOSE) exec vite bash || true

clean: env-check ## Stop + suppression volumes nommés (pgdata, node_modules)
	set -a ; . ./.env ; set +a ; \
	VOL1="$$APP_SLUG_$${APP_ENV}_pgdata" ; VOL2="$$APP_SLUG_$${APP_ENV}_node_modules" ; \
	$(COMPOSE) down -v || true ; \
	docker volume rm -f "$$VOL1" "$$VOL2" 2>/dev/null || true ; \
	echo "Volumes supprimés: $$VOL1 $$VOL2"
