# =========================
# Makefile - gestionnaire_mdp_zero_knowledge
# =========================
.DEFAULT_GOAL := help   # <--- la cible par défaut est help
# =========================
# Makefile - gestionnaire_mdp_zero_knowledge
# =========================
# Détection d'environnement:
# - APP_ENV vient d'abord de ./.env (lien symbolique vers .env.dev ou .env.prod)
# - défaut: dev
APP_ENV ?= $(shell grep -E '^APP_ENV=' .env 2>/dev/null | cut -d= -f2 || echo dev)

# Fichiers env et compose en fonction de APP_ENV
EF := .env.$(APP_ENV)
LOCAL_EF := $(EF).local
CF := docker-compose.$(APP_ENV).yml

# Commande docker compose standardisée
COMPOSE := docker compose --env-file $(EF) -f $(CF)

# Service par défaut pour certaines cibles (logs, shell, exec)
S ?= backend

# =========================
# Aide
# =========================
.PHONY: help
help:
	@echo "ENV: APP_ENV=$(APP_ENV)  EF=$(EF)  LOCAL_EF=$(LOCAL_EF)  CF=$(CF)"
	@echo
	@echo "Cibles principales:"
	@echo "  make dps              - Tableau des conteneurs + service compose"
	@echo "  make up               - Démarrer (build) l'environnement $(APP_ENV)"
	@echo "  make down             - Stopper l'environnement $(APP_ENV)"
	@echo "  make restart          - Redémarrer (down puis up -d --build)"
	@echo "  make ps               - docker compose ps"
	@echo "  make logs [S=backend] - Logs suivis du service (backend par défaut)"
	@echo "  make shell [S=backend]- Shell bash dans un conteneur (backend par défaut)"
	@echo
	@echo "Django:"
	@echo "  make migrate          - python manage.py migrate"
	@echo "  make makemigrations   - python manage.py makemigrations"
	@echo "  make createsuperuser  - crée/maj superuser avec ADMIN_* depuis $(LOCAL_EF)"
	@echo "  make check            - python manage.py check"
	@echo
	@echo "PostgreSQL:"
	@echo "  make psql             - psql *dans* le conteneur db (variables du conteneur)"
	@echo
	@echo "Scripts projet:"
	@echo "  make backup-db        - lance ./scripts/backup-db.sh  (si présent)"
	@echo "  make restore-db       - lance ./scripts/restore-db.sh (si présent)"
	@echo
	@echo "Astuce: override le service cible ex. 'make logs S=frontend'"

# =========================
# Cycle de vie conteneurs
# =========================
.PHONY: up down restart ps dps logs shell build
up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) down && $(COMPOSE) up -d --build

ps:
	$(COMPOSE) ps

# Affichage containers + service compose
dps:
	@docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Label \"com.docker.compose.service\"}}\t{{.Status}}\t{{.Ports}}"

logs:
	$(COMPOSE) logs -f $(S)

shell:
	$(COMPOSE) exec $(S) bash

build:
	$(COMPOSE) build

# =========================
# Django
# =========================
.PHONY: migrate makemigrations check createsuperuser
migrate:
	$(COMPOSE) exec backend python manage.py migrate

makemigrations:
	$(COMPOSE) exec backend python manage.py makemigrations

check:
	$(COMPOSE) exec backend python manage.py check

# createsuperuser non interactif (idempotent) :
# lit ADMIN_* depuis $(LOCAL_EF) car le service backend a:
#   env_file:
#     - .env.$(APP_ENV)
#     - .env.$(APP_ENV).local
.PHONY: createsuperuser
createsuperuser:
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
# Ouvre psql *dans* le conteneur db en utilisant les variables du conteneur
psql:
	$(COMPOSE) exec db sh -lc 'psql -U $$POSTGRES_USER -d $$POSTGRES_DB'

# =========================
# Scripts projet (optionnels)
# =========================
.PHONY: backup-db restore-db
backup-db:
	@test -x ./scripts/backup-db.sh && ./scripts/backup-db.sh $(APP_ENV) || \
	 (echo "Script ./scripts/backup-db.sh introuvable ou non exécutable"; exit 1)

restore-db:
	@test -x ./scripts/restore-db.sh && ./scripts/restore-db.sh $(APP_ENV) || \
	 (echo "Script ./scripts/restore-db.sh introuvable ou non exécutable"; exit 1)

# =========================
# Tests pratiques (session: csrf + login + whoami)
# =========================
print-admin:
	@set -a; [ -f "./$(LOCAL_EF)" ] && . "./$(LOCAL_EF)"; set +a; \
	printf "ADMIN_USERNAME=%s\nADMIN_EMAIL=%s\n" "$${ADMIN_USERNAME}" "$${ADMIN_EMAIL}"

# Test interne (bypasse Traefik) : CSRF + login + whoami
token-test:
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

# Test via Traefik (optionnel) — utilise API_PUBLIC_BASE si défini
token-test-domain:
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
