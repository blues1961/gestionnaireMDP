# Makefile standard apps (MDP, CAL, App3…)
# Invariants respectés:
# - .env est un symlink vers .env.$(APP_ENV)
# - secrets dans .env.$(APP_ENV).local
# - jamais de stack dev en prod (sentinelle /opt/apps/.production_host)
# - compose files: docker-compose.dev.yml / docker-compose.prod.yml

SHELL := /bin/bash

# Lis APP_ENV / APP_SLUG depuis .env si possible (fallbacks sûrs)
APP_ENV  ?= $(shell awk -F= '/^APP_ENV=/{print $$2}' .env 2>/dev/null || echo dev)
APP_SLUG ?= $(shell awk -F= '/^APP_SLUG=/{print $$2}' .env 2>/dev/null || echo app)

COMPOSE_FILE := docker-compose.$(APP_ENV).yml
ENV_FILE     := .env

# Charge automatiquement .env.$(APP_ENV).local (secrets) avant chaque commande compose
LOAD_LOCAL := set -a; [ -f .env.$(APP_ENV).local ] && . .env.$(APP_ENV).local; set +a;

# ---------- Garde-fous ----------
ensure-env:
	@[ -L .env ] || (echo "✖ Le symlink .env n'existe pas. Faites: ln -sfn .env.$(APP_ENV) .env" && exit 1)
	@grep -q "^APP_ENV=$(APP_ENV)$$" .env || (echo "✖ .env ne pointe pas vers .env.$(APP_ENV)" && exit 1)
	@if [ -f /opt/apps/.production_host ] && [ "$(APP_ENV)" = "dev" ]; then \
		echo "✖ Garde-fou: impossible d'exécuter DEV sur l'hôte de PROD"; exit 2; \
	fi

ensure-edge:
	@docker network ls --format '{{.Name}}' | grep -qx edge || docker network create edge >/dev/null

# ---------- Stack ----------
up: ensure-env ensure-edge
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d --build --remove-orphans

down: ensure-env
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) down --remove-orphans

restart: ensure-env
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) restart

ps: ensure-env
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) ps

logs: ensure-env
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) logs -f --tail=200

# ---------- Dev utils ----------
shell-backend:
	docker exec -it $(APP_SLUG)_backend_{$(APP_ENV)} bash || docker exec -it $(APP_SLUG)_backend_$(APP_ENV) bash

migrate:
	docker exec -it $(APP_SLUG)_backend_$(APP_ENV) python manage.py migrate

makemigrations:
	docker exec -it $(APP_SLUG)_backend_$(APP_ENV) python manage.py makemigrations

createsuperuser:
	docker exec -it $(APP_SLUG)_backend_$(APP_ENV) python manage.py createsuperuser

psql:
	docker exec -it $(APP_SLUG)_db_$(APP_ENV) psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"

# ---------- Backups ----------
backup-db:
	APP_ENV=$(APP_ENV) APP_SLUG=$(APP_SLUG) ./scripts/backup-db.sh

restore-db:
	APP_ENV=$(APP_ENV) APP_SLUG=$(APP_SLUG) ./scripts/restore-db.sh

# ---------- Nettoyage ----------
down-clean: ensure-env
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) down --remove-orphans
	- docker ps -a --filter name='^/$(APP_SLUG)_.*_$(APP_ENV)$$' -q | xargs -r docker rm -f
	- docker network rm $(APP_SLUG)_appnet 2>/dev/null || true

# ATTENTION: supprime AUSSI le volume DB et node_modules de l'app courante (dev)
nuke-dev: ensure-env
	$(MAKE) down-clean
	- docker volume rm $(APP_SLUG)_db_data_$(APP_ENV) 2>/dev/null || true
	- docker volume rm $(APP_SLUG)_node_modules_$(APP_ENV) 2>/dev/null || true
	- docker image prune -f

# ---------- Affichages ----------
dps:
	@docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Label "com.docker.compose.service"}}\t{{.Status}}\t{{.Ports}}' \
	| (read -r header; echo "$$header"; grep -E "^|$(APP_SLUG)_.*_$(APP_ENV)" || true)

dps-all:
	@docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Label "com.docker.compose.service"}}\t{{.Status}}\t{{.Ports}}'
