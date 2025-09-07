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

# createsuperuser non interactif:
# - lit ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD depuis $(LOCAL_EF)
# - crée/maj le superuser (idempotent)
createsuperuser:
	@set -euo pipefail; \
	EF_LOCAL_ABS="$(abspath $(LOCAL_EF))"; \
	if [ ! -f "$$EF_LOCAL_ABS" ]; then \
	  echo "!! Fichier $$EF_LOCAL_ABS introuvable. Place ADMIN_USERNAME/EMAIL/PASSWORD dedans."; exit 1; \
	fi; \
	# Tente de sourcer (bash) ; si ça échoue, fallback via grep/xargs
	set -a; \
	if ! source "$$EF_LOCAL_ABS" 2>/dev/null; then \
	  eval $$((grep -E '^(ADMIN_USERNAME|ADMIN_EMAIL|ADMIN_PASSWORD)=' "$$EF_LOCAL_ABS" || true) | xargs); \
	fi; \
	set +a; \
	if [ -z "$${ADMIN_USERNAME:-}" ] || [ -z "$${ADMIN_EMAIL:-}" ] || [ -z "$${ADMIN_PASSWORD:-}" ]; then \
	  echo "!! ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD manquants dans $$EF_LOCAL_ABS"; exit 1; \
	fi; \
	ADMIN_USERNAME="$$ADMIN_USERNAME" \
	ADMIN_EMAIL="$$ADMIN_EMAIL" \
	ADMIN_PASSWORD="$$ADMIN_PASSWORD" \
	$(COMPOSE) exec backend bash -lc 'python - << "PY"\nimport os, django\nfrom django.contrib.auth import get_user_model\n\ndjango.setup()\nUser = get_user_model()\nusername = os.environ.get("ADMIN_USERNAME")\nemail    = os.environ.get("ADMIN_EMAIL")\npassword = os.environ.get("ADMIN_PASSWORD")\n\nu, created = User.objects.get_or_create(username=username, defaults={\"email\": email})\nif not created and email:\n    u.email = email\n    u.save(update_fields=[\"email\"]) \n# Superuser + staff + reset du mot de passe\nu.is_superuser = True\nu.is_staff = True\nu.set_password(password)\nu.save()\nprint(f\"Superuser {'créé' if created else 'mis à jour'}: {u.username} <{u.email}>\")\nPY'



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
