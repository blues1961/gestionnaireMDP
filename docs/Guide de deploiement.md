# Guide pas à pas : pull & déploiement en **production**

Ce guide standardise le processus pour mettre à jour l’application de gestion de mots de passe sur le serveur **Ubuntu** (Apache + Docker). Il intègre l’usage de `.env.prod`, `docker-compose.prod.yml`, et le déploiement des pages **statiques** via **Vite** servi par **Apache**.

> Hypothèses (modifiez si besoin) :
>
> * Répertoire du projet : `/opt/apps/gestionnaire_mdp_zero_knowledge`
> * Fichier d’environnement prod : `.env.prod` (permissions strictes `600`)
> * Compose : `docker-compose.prod.yml`
> * Domaine d’app : `app.mon-site.ca`
> * API exposée via `api.mon-site.ca`
> * Dossier de déploiement Apache du front : `/var/www/app.mon-site.ca/` (docroot)
> * Le backend écoute sur le conteneur `backend` (port exposé via compose)
> * La base Postgres est le service `db`.

---

## 0) Pré-vol (à faire **une fois** ou à vérifier avant chaque mise à jour)

* Vérifier la présence de `.env.prod` à la racine du projet (non versionné, permissions `600`).
* **Clés requises** pour le front : définir **au moins l’une** des deux variables suivantes dans `.env.prod` :

  * `VITE_API_BASE=https://api.mon-site.ca/api` **ou**
  * `API_BASE=https://api.mon-site.ca/api` (le script l’utilisera pour définir `VITE_API_BASE`).
* Si une valeur contient des espaces, la mettre entre guillemets (ex. `BACKUP_CRON="0 3 * * *"`).
* Vérifier que `docker-compose.prod.yml` est bien présent.
* Créer le dossier de sauvegarde local au projet : `mkdir -p ./backups`.
* Vérifier que le docroot Apache existe et a les bons droits (ex. `/var/www/app.mon-site.ca/`).
* Vérifier que `rsync` est installé (`sudo apt-get install -y rsync`).
* Préparer un espace disque suffisant pour stocker les dumps.

---

## 1) Connexion et positionnement

```bash
ssh <user>@<votre_serveur>
cd /opt/apps/gestionnaire_mdp_zero_knowledge
```

---

## 2) Sauvegarde express de la base **avant** l’arrêt

```bash
set -a
. ./.env.prod
set +a

TS=$(date +"%Y%m%d-%H%M%S")
mkdir -p ./backups

docker compose -f docker-compose.prod.yml exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  db pg_dump \
    -h 127.0.0.1 -p 5432 \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  > "./backups/db-$TS.sql"

ls -lh "./backups/db-$TS.sql"
```

Optionnel : `gzip ./backups/db-$TS.sql`

### Vérification rapide du contenu

```bash
docker compose -f docker-compose.prod.yml exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
  "SELECT COUNT(*) FROM api_passwordentry;"
```

---

## 3) Arrêt contrôlé des conteneurs

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

---

## 4) Récupération du code (pull)

```bash
git fetch --all
git checkout main
git pull --ff-only origin main
```

---

## 5) Build & déploiement **frontend**

```bash
./scripts/deploy-frontend.sh
```

Voir `scripts/deploy-frontend.sh` : charge `.env.prod`, construit via Vite, et déploie dans `/var/www/app.mon-site.ca/`.

---

## 6) Build des images & redémarrage

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build --pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend \
  python manage.py migrate --noinput
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend
```

---

## 7) Smoke tests

```bash
# Déduire la base API
test -f .env.prod && set -a && source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' ./.env.prod | sed 's/\r$//') && set +a
API_BASE_EFFECTIVE="${VITE_API_BASE:-${API_BASE:-https://api.mon-site.ca/api}}"

# Tester /health
curl -i "$API_BASE_EFFECTIVE/health"  | head -n 10 || true
curl -i "$API_BASE_EFFECTIVE/health/" | head -n 10 || true

# Vérifier front
curl -I https://app.mon-site.ca/ | head -n 1
```

> ⚠️ Si 404 :
>
> * Vérifier que `VITE_API_BASE` pointe sur `https://api.mon-site.ca/api`.
> * Vérifier que la route `/api/health/` est bien définie dans `urls.py`.
> * Vérifier que le port `8000` est exposé et que le vhost Apache de `api.mon-site.ca` redirige vers `127.0.0.1:8000`.
> * **Dans l’onglet Réseau du navigateur** : si les appels partent vers `/login/` (sans `/api/`) au lieu de `/api/login/`, alors `VITE_API_BASE` est probablement mal défini.

---

## 8) Config Apache pour l’API (exemple)

```
<VirtualHost *:80>
  ServerName api.mon-site.ca
  ProxyPreserveHost On
  ProxyPass        / http://127.0.0.1:8000/
  ProxyPassReverse / http://127.0.0.1:8000/
</VirtualHost>
```

```bash
sudo a2enmod proxy proxy_http
sudo apachectl configtest && sudo systemctl reload apache2
```

---

## 9) Rollback rapide

* Frontend : re-déployer la version précédente.
* Backend : revenir à un commit stable et rebuild.
* Base : restaurer un dump depuis `./backups/`.

---

## 10) Script d’orchestration

`scripts/prod-update.sh` : enchaîne sauvegarde DB, arrêt, pull, rebuild, migrations, redémarrage.

Exemple de contenu :

```bash
#!/bin/bash
set -euo pipefail

cd /opt/apps/gestionnaire_mdp_zero_knowledge

TS=$(date +"%Y%m%d-%H%M%S")
source .env.prod

# Backup
mkdir -p ./backups
docker compose -f docker-compose.prod.yml exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  pg_dump -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  > ./backups/db-$TS.sql

# Down
docker compose -f docker-compose.prod.yml --env-file .env.prod down

# Pull
git fetch --all
git checkout main
git pull --ff-only origin main

# Frontend
./scripts/deploy-frontend.sh

# Backend
docker compose -f docker-compose.prod.yml --env-file .env.prod build --pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py migrate --noinput
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend

# Smoke test
curl -fsS https://api.mon-site.ca/api/health/ || true
```

---

## 11) Dépannage rapide

* Passer `--env-file .env.prod` aux commandes Docker.
* Vérifier droits `/var/www/app.mon-site.ca/` si `rsync` échoue.
* Vérifier `API_BASE`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`.
* Logs backend :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend
```

---

## 12) Résumé opératoire

```bash
cd /opt/apps/gestionnaire_mdp_zero_knowledge
TS=$(date +"%Y%m%d-%H%M%S")
docker compose -f docker-compose.prod.yml exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  pg_dump -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  > ./backups/db-$TS.sql

docker compose -f docker-compose.prod.yml --env-file .env.prod down
git fetch --all && git checkout main && git pull --ff-only origin main
./scripts/deploy-frontend.sh
docker compose -f docker-compose.prod.yml --env-file .env.prod build --pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py migrate --noinput
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend
curl -fsS https://api.mon-site.ca/api/health/ || true
```

---

# Annexes

## Annexe A — Résolution de l’enfer des paths

* **Option A** :

  * `.env.prod` : `VITE_API_BASE=https://api.mon-site.ca/api`
  * Code front : appels comme `api.post('/login/', data)` (pas de `/api` en dur).
* **Option B** :

  * `.env.prod` : `VITE_API_BASE=https://api.mon-site.ca`
  * Code front : appels comme `api.post('/api/login/', data)`.

👉 Le problème typique est `POST /api/api/login/` → cela signifie que la base ET le chemin ajoutent `/api`. Corriger en choisissant UNE seule des deux options.

Vérifier avec DevTools → Network → onglet XHR/fetch → filtrer sur `login`.

## Annexe B — Gestion des scripts

* **Séparation recommandée** :

  * `scripts/dev-*` : utilitaires pour dev local (ex. build front vite local, migrations rapides).
  * `scripts/prod-*` : scripts exécutés uniquement en prod (sécurisés, avec `set -euo pipefail`).
  * `scripts/shared-*` : bouts communs (backup, helpers, etc.).
* **Versionnement** :

  * Garder les scripts génériques dans Git.
  * Exclure du Git les scripts contenant des secrets ou des chemins locaux (ajouter au `.gitignore`).
* **Nomination** : utiliser un préfixe clair (`dev-`, `prod-`, `shared-`).
* **Documentation** : maintenir ce guide à jour et pointer chaque script vers son usage attendu.

---
