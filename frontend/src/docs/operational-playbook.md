# Plan de reprise après crash & exploitation (DEV/PROD) — Révision 2025‑08‑19

## Ce qui change (résumé)

* Les **fichiers d’environnement** sont désormais : **`.env.dev`** (développement) et **`.env.prod`** (production).
* Les fichiers **Docker Compose** utilisés sont : **`docker-compose.dev.yml`** (DEV) et **`docker-compose.prod.yml`** (PROD).
* Les **fichiers statiques du frontend** sont **servis par Apache** en production et **déployés via Vite** (build `frontend/dist/`).
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
8. **PROD uniquement :** vérifier que les fichiers **frontend** sont bien **servis par Apache** (voir section **7 - Frontend statique**).

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
BACKUP_FILE="backups/backup_$(date +%F_%H%M%S).sql"
docker compose -f docker-compose.dev.yml exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$BACKUP_FILE"
```

* Sauvegardes stockées dans `backups/` (mettre dans `.gitignore`).
* Créer un script `scripts/backup-db.sh` pour automatiser.

### Vérification :

```bash
ls -lh backups/
head -n 5 backups/backup_*.sql
```

### Restauration :

```bash
FILE=backups/backup_YYYY-MM-DD_HHMMSS.sql
cat "$FILE" | docker compose -f docker-compose.dev.yml exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

### Bonnes pratiques :

* Faire un backup avant toute MAJ critique.
* Copier régulièrement les backups hors serveur.
* Tester la restauration au moins 1×/mois.

### Accès aux backups :

* Les fichiers sont créés dans le dossier `backups/` à la racine du projet.
* Pour exporter hors serveur :

```bash
scp backups/backup_YYYY-MM-DD_HHMMSS.sql user@serveur:/chemin/de/sauvegarde/
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
* `DJANGO_SECRET_KEY` + mots de passe PostgreSQL : dans **`.env.dev`** / **`.env.prod`** (selon l’environnement).
* Après modification des fichiers `.env.*`, redémarrer les conteneurs.

---

## 5) Git — Workflow

### Commandes de base :

```bash
git status
git add .
git commit -m "docs: playbook révisé (env_file + statiques Apache/Vite)"
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
* **Frontend non servi** : vérifier la conf Apache (DocumentRoot), la présence des fichiers `frontend/dist/` déployés, et les droits (`chown`/`chmod`).

---

## 7) Frontend statique (Vite + Apache)

### 7.1 Principe

* En **PROD**, le frontend (React) est **buildé avec Vite** et **servi par Apache** depuis le contenu de `frontend/dist/`.
* Le backend Django reste derrière (ex. via un proxy ou une route `/api/`).

### 7.2 Build Vite (exemple de script)

```bash
# 1) Build frontend
say "Build du frontend avec VITE_API_BASE=${API_BASE}"
pushd "${FRONT_DIR}" >/dev/null
export VITE_API_BASE="${API_BASE}"
npm ci
npm run build
popd >/dev/null
```

> `VITE_API_BASE` doit pointer vers l’URL publique de l’API (ex. `https://app.mon-site.ca/api`).

### 7.3 Déploiement vers Apache

* Copier/rsync le contenu de `frontend/dist/` vers le **DocumentRoot** du vhost Apache (ex. `/var/www/app.mon-site.ca/`).

```bash
rsync -av --delete frontend/dist/ /var/www/app.mon-site.ca/
```

* Vérifier la conf Apache (minimal) :

```apache
<VirtualHost *:80>
    ServerName app.mon-site.ca
    DocumentRoot /var/www/app.mon-site.ca
    <Directory "/var/www/app.mon-site.ca">
        Options FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    # ProxyPass /api http://127.0.0.1:8000/api
    # ProxyPassReverse /api http://127.0.0.1:8000/api
</VirtualHost>
```

> Adapter le vhost (HTTPS recommandé), activer les modules nécessaires (`a2enmod rewrite proxy proxy_http headers`), puis `systemctl reload apache2`.

### 7.4 Variables et CORS côté backend

* Mettre à jour `ALLOWED_HOSTS` et `CORS_ALLOWED_ORIGINS` pour le domaine (ex. `https://app.mon-site.ca`).
* Redémarrer le backend après modification de `.env.prod`.

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
GZIP=1 \
./scripts/backup-db.sh
```

### 8.2 `scripts/restore-db.sh` — restauration .sql / .sql.gz

**Exemples :**

```bash
# DEV
./scripts/restore-db.sh backups/backup_2025-08-12_031500.sql.gz

# PROD (spécifie le compose prod)
COMPOSE_FILE=docker-compose.prod.yml ./scripts/restore-db.sh /var/backups/gestionnaire_mdp/backup_2025-08-12_031500.sql.gz
```

### 8.3 Cron d’automatisation (prod)

```cron
0 3 * * * cd /opt/gestionnaire_mdp_zero_knowledge && \
  COMPOSE_FILE=docker-compose.prod.yml \
  BACKUP_DIR=/var/backups/gestionnaire_mdp \
  RETENTION_DAYS=30 \
  GZIP=1 \
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
      - db_data:/var/lib/postgresql/data
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
    # Expose uniquement en localhost : Apache reverse-proxie vers 127.0.0.1:8000
    ports:
      - "127.0.0.1:8000:8000"
    networks: [internal]
    # Si le Dockerfile ne définit pas déjà le CMD/entrypoint :
    # command: gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 60

networks:
  internal:

volumes:
  db_data:
```

> **Apache (host)** : reverse proxy `/api/` → `http://127.0.0.1:8000/api/`. Le frontend (Vite) est déployé dans le `DocumentRoot` du vhost (cf. section 7).

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
      - db_data:/var/lib/postgresql/data
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
  db_data:
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
ALLOWED_HOSTS=app.mon-site.ca # en DEV: localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://app.mon-site.ca

# (Optionnel) URL complète côté frontend pour l'API
API_BASE=https://app.mon-site.ca/api
```

> En **DEV**, adaptez `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS` (ex. `http://localhost:5173`).

---

## 10) Dockerfile backend (prod)

> Dockerfile placé dans **`backend/Dockerfile`** (contexte de build = `./backend`). Multi‑stage non requis ici; image **python:3.12-slim** + Gunicorn. L’entrypoint attend la DB, applique les migrations et lance Gunicorn. Les statiques Django sont collectés dans `/app/staticfiles` (voir §11 pour publication sous Apache).

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

## 11) Publication des statiques Django sous Apache

**Objectif :** Apache sert `/static/` pour le backend (ex : Django admin). Le build Vite gère le frontend (DocumentRoot), cf. §7.

### 11.1 Pré‑requis côté Django

Dans `settings.py`, prévoir :

```python
import os
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_URL = "/static/"
STATIC_ROOT = os.environ.get("STATIC_ROOT", BASE_DIR / "staticfiles")
```

En **prod**, l’entrypoint exécute `collectstatic` et remplit `/app/staticfiles` (ou `STATIC_ROOT`).

### 11.2 Copie vers Apache (host)

Option simple via `docker cp` après build/démarrage :

```bash
# Copie les statiques collectés hors du conteneur backend
CID=$(docker compose -f docker-compose.prod.yml ps -q backend)
mkdir -p /var/www/app.mon-site.ca/static/
docker cp "$CID":/app/staticfiles/. /var/www/app.mon-site.ca/static/
# Droits (Ubuntu/Apache)
sudo chown -R www-data:www-data /var/www/app.mon-site.ca/static/
```

Vhost Apache (complément) :

```apache
Alias /static/ /var/www/app.mon-site.ca/static/
<Directory "/var/www/app.mon-site.ca/static/">
    Require all granted
    Options FollowSymLinks
</Directory>
```

> Alternative : montez un **volume bind** vers `/var/www/app.mon-site.ca/static/` et pointez `STATIC_ROOT` dessus; le `collectstatic` écrira directement dans le dossier servi par Apache.

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

> Après un déploiement/upgrade : `docker compose -f docker-compose.prod.yml up -d --build` puis **copier les statiques Django** (\§11.2) et **déployer le build Vite** (\§7.3).

---

## 13) Script de déploiement frontend — référence

Un script existe déjà :

* **Emplacement** : `scripts/deploy-frontend.sh`
* **Structure** : `scripts/` et `frontend/` sont des **répertoires frères** à la racine du projet; le script s'exécute **depuis la racine**.

### 13.1 Usage rapide

```bash
# Depuis la racine du projet
VITE_API_BASE="https://app.mon-site.ca/api" \
HOST="user@mon-serveur" \
REMOTE_DEST="/var/www/app.mon-site.ca" \
./scripts/deploy-frontend.sh
```

### 13.2 Variables d’environnement supportées (avec valeurs par défaut)

* `HOST` : alias SSH ou `user@host` (défaut : `linode-ca`)
* `REMOTE_TMP` : répertoire tampon côté serveur (défaut : `/tmp/app-mon-site.ca-dist`)
* `REMOTE_DEST` : destination finale côté serveur (défaut : `/var/www/app.mon-site.ca`)
* `FRONT_DIR` : dossier du frontend (défaut : `frontend`)
* `VITE_API_BASE` : base URL de l’API injectée dans le build Vite (défaut : `/api`)

### 13.3 Ce que fait le script

1. **Build** du frontend via Vite avec `VITE_API_BASE`.
2. **Upload** du dossier `dist/` vers `REMOTE_TMP` (SSH/rsync).
3. **Bascule atomique** de `REMOTE_TMP` → `REMOTE_DEST` côté serveur.
4. **Vérifications HTTP** via `curl` :

   * `GET /` (code 200 attendu)
   * `GET /api/csrf/` (code 200 attendu)

> Prérequis : accès SSH au serveur, Apache configuré avec `DocumentRoot` sur `REMOTE_DEST` (cf. §7), certificats TLS valides.

### 13.4 Bonnes pratiques

* Lancer le script depuis CI/CD avec un tag/sha clair.
* Forcer `--delete` lors de la synchro (déjà géré par le script si applicable) pour éviter les reliquats.
* Conserver un **backup du précédent déploiement** (snapshot ou dossier daté) si besoin de rollback rapide.

### 13.5 Arborescence type

```text
project-root/
├─ backend/
│  ├─ Dockerfile
│  └─ ...
├─ frontend/
│  ├─ src/
│  ├─ dist/        # généré par Vite
│  └─ ...
├─ scripts/
│  └─ deploy-frontend.sh
├─ docker-compose.dev.yml
├─ docker-compose.prod.yml
├─ .env.dev
└─ .env.prod
```

---

## 14) Checklist de déploiement PROD (front + back)

1. **Backend** : `docker compose -f docker-compose.prod.yml up -d --build`
2. **Statiques Django** : copier vers `/var/www/app.mon-site.ca/static/` (\§11.2)
3. **Frontend** : `./scripts/deploy-frontend.sh` (\§13)
4. **Tests santé** :

   * `https://app.mon-site.ca/` renvoie 200
   * `https://app.mon-site.ca/api/csrf/` renvoie 200
5. **Journalisation** : vérifier `journalctl -u apache2` et `docker compose logs backend`.
