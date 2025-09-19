# Plan de reprise après crash & exploitation (DEV/PROD) — Révision 2025‑08‑19

## Ce qui change (résumé)

* Les **fichiers d’environnement** sont désormais : **`.env.dev`** (développement) et **`.env.prod`** (production).
* Les fichiers **Docker Compose** utilisés sont : **`docker-compose.dev.yml`** (DEV) et **`docker-compose.prod.yml`** (PROD).
* Les **fichiers statiques du frontend** sont servis par le conteneur **frontend (Nginx)** derrière **Traefik** en production (build Vite → image Docker).
* Les fichiers Compose **référencent explicitement** leur fichier d’environnement via `env_file:` (pas besoin de `--env-file` à la ligne de commande).

---

## 0) Prérequis à conserver en lieu sûr

* **Clé RSA navigateur** (export JSON) + **passphrase**
* Fichiers **`.env.dev`** et **`.env.prod`** (jamais dans Git)
* Dernière **sauvegarde DB** PostgreSQL (`.sql` / `.dump`)

> Bonnes pratiques : limiter les permissions des fichiers secrets (ex. `chmod 600`), et ne jamais les pousser sur Git.

---

## 1) Reprise rapide

1. Récupérer le code depuis Git.
2. Restaurer **`.env.dev`** (DEV) et/ou **`.env.prod`** (PROD) à la racine du projet.
3. Démarrer les conteneurs :

```bash
# DEV
docker compose -f docker-compose.dev.yml up -d --build

# PROD
docker compose -f docker-compose.prod.yml up -d --build
```

> Les Compose référencent déjà `env_file:` vers `.env.dev` (DEV) ou `.env.prod` (PROD).

4. Restaurer la DB si vide (voir section **3 - Backups**).
5. Se connecter à l’admin Django (`/admin/`).
6. Importer la clé RSA via “Sauvegarde clé” → Importer (JSON + passphrase).
7. Tester `/key-check` (API) et un parcours utilisateur minimal.
8. **PROD uniquement :** vérifier que Traefik publie bien le frontend (`https://${APP_HOST}` → 200) et l’API (`/api/health/`).

---

## 2) Commandes Docker (DEV)

**Démarrage :**

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

**Arrêt :**

```bash
# Conserve les volumes
docker compose -f docker-compose.dev.yml down

# Supprime aussi la DB
docker compose -f docker-compose.dev.yml down -v
```

**Utilitaires :**

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs -f
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml restart backend
```

> **En PROD** : remplacer par `-f docker-compose.prod.yml`.

---

## 3) Backups de la base de données

### Sauvegarde :

```bash
mkdir -p backups
SLUG=${APP_SLUG:-mdp}
TS=$(date +"%Y%m%d-%H%M%S")
BACKUP_FILE="backups/${SLUG}_db-$TS.sql.gz"
docker compose -f docker-compose.dev.yml exec -T db \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > "$BACKUP_FILE"

ls -lh "$BACKUP_FILE"
```

* Sauvegardes stockées dans `backups/` (mettre dans `.gitignore`).
* Créer un script `scripts/backup-db.sh` pour automatiser.

### Vérification :

```bash
SLUG=${APP_SLUG:-mdp}
ls -lh backups/${SLUG}_db-*.sql.gz
gunzip -c backups/${SLUG}_db-*.sql.gz | head -n 5
```

### Restauration :

```bash
SLUG=${APP_SLUG:-mdp}
FILE=backups/${SLUG}_db-YYYYMMDD-HHMMSS.sql.gz
gunzip -c "$FILE" | docker compose -f docker-compose.dev.yml exec -T db \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

### Bonnes pratiques :

* Faire un backup avant toute MAJ critique.
* Copier régulièrement les backups hors serveur.
* Tester la restauration au moins 1×/mois.

### Accès aux backups :

* Les fichiers sont créés dans le dossier `backups/` à la racine du projet.
* Pour exporter hors serveur :

```bash
scp backups/${SLUG}_db-YYYYMMDD-HHMMSS.sql.gz user@serveur:/chemin/de/sauvegarde/
```

### Backups automatiques :

* Automatiser avec un cron job sur le serveur :

```bash
0 3 * * * /chemin/vers/scripts/backup-db.sh
```

* Conserver plusieurs générations (7 jours, 4 semaines, 12 mois).
* Tester régulièrement la restauration sur un environnement de staging.

---

## 4) Clés & Secrets

* Clé RSA navigateur : **jamais** dans les `.env`.
* `DJANGO_SECRET_KEY` + mots de passe PostgreSQL : dans **`.env.dev.local`** / **`.env.prod.local`** (selon l’environnement).
* Après modification des fichiers `.env.*`, redémarrer les conteneurs.

---

## 5) Git — Workflow

### Commandes de base :

```bash
git status
git add .
git commit -m "docs: playbook révisé (env_file + Traefik)"
git push origin main
```

### .gitignore recommandé :

```
.env.dev
.env.prod
backups/
frontend/node_modules/
**/*.zkkey.json
*.dump
*.sql
```

### Branches & tags :

```bash
git switch -c feature/xyz
git tag -a v1.0.0 -m "first prod"
git push origin --tags
```

---

## 6) Dépannage

* **403 Forbidden** : vérifier login admin, CORS/CSRF, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` et cookies côté navigateur.
* **Déchiffrement impossible** : clé ou passphrase incorrecte.
* **Admin KO** : vérifier `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, cookies, logs backend.
* **Frontend non servi** : vérifier les labels Traefik (`docker compose -f docker-compose.prod.yml config --services`), les logs `traefik`, puis que le conteneur `frontend` répond sur le port 80 interne (`docker compose exec frontend wget -qO- http://localhost/`).

---

## 7) Frontend statique (Vite + Traefik)

### 7.1 Principe

* En **PROD**, le build Vite est empaqueté dans l’image Docker `frontend` (Nginx).
* Traefik publie `https://${APP_HOST}` vers `frontend` et route `/api/*` / `/admin/*` vers `backend`.
* Aucun fichier n’est copié sur l’hôte : tout est servi depuis le conteneur.

### 7.2 Build Vite (exemple)

```bash
# Option locale (débogage)
say "Build du frontend (VITE_API_BASE=${API_BASE:-/api})"
pushd frontend >/dev/null
npm ci
VITE_API_BASE="${API_BASE:-/api}" npm run build
popd >/dev/null

# Via Docker Compose (recommandé)
docker compose -f docker-compose.prod.yml --env-file .env.prod build frontend
```

### 7.3 Relance du conteneur frontend

```bash
# Redéploiement (rebuild + restart)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build frontend

# Vérifier les logs
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f frontend
```

### 7.4 Variables et CORS côté backend

* `.env.prod` :
  * `APP_HOST=mdp.mon-site.ca`
  * `VITE_API_BASE=/api`
  * `CORS_ALLOWED_ORIGINS=https://${APP_HOST}`
  * `CSRF_TRUSTED_ORIGINS=https://${APP_HOST}`
* Redémarrer `backend` et `frontend` après modification de `.env.prod`.

---

## 8) Scripts d’automatisation (backup & restore)

> Identiques à la version précédente, avec un ajustement de `COMPOSE_FILE` pour la production.

### 8.1 `scripts/backup-db.sh` — backup + rotation

* Par défaut : `COMPOSE_FILE="docker-compose.dev.yml"`.
* **PROD** : utiliser `COMPOSE_FILE="docker-compose.prod.yml"`.

**Exemples :**

```bash
# DEV
./scripts/backup-db.sh

# PROD (répertoires dédiés et rétention 30 jours)
COMPOSE_FILE=docker-compose.prod.yml \
BACKUP_DIR=/var/backups/gestionnaire_mdp \
RETENTION_DAYS=30 \
./scripts/backup-db.sh
```

### 8.2 `scripts/restore-db.sh` — restauration .sql / .sql.gz

**Exemples :**

```bash
# DEV
./scripts/restore-db.sh backups/mdp_db-20250812-031500.sql.gz

# PROD (spécifie le compose prod)
COMPOSE_FILE=docker-compose.prod.yml ./scripts/restore-db.sh /var/backups/gestionnaire_mdp/mdp_db-20250812-031500.sql.gz
```

### 8.3 Cron d’automatisation (prod)

```cron
0 3 * * * cd /opt/gestionnaire_mdp_zero_knowledge && \
  COMPOSE_FILE=docker-compose.prod.yml \
  BACKUP_DIR=/var/backups/gestionnaire_mdp \
  RETENTION_DAYS=30 \
  /bin/bash scripts/backup-db.sh >> logs/backup.log 2>&1
```

---

## 9) Exemples d’extraits `docker-compose.*.yml`

### 9.1 `docker-compose.prod.yml` (complet)

```yaml
version: "3.9"

name: gestionnaire-mdp-prod

services:
  db:
    image: postgres:16
    restart: unless-stopped
    env_file: .env.prod
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks: [internal]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 30

  backend:
    build:
      context: ./backend
      # target: prod   # décommentez si votre Dockerfile comporte un stage 'prod'
    restart: unless-stopped
    env_file: .env.prod
    depends_on:
      db:
        condition: service_healthy
    # Traefik route /api/* vers ce service (voir labels ci-dessous)
    expose:
      - "8000"
    networks: [internal]
    # Si le Dockerfile ne définit pas déjà le CMD/entrypoint :
    # command: gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 60
    labels:
      traefik.enable: "true"
      traefik.docker.network: "edge"
      traefik.http.middlewares.mdp-redirect-https.redirectscheme.scheme: "https"
      traefik.http.routers.mdp-api.rule: "Host(`${APP_HOST}`) && PathPrefix(`/api/`)"
      traefik.http.routers.mdp-api.entrypoints: "websecure"
      traefik.http.routers.mdp-api.tls: "true"
      traefik.http.routers.mdp-api.tls.certresolver: "le"
      traefik.http.routers.mdp-api.service: "mdp-api"
      traefik.http.services.mdp-api.loadbalancer.server.port: "8000"

networks:
  internal:

volumes:
  pgdata:
```

> **Traefik** : route `/api/*` et `/admin/*` vers `backend`, et le reste vers `frontend` (cf. section 7).

### 9.2 `docker-compose.dev.yml` (extrait minimal)

```yaml
version: "3.9"
services:
  db:
    image: postgres:16
    env_file: .env.dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks: [internal]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 3s
      timeout: 3s
      retries: 40

  backend:
    build: ./backend
    env_file: .env.dev
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    networks: [internal]

networks:
  internal:

volumes:
  pgdata:
```

### 9.3 Variables attendues dans `.env.*`

```
# Base de données
POSTGRES_DB=mdpdb
POSTGRES_USER=mdpuser
POSTGRES_PASSWORD=change-me
DB_HOST=db
DB_PORT=5432

# Django
DJANGO_SECRET_KEY=change-me
DJANGO_DEBUG=false            # true en DEV
ALLOWED_HOSTS=mdp.mon-site.ca       # en DEV: localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://mdp.mon-site.ca

# Chemin relatif injecté côté frontend
API_BASE=/api/
```

> En **DEV**, adaptez `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS` (ex. `http://localhost:5173`).

---

## 10) Dockerfile backend (prod)

> Dockerfile placé dans **`backend/Dockerfile`** (contexte de build = `./backend`). Multi‑stage non requis ici; image **python:3.12-slim** + Gunicorn. L’entrypoint attend la DB, applique les migrations et lance Gunicorn. Les statiques Django sont collectés dans `/app/staticfiles` (cf. §11 pour distribution via Traefik).

```dockerfile
# backend/Dockerfile

FROM python:3.12-slim

# Env Python propres
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Dépendances système (PostgreSQL client libs, build tools pour wheels manquantes)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev netcat-openbsd \
 && rm -rf /var/lib/apt/lists/*

# Dossier de travail
WORKDIR /app

# Dépendances Python
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Code de l’appli
COPY . /app

# Utilisateur non-root
RUN useradd -u 10001 -m appuser && chown -R appuser:appuser /app
USER appuser

# Variables par défaut Gunicorn (peuvent être écrasées via env/compose)
ENV GUNICORN_WORKERS=3 \
    GUNICORN_TIMEOUT=60 \
    GUNICORN_BIND=0.0.0.0:8000

# EntryPoint
COPY docker/entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

# Commande par défaut : Gunicorn
CMD ["gunicorn", "config.wsgi:application", "--workers", "3", "--bind", "0.0.0.0:8000", "--timeout", "60"]
```

### 10.1 `backend/docker/entrypoint.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# Petite aide visuelle
echo "[entrypoint] DJANGO_DEBUG=${DJANGO_DEBUG:-} ALLOWED_HOSTS=${ALLOWED_HOSTS:-} DB_HOST=${DB_HOST:-} DB_PORT=${DB_PORT:-}"

# Attendre la DB (si variables manquent, valeurs par défaut)
: "${DB_HOST:=db}"
: "${DB_PORT:=5432}"

echo "[entrypoint] Attente de la base ${DB_HOST}:${DB_PORT}…"
until nc -z "${DB_HOST}" "${DB_PORT}"; do
  sleep 1
  printf '.'
done
printf "
[entrypoint] DB disponible.
"

# Migrations
python manage.py migrate --noinput

# Collecte des statiques Django
# Assurez-vous que STATIC_ROOT est défini dans settings.py (ex: BASE_DIR / 'staticfiles')
python manage.py collectstatic --noinput

# Lancer la commande (Gunicorn par défaut via CMD)
exec "$@"
```

> N’oubliez pas de rendre l’entrypoint exécutable : `chmod +x backend/docker/entrypoint.sh`.

### 10.2 `.dockerignore` (dans `backend/`)

```gitignore
# backend/.dockerignore
__pycache__/
*.pyc
*.pyo
*.pyd
*.sqlite3
*.log
.git
.gitignore
.env*
/tests/
/media/
/static/
node_modules/
```

---

## 11) Statiques Django (admin)

### 11.1 Pré-requis côté Django

Dans `settings.py`, conserver :

```python
import os
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_URL = "/static/"
STATIC_ROOT = os.environ.get("STATIC_ROOT", BASE_DIR / "staticfiles")
```

En **prod**, l’entrypoint exécute `collectstatic` et remplit `/app/staticfiles`.

### 11.2 Servir les statiques via Traefik

* Par défaut, Traefik route `/admin/*` vers `backend` qui sait répondre aux fichiers `/static/` collectés.
* Pour déléguer les statiques à `frontend`, partagez un volume :

```yaml
volumes:
  staticfiles:

services:
  backend:
    volumes:
      - staticfiles:/app/staticfiles
  frontend:
    volumes:
      - staticfiles:/usr/share/nginx/html/static:ro
```

### 11.3 Relancer `collectstatic`

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py collectstatic --noinput
```

---

## 12) Rappel d’intégration Compose (prod)

Dans `docker-compose.prod.yml`, le service **backend** bâtit depuis `./backend` et utilise l’entrypoint :

```yaml
services:
  backend:
    build:
      context: ./backend
    env_file: .env.prod
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "127.0.0.1:8000:8000"
    networks: [internal]
    # Pas besoin de 'command:' si le Dockerfile définit déjà CMD (Gunicorn)
```

> Après un déploiement/upgrade : `docker compose -f docker-compose.prod.yml up -d --build` puis **vérifier les statiques Django** (\§11) et **confirmer le routage Traefik** (\§7.3).

---

## 13) Déploiement via Docker Compose

### 13.1 Commandes standard (prod)

```bash
# Build images à jour
docker compose -f docker-compose.prod.yml --env-file .env.prod build --pull backend frontend

# Appliquer les migrations
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py migrate --noinput

# Relancer backend + frontend derrière Traefik
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend frontend

# Vérifier les logs (backend + Traefik)
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend traefik
```

### 13.2 Intégration CI/CD (pseudocode)

```bash
docker login registry
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod build backend frontend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build db backend frontend
```

---

## 14) Checklist de déploiement PROD (front + back)

1. `docker compose -f docker-compose.prod.yml --env-file .env.prod build --pull backend frontend`
2. `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db`
3. `docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py migrate --noinput`
4. `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend frontend`
5. **Vérifications** :
   * `curl -If https://${APP_HOST}/` → 200
   * `curl -If https://${APP_HOST}/api/health/` → 200
6. **Logs** : `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend traefik`
