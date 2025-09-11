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
LOAD_LOCAL := set -a; [ -f .env.$(APP_ENV).local ] && . .env.$(APP_ENV).local; set +a

# --- Help par défaut ---
.DEFAULT_GOAL := help
HELP_COLS ?= 28

.PHONY: help
help: ## Affiche cette aide (liste les cibles disponibles)
	@printf "\nCibles disponibles (make <cible>):\n\n"
	@awk -F':.*##' '/^[a-zA-Z0-9_.-]+:.*##/ {printf "  \033[36m%-'$(HELP_COLS)'s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST) | sort
	@printf "\nAutres cibles (sans description) :\n\n"
	@ALL=$$(grep -E '^[a-zA-Z0-9_.-]+:([^=]|$$)' $(MAKEFILE_LIST) | cut -d: -f1 | grep -v -E '^(help|\.PHONY)$$' | sort -u); \
	 DESCR=$$(awk -F':.*##' '/^[a-zA-Z0-9_.-]+:.*##/ {print $$1}' $(MAKEFILE_LIST) | sort -u); \
	 comm -23 <(printf "%s\n" "$$ALL") <(printf "%s\n" "$$DESCR") | sed 's/^/  /'
	@printf "\nAstuce: ajoute une description après ta cible avec  \"## ...\" pour enrichir l’aide.\n\n"

# --- Symlink .env -> .env.$(APP_ENV)
ENV_SRC := .env.$(APP_ENV)

.PHONY: envlink envlink-dev envlink-prod

envlink: ## Crée/actualise .env -> .env.$(APP_ENV)
	@if [ ! -f "$(ENV_SRC)" ]; then \
	  echo "❌ $(ENV_SRC) introuvable."; \
	  echo "   Fichiers trouvés:"; ls -1 .env.* 2>/dev/null || true; \
	  exit 1; \
	fi
	@rm -f .env
	@ln -s "$(ENV_SRC)" .env
	@printf "→ "; ls -l .env

envlink-dev:  ## Force .env -> .env.dev
	@$(MAKE) -s envlink APP_ENV=dev

envlink-prod: ## Force .env -> .env.prod
	@$(MAKE) -s envlink APP_ENV=prod


# ---------- Garde-fous ----------
ensure-env:  ## garde-fous - s assure que symlink exste et pointe dans la bonne direction 
	@[ -L .env ] || (echo "✖ Le symlink .env n'existe pas. Faites: ln -sfn .env.$(APP_ENV) .env" && exit 1)
	@grep -q "^APP_ENV=$(APP_ENV)$$" .env || (echo "✖ .env ne pointe pas vers .env.$(APP_ENV)" && exit 1)
	@if [ -f /opt/apps/.production_host ] && [ "$(APP_ENV)" = "dev" ]; then \
		echo "✖ Garde-fou: impossible d'exécuter DEV sur l'hôte de PROD"; exit 2; \
	fi

ensure-edge: ## s assure que l reseau edge existe
	@docker network ls --format '{{.Name}}' | grep -qx edge || docker network create edge >/dev/null

# ---------- Stack ----------
up: ensure-env ensure-edge   ## Démarre/rafraîchit la stack courante
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d --build --remove-orphans

down: ensure-env   ## Stoppe et supprime la stack
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) down --remove-orphans


restart: ensure-env ## Redémarre les services
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) restart



ps: ensure-env	   ## État des services
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) ps

logs: ensure-env	    ## Logs backend (tail -200)
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) logs -f --tail=200

# ---------- Dev utils ----------
shell-backend: ## Accès au shell du backend
	@docker exec -it $(APP_SLUG)_backend_$(APP_ENV) bash 2>/dev/null || \
	 docker exec -it $(APP_SLUG)_backend_$(APP_ENV) sh

migrate:	## applique les migrations
	docker exec -it $(APP_SLUG)_backend_$(APP_ENV) python manage.py migrate

makemigrations: ## genere les fichiers de migration
	docker exec -it $(APP_SLUG)_backend_$(APP_ENV) python manage.py makemigrations

createsuperuser:	## creer django superuser 
	docker exec -it $(APP_SLUG)_backend_$(APP_ENV) python manage.py createsuperuser

psql:	## shell psql du container
	docker exec -it $(APP_SLUG)_db_$(APP_ENV) psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"

# ---------- Backups ----------
backup-db:		## dump de la bd courrante
	APP_ENV=$(APP_ENV) APP_SLUG=$(APP_SLUG) ./scripts/backup-db.sh

restore-db:		## restore la db corante
	APP_ENV=$(APP_ENV) APP_SLUG=$(APP_SLUG) ./scripts/restore-db.sh

# ---------- Nettoyage ----------
down-clean: ensure-env  ## arret des conteneurs préserve le data
	$(LOAD_LOCAL); docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) down --remove-orphans
	- docker ps -a --filter name='^/$(APP_SLUG)_.*_$(APP_ENV)$$' -q | xargs -r docker rm -f
	- docker network rm $(APP_SLUG)_appnet 2>/dev/null || true

# ATTENTION: supprime AUSSI le volume DB et node_modules de l'app courante (dev)
nuke-dev: ensure-env  ## arret des conteneurs et suprime le data (ce n est pas ce que tu veux)
	$(MAKE) down-clean
	- docker volume rm $(APP_SLUG)_db_data_$(APP_ENV) 2>/dev/null || true
	- docker volume rm $(APP_SLUG)_node_modules_$(APP_ENV) 2>/dev/null || true
	- docker image prune -f

# ---------- Affichages ----------
dps:  ## docker ps (filtré app courante) trié par NAMES
	@APP_SLUG='$(APP_SLUG)'; APP_ENV='$(APP_ENV)'; \
	{ \
	  printf 'ID\tNAMES\tservice\tSTATUS\tPORTS\n'; \
	  docker ps --format '{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}' \
	  | awk -F'\t' -v slug="^"$$APP_SLUG"_" -v env="_"$$APP_ENV"$$" 'BEGIN{OFS="\t"} \
	      $$2 ~ slug".*"env { \
	        split($$2, a, "_"); svc=(length(a)>=3?a[2]:""); \
	        print $$1,$$2,svc,$$3,$$4 \
	      }'; \
	} | LC_ALL=C sort -t $$'\t' -k2,2 | column -t -s $$'\t'

dps-all: ## docker ps (toutes apps) trié par NAMES
	@{ \
	  printf 'ID\tNAMES\tservice\tSTATUS\tPORTS\n'; \
	  docker ps --format '{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}' \
	  | awk -F'\t' 'BEGIN{OFS="\t"} {split($$2, a, "_"); svc=(length(a)>=3?a[2]:""); print $$1,$$2,svc,$$3,$$4}'; \
	} | LC_ALL=C sort -t $$'\t' -k2,2 | column -t -s $$'\t'


APP_HOST := $(shell grep -E '^APP_HOST=' .env.prod | cut -d= -f2)
PROD     := docker compose -f docker-compose.prod.yml --env-file .env.prod

.PHONY: prod-deploy prod-health prod-logs

prod-deploy:	## en production - reconstruit les conteneurs applique les migration
	@$(PROD) up -d --build
	@$(PROD) run --rm backend python manage.py migrate --noinput
	@$(PROD) run --rm backend python manage.py collectstatic --noinput
	@echo "✅ Déploiement prod OK"

# Suit automatiquement la redirection et utilise le Host correct
prod-health: ## en production - verifier la bonne sanré de l api
	@curl -sSL -H "Host: $(APP_HOST)" http://127.0.0.1/api/healthz/ -o - -w "\nHTTP %{http_code}\n" || true

prod-logs:  ## en production - affiche la fin du logs 
	@$(PROD) ps
	@$(PROD) logs --tail=120 backend
