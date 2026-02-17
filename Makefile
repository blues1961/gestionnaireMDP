# Makefile — Calendrier (aligné sur INVARIANTS)
# - .env est un symlink vers .env.<env> (ex: .env.dev)
# - Services Compose fixes: db, backend, vite
# - Secrets seulement dans .env.local
# - Front utilise /api (chemin relatif), Vite proxy -> backend:8000

SHELL := /bin/bash
.ONESHELL:
.DEFAULT_GOAL := help

# Détecte l'environnement courant via le symlink .env
APP_ENV := $(shell . ./.env; echo $$APP_ENV)
COMPOSE := docker compose --env-file .env.$(APP_ENV) -f docker-compose.$(APP_ENV).yml
TREE_IGNORE := .git|node_modules|dist|__pycache__|.mypy_cache|.pytest_cache|.venv|backups|project-tree-*.txt|*.py[co]|*.sqlite3|*.log|*.cache|*.cookies|*.sql|*.sql.gz|*.dump|*.bak

.PHONY: help env-check env-check-base env-check-local init-dev require-dev-env \
 tree \
 up down stop start restart ps logs sh migrate createsuperuser whoami token-test \
 backup-db restore-db pull-prod-backup push-secret push-secret-all-remote push-secret-single pull-secret pull-secret-all-remote pull-secret-single init-secret init-root-secret backup-env restore-env reset-dev-db seed-dev psql \
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

env-check-base: ## Vérifie .env -> .env.$(APP_ENV) et docker-compose.$(APP_ENV).yml
	test -L .env || { echo "Symlink .env manquant (ex: ln -snf .env.dev .env)"; exit 1; }
	test -f .env.$(APP_ENV) || { echo ".env.$(APP_ENV) introuvable"; exit 1; }
	test -f docker-compose.$(APP_ENV).yml || { echo "docker-compose.$(APP_ENV).yml introuvable"; exit 1; }

env-check-local: ## Vérifie la présence des secrets locaux (.env.local)
	test -f .env.local || { echo ".env.local introuvable (ex: cp .env.local.example .env.local)"; exit 1; }

env-check: env-check-base env-check-local ## Vérifie env + secrets locaux

init-dev: ## Prépare l'env de dev (.env -> .env.dev + .env.local depuis linode)
	set -euo pipefail ; \
	command -v scp >/dev/null 2>&1 || { echo "scp est requis pour init-dev"; exit 2; } ; \
	test -f .env.dev || { echo ".env.dev introuvable (commencez par le créer)"; exit 1; } ; \
	ln -snf ".env.dev" ".env" ; \
	echo "[OK] .env -> .env.dev" ; \
	BACKUP_TS=$$(date +%Y%m%d-%H%M%S) ; \
	if [[ -f ".env.local" ]]; then \
	  cp -f ".env.local" ".env.local.bak.$$BACKUP_TS" ; \
	  echo "[*] Sauvegarde .env.local -> .env.local.bak.$$BACKUP_TS" ; \
	fi ; \
	SSH_TARGET="$${INIT_DEV_SSH:-linode}" ; \
	REMOTE_DIR="$${INIT_DEV_REMOTE_DIR:-/opt/apps/mdp}" ; \
	REMOTE_FILE="$${INIT_DEV_REMOTE_FILE:-$$REMOTE_DIR/.env.local}" ; \
	TMP_ENV_LOCAL=$$(mktemp) ; \
	trap 'rm -f "$$TMP_ENV_LOCAL"' EXIT ; \
	echo "[*] Copie $$SSH_TARGET:$$REMOTE_FILE -> .env.local" ; \
	scp "$$SSH_TARGET:$$REMOTE_FILE" "$$TMP_ENV_LOCAL" ; \
	mv -f "$$TMP_ENV_LOCAL" ".env.local" ; \
	if ! grep -q '^PROD_DB_PASSWORD=' ".env.local" ; then \
	  POSTGRES_PASSWORD_VALUE="$$(grep -E '^POSTGRES_PASSWORD=' ".env.local" | tail -n1 | cut -d'=' -f2-)" ; \
	  if [ -n "$$POSTGRES_PASSWORD_VALUE" ]; then \
	    echo "[*] Ajout PROD_DB_PASSWORD depuis POSTGRES_PASSWORD" ; \
	    printf '\nPROD_DB_PASSWORD=%s\n' "$$POSTGRES_PASSWORD_VALUE" >> ".env.local" ; \
	  fi ; \
	fi ; \
	chmod 600 ".env.local" ; \
	echo "[OK] init-dev terminé"

require-dev-env: ## Garde-fou: autorise la commande uniquement si APP_ENV=dev
	test "$$(. ./.env; echo $$APP_ENV)" = "dev" || { echo "Commande autorisée uniquement depuis dev (.env -> .env.dev)."; exit 1; }

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

createsuperuser: env-check ## Crée/MAJ admin via ADMIN_* (.env.local)
	set -a ; . ./.env ; [ -f ./.env.local ] && . ./.env.local || true ; set +a ; \
	$(COMPOSE) exec -T \
	  -e ADMIN_USERNAME="$$ADMIN_USERNAME" \
	  -e ADMIN_EMAIL="$$ADMIN_EMAIL" \
	  -e ADMIN_PASSWORD="$$ADMIN_PASSWORD" \
	  backend python manage.py shell -c 'import os; from django.contrib.auth import get_user_model; U=get_user_model(); u=os.getenv("ADMIN_USERNAME") or "admin"; e=os.getenv("ADMIN_EMAIL") or "admin@example.com"; p=os.getenv("ADMIN_PASSWORD") or "changeme"; obj,_=U.objects.update_or_create(username=u, defaults={"email":e}); obj.set_password(p); obj.is_staff=True; obj.is_superuser=True; obj.save(); print(f"superuser OK: {obj.username}")'

whoami: env-check ## Test /api/whoami (via port API)
	PORT=$$(. ./.env; echo $$DEV_API_PORT); curl -sS "http://localhost:$$PORT/api/whoami/" | jq . || true

token-test: env-check ## JWT create -> whoami (DEV)
	set -a ; . ./.env ; [ -f ./.env.local ] && . ./.env.local || true ; set +a ; \
	curl -sS "http://localhost:$$DEV_API_PORT/api/auth/jwt/create/" \
	  -H 'Content-Type: application/json' \
	  -d "$$(jq -n --arg u "$$ADMIN_USERNAME" --arg p "$$ADMIN_PASSWORD" '{username:$$u, password:$$p}')" \
	  | tee /tmp/jwt.json >/dev/null ; \
	ACC=$$(jq -r '.access // empty' /tmp/jwt.json) ; test -n "$$ACC" || { echo "Échec JWT"; exit 1; } ; \
	curl -sS "http://localhost:$$DEV_API_PORT/api/whoami/" -H "Authorization: Bearer $$ACC" | jq .

# Sauvegarde / restauration DB
backups-dir:
	mkdir -p backups

backup-db: env-check backups-dir ## Sauvegarder la DB de l'env courant -> backups/<app_slug>_db-<ts>.sql.gz
	set -euo pipefail ; \
	set -a ; . ./.env.$(APP_ENV) ; [ -f ./.env.local ] && . ./.env.local || true ; set +a ; \
	SLUG=$${APP_SLUG:-mdp} ; TS=$$(date +%Y%m%d-%H%M%S) ; OUT=$${OUT:-backups/$${SLUG}_db-$$TS.sql.gz} ; DB_CONT=$${SLUG}_db_$(APP_ENV) ; \
	docker ps --format '{{.Names}}' | grep -qx "$$DB_CONT" || { echo "Conteneur DB introuvable ou arrêté: $$DB_CONT"; exit 1; } ; \
	echo "Backup ($$(. ./.env.$(APP_ENV); echo $$APP_ENV)) -> $$OUT" ; \
	docker exec -e PGPASSWORD="$$POSTGRES_PASSWORD" "$$DB_CONT" pg_dump -U "$$POSTGRES_USER" "$$POSTGRES_DB" | gzip > "$$OUT"

restore-db: env-check ## Restaurer la DB depuis BACKUP=<fichier.{sql.gz,dump}> (dernier par défaut)
	set -euo pipefail ; \
	set -a ; . ./.env.$(APP_ENV) ; [ -f ./.env.local ] && . ./.env.local || true ; set +a ; \
	SLUG=$${APP_SLUG:-mdp} ; DB_CONT=$${SLUG}_db_$(APP_ENV) ; PATTERN_DESC="backups/$${SLUG}_db-<timestamp>.sql.gz" ; \
	FILE=$${BACKUP:-$$( (ls -1t backups/$${SLUG}_db-*.sql.gz backups/$${SLUG}_db-*.sql backups/$${SLUG}_db.*.dump backups/db-*.dump backups/*.dump 2>/dev/null || true) | head -n1 )} ; \
	test -n "$$FILE" -a -f "$$FILE" || { echo "Aucun backup trouvé ($$PATTERN_DESC) ou BACKUP invalide"; exit 1; } ; \
	docker ps --format '{{.Names}}' | grep -qx "$$DB_CONT" || { echo "Conteneur DB introuvable ou arrêté: $$DB_CONT"; exit 1; } ; \
	echo "Restore <- $$FILE" ; \
	docker exec -i -e PGPASSWORD="$$POSTGRES_PASSWORD" "$$DB_CONT" psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' ; \
	case "$$FILE" in \
	  *.sql.gz) gunzip -c "$$FILE" | docker exec -i -e PGPASSWORD="$$POSTGRES_PASSWORD" "$$DB_CONT" psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" ;; \
	  *.sql)    docker exec -i -e PGPASSWORD="$$POSTGRES_PASSWORD" "$$DB_CONT" psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" < "$$FILE" ;; \
	  *.dump)   docker exec -i -e PGPASSWORD="$$POSTGRES_PASSWORD" "$$DB_CONT" pg_restore -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" --no-owner --no-privileges < "$$FILE" ;; \
	  *)        echo "Format de backup non supporté: $$FILE"; exit 1 ;; \
	esac

pull-prod-backup: backups-dir ## Déclencher backup-db sur Linode puis rapatrier le dump dans backups/
	bash scripts/pull-prod-backup.sh

push-secret: env-check require-dev-env ## Copier .env.local (dev) vers la prod via SSH
	./scripts/push-secret.sh

push-secret-all-remote: push-secret ## Alias de compatibilité

push-secret-single: push-secret ## Alias de compatibilité

pull-secret: env-check-base require-dev-env ## Rapatrier .env.local depuis la prod via SSH
	FORCE="$${FORCE:-0}" ./scripts/pull-secret.sh
	ln -snf ".env.$(APP_ENV)" ./.env
	echo ".env -> .env.$(APP_ENV)"

pull-secret-all-remote: pull-secret ## Alias de compatibilité

pull-secret-single: pull-secret ## Alias de compatibilité

init-secret: ## Régénère les secrets (.env.local.example) hors ADMIN_* + sync DB
	./scripts/init-secret.sh

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
