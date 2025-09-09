# Interdit les cibles dev sur un hôte de prod
PROD_SENTINEL := /opt/apps/.production_host
ifneq ("$(wildcard $(PROD_SENTINEL))","")
  ifeq ($(APP_ENV),dev)
    $(error Refus: environnement dev interdit sur serveur de prod ($(PROD_SENTINEL) présent))
  endif
endif

# Interdit les cibles dev sur un hôte de prod
PROD_SENTINEL := /opt/apps/.production_host
ifneq ("$(wildcard $(PROD_SENTINEL))","")
  ifeq ($(APP_ENV),dev)
    $(error Refus: environnement dev interdit sur serveur de prod ($(PROD_SENTINEL) présent))
  endif
endif
# =========================
# Makefile - gestionnaire_mdp_zero_knowledge
# =========================
.DEFAULT_GOAL := help



# Détection d'environnement:
# - APP_ENV vient d'abord de ./.env (lien symbolique vers .env.dev|.env.prod)
# - surcharge possible via: APP_ENV=prod make up
APP_ENV ?= $(shell [ -f .env ] && grep -E '^APP_ENV=' .env | cut -d= -f2 || echo dev)

# Fichiers env et compose en fonction de APP_ENV
EF := .env.$(APP_ENV)
LOCAL_EF := $(EF).local
CF := docker-compose.$(APP_ENV).yml

# docker compose standardisé
COMPOSE := docker compose --env-file $(EF) -f $(CF)

# Service par défaut pour certaines cibles (logs, shell, exec)
S ?= backend

# Assure le symlink .env -> .env.$(APP_ENV) (invariant)
.PHONY: ensure-env
ensure-env:
	@ln -sfn $(EF) .env

# =========================
# Aide
# =========================
.PHONY: help
help:
	@echo "ENV: APP_ENV=$(APP_ENV)  EF=$(EF)  LOCAL_EF=$(LOCAL_EF)  CF=$(CF)"
	@echo
	@echo "Cibles principales:"
	@echo "  make up               - Démarrer (build) l'environnement $(APP_ENV)"
	@echo "  make down             - Stopper l'environnement $(APP_ENV)"
	@echo "  make restart          - Redémarrer (down puis up -d --build)"
	@echo "  make ps               - docker compose ps"
	@echo "  make dps              - Tableau des conteneurs + service compose"
	@echo "  make logs [S=backend] - Logs suivis du service (backend par défaut)"
	@echo "  make shell [S=backend]- Shell bash dans un conteneur (backend par défaut)"
	@echo
	@echo "Django:"
	@echo "  make migrate          - python manage.py migrate"
	@echo "  make makemigrations   - python manage.py makemigrations"
	@echo "  make createsuperuser  - crée/maj superuser via ADMIN_* de $(LOCAL_EF)"
	@echo "  make check            - python manage.py check"
	@echo
	@echo "PostgreSQL:"
	@echo "  make psql             - psql *dans* le conteneur db (POSTGRES_*)"
	@echo
	@echo "Backups:"
	@echo "  make backup-db        - ./scripts/backup-db.sh (sortie: backups/<app>_db.YYYYMMDD-HHMMSS.dump)"
	@echo "  make restore-db       - ./scripts/restore-db.sh [DUMP=backups/<app>_db.2025....dump]"
	@echo
	@echo "Astuce: APP_ENV=prod make up    (forcer l'env et relier .env automatiquement)"

# =========================
# Cycle de vie conteneurs
# =========================
.PHONY: up down restart ps dps logs shell build
up: ensure-env
	$(COMPOSE) up -d --build

down: ensure-env
	$(COMPOSE) down

restart: ensure-env
	$(COMPOSE) down && $(COMPOSE) up -d --build

ps: ensure-env
	$(COMPOSE) ps

# Affichage containers + service compose
dps:
	@docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Label \"com.docker.compose.service\"}}\t{{.Status}}\t{{.Ports}}"

logs: ensure-env
	$(COMPOSE) logs -f $(S)

shell: ensure-env
	$(COMPOSE) exec $(S) bash

build: ensure-env
	$(COMPOSE) build

# =========================
# Django
# =========================
.PHONY: migrate makemigrations check createsuperuser
migrate: ensure-env
	$(COMPOSE) exec backend python manage.py migrate

makemigrations: ensure-env
	$(COMPOSE) exec backend python manage.py makemigrations

check: ensure-env
	$(COMPOSE) exec backend python manage.py check

# createsuperuser non interactif (idempotent)
createsuperuser: ensure-env
	@set -a; [ -f "./$(LOCAL_EF)" ] && . "./$(LOCAL_EF)"; set +a; \
	$(COMPOSE) exec \
		-e ADMIN_USERNAME -e ADMIN_EMAIL -e ADMIN_PASSWORD \
		backend \
		python -c "import os,sys; os.environ.setdefault('DJANGO_SETTINGS_MODULE','gestionnaire_mdp.settings'); \
import django; django.setup(); \
from django.contrib.auth import get_user_model; \
u=os.getenv('ADMIN_USERNAME'); e=os.getenv('ADMIN_EMAIL'); p=os.getenv('ADMIN_PASSWORD'); \
miss=[k for k,v in [('ADMIN_USERNAME',u),('ADMIN_EMAIL',e),('ADMIN_PASSWORD',p)] if not v]; \
miss and sys.exit('!! Vars manquantes: '+', '.join(miss)); \
User=get_user_model(); obj,created=User.objects.get_or_create(username=u, defaults={'email': e}); \
(not created and e) and (setattr(obj,'email',e) or obj.save(update_fields=['email'])); \
obj.is_superuser=True; obj.is_staff=True; obj.set_password(p); obj.save(); \
print('Superuser '+('cree' if created else 'mis a jour')+': '+obj.username+' <'+(obj.email or '')+'>')"

# =========================
# PostgreSQL
# =========================
.PHONY: psql
# psql *dans* le conteneur db avec les POSTGRES_* du conteneur
psql: ensure-env
	$(COMPOSE) exec db sh -lc 'psql -U $$POSTGRES_USER -d $$POSTGRES_DB'

# =========================
# Backups (scripts projet)
# =========================
.PHONY: backup-db restore-db
backup-db: ensure-env
	@test -x ./scripts/backup-db.sh && ./scripts/backup-db.sh || \
	 (echo "Script ./scripts/backup-db.sh introuvable ou non exécutable"; exit 1)

# Usage: make restore-db          -> dernier dump conforme (<app>_db.*.dump)
#        make restore-db DUMP=... -> chemin explicite
restore-db: ensure-env
	@test -x ./scripts/restore-db.sh && ./scripts/restore-db.sh $(DUMP) || \
	 (echo "Script ./scripts/restore-db.sh introuvable ou non exécutable"; exit 1)

# =========================
# Tests pratiques (session: csrf + login + whoami)
# =========================
.PHONY: print-admin token-test token-test-domain
print-admin: ensure-env
	@set -a; [ -f "./$(LOCAL_EF)" ] && . "./$(LOCAL_EF)"; set +a; \
	printf "ADMIN_USERNAME=%s\nADMIN_EMAIL=%s\n" "$${ADMIN_USERNAME}" "$${ADMIN_EMAIL}"

# Test interne (dans le conteneur backend) : port 8000 interne
token-test: ensure-env
	@set -a; [ -f "./$(LOCAL_EF)" ] && . "./$(LOCAL_EF)"; set +a; \
	if [ -z "$${ADMIN_USERNAME}" ] || [ -z "$${ADMIN_PASSWORD}" ]; then \
	  echo "!! ADMIN_USERNAME / ADMIN_PASSWORD manquants (dans $(LOCAL_EF))"; exit 1; \
	fi; \
	$(COMPOSE) exec -e ADMIN_USERNAME -e ADMIN_PASSWORD backend sh -lc '\
		JAR=$$(mktemp); \
		echo "[1/3] GET /api/csrf/"; \
		curl -sS -c $$JAR http://localhost:8000/api/csrf/ >/dev/null; \
		CSRF=$$(awk "/csrftoken/ {print \$$7}" $$JAR); \
		if [ -z "$$CSRF" ]; then echo "!! CSRF introuvable"; rm -f $$JAR; exit 1; fi; \
		echo "[2/3] POST /api/login/ (user=$$ADMIN_USERNAME)"; \
		curl -sS -c $$JAR -b $$JAR \
		     -H "X-CSRFToken: $$CSRF" -H "Content-Type: application/json" \
		     --data-raw "{\"username\":\"$$ADMIN_USERNAME\",\"password\":\"$$ADMIN_PASSWORD\"}" \
		     http://localhost:8000/api/login/; echo; \
		echo "[3/3] GET /api/whoami/"; \
		curl -sS -b $$JAR http://localhost:8000/api/whoami/; echo; \
		rm -f $$JAR'

# Test via domaine (Traefik) — utilise API_PUBLIC_BASE si défini
token-test-domain: ensure-env
	@set -a; [ -f "./$(LOCAL_EF)" ] && . "./$(LOCAL_EF)"; set +a; \
	if [ -z "$${ADMIN_USERNAME}" ] || [ -z "$${ADMIN_PASSWORD}" ]; then \
	  echo "!! ADMIN_USERNAME / ADMIN_PASSWORD manquants (dans $(LOCAL_EF))"; exit 1; \
	fi; \
	API_URL="$${API_PUBLIC_BASE:-https://mdp-api.mon-site.ca}"; \
	JAR=$$(mktemp); \
	echo "[1/3] GET $$API_URL/api/csrf/"; \
	curl -sS -c $$JAR "$$API_URL/api/csrf/" >/dev/null; \
	CSRF=$$(awk "/csrftoken/ {print \$$7}" $$JAR); \
	if [ -z "$$CSRF" ]; then echo "!! CSRF introuvable"; rm -f $$JAR; exit 1; fi; \
	echo "[2/3] POST $$API_URL/api/login/ (user=$$ADMIN_USERNAME)"; \
	curl -sS -c $$JAR -b $$JAR \
	     -H "X-CSRFToken: $$CSRF" -H "Content-Type: application/json" \
	     --data-raw "{\"username\":\"$$ADMIN_USERNAME\",\"password\":\"$$ADMIN_PASSWORD\"}" \
	     "$$API_URL/api/login/"; echo; \
	echo "[3/3] GET $$API_URL/api/whoami/"; \
	curl -sS -b $$JAR "$$API_URL/api/whoami/"; echo; \
	rm -f $$JAR
