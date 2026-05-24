# Guide pas à pas : pull & déploiement en **production**

Ce guide standardise le processus pour mettre à jour l’application de gestion de mots de passe sur un serveur **Ubuntu** (Docker Compose + Traefik). Il s’appuie sur `.env.prod`, `docker-compose.prod.yml` et publie automatiquement l’application derrière Traefik (terminaison TLS + routage `/api → backend`).

> Hypothèses (modifiez si besoin) :
>
> * Répertoire du projet : `/opt/apps/mdp`
> * Fichier d’environnement prod : `.env.prod` (permissions strictes `600`)
> * Compose : `docker-compose.prod.yml`
> * Traefik publie le domaine applicatif `mdp.mon-site.ca` (resolver TLS `le`)
> * Le backend écoute sur le conteneur `backend` (port interne 8000)
> * La base Postgres est le service `db`.

---

## 0) Pré-vol (à faire **une fois** ou à vérifier avant chaque mise à jour)

* Vérifier la présence de `.env.prod` à la racine du projet (non versionné, permissions `600`).
* Vérifier que `.env.prod` contient notamment `APP_HOST=mdp.mon-site.ca`, `VITE_API_BASE=/api` (chemin relatif) et, si besoin d’accès locaux, ajuster `PROD_DB_PORT` / `PROD_API_PORT` / `PROD_FRONT_PORT` (bind 127.0.0.1 par défaut).
* Si une valeur contient des espaces, la mettre entre guillemets (ex. `BACKUP_CRON="0 3 * * *"`).
* Vérifier que `docker-compose.prod.yml` est bien présent.
* Créer le dossier de sauvegarde local au projet : `mkdir -p ./backups`.
* Préparer un espace disque suffisant pour stocker les dumps.

---

## 1) Connexion et positionnement

```bash
ssh <user>@<votre_serveur>
cd /opt/apps/mdp
```

---

## 2) Sauvegarde express de la base **avant** l’arrêt

```bash
set -a
. ./.env.prod
set +a

TS=$(date +"%Y%m%d-%H%M%S")
mkdir -p ./backups
SLUG=${APP_SLUG:-mdp}
OUT="./backups/${SLUG}_db-$TS.sql.gz"

docker compose -f docker-compose.prod.yml exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  db pg_dump \
    -h 127.0.0.1 -p 5432 \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip > "$OUT"

ls -lh "$OUT"
```

> Le fichier est compressé en gzip par défaut (`*.sql.gz`).

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

## 5) Build des images & redémarrage

```bash
# Build backend + frontend (pull dernières bases d'images)
docker compose -f docker-compose.prod.yml --env-file .env.prod build --pull backend frontend

# Redémarre la base puis applique les migrations
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend \
  python manage.py migrate --noinput

# Relance backend + frontend (Traefik se charge du routage)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend frontend
```

---

## 7) Smoke tests

```bash
# Charge l'environnement pour dériver l'hôte public
test -f .env.prod && set -a && source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' ./.env.prod | sed 's/\r$//') && set +a

APP_URL="https://${APP_HOST}"
API_URL="${APP_URL}${VITE_API_BASE%/}"

# Tester /health
curl -i "${API_URL}/health"  | head -n 10 || true
curl -i "${API_URL}/health/" | head -n 10 || true

# Vérifier le front (Traefik -> frontend)
curl -I "${APP_URL}/" | head -n 1
```

> ⚠️ Si 404 :
>
> * Vérifier que `VITE_API_BASE` vaut `/api` (chemin relatif).
> * Vérifier que la route `/api/health/` est bien définie dans `urls.py`.
> * Confirmer que Traefik publie bien le service `backend` (`docker compose ps` et `docker compose logs traefik`).
> * **Dans l’onglet Réseau du navigateur** : si les appels partent vers `/login/` (sans `/api/`), alors `VITE_API_BASE` est probablement mal défini.

---

## 8) Traefik (rappel)

* Le fichier `docker-compose.prod.yml` déclare les labels Traefik nécessaires :
  * `/api/*` et `/admin/*` → service `backend` (port interne 8000)
  * le reste (`/`) → service `frontend` (port interne 80)
  * redirection HTTP → HTTPS via le middleware `mdp-redirect-https`
* Le réseau externe `edge` doit exister (`docker network ls | grep edge`).
* Pour vérifier la configuration dynamique :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f traefik
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

cd /opt/apps/mdp

TS=$(date +"%Y%m%d-%H%M%S")
source .env.prod
SLUG=${APP_SLUG:-mdp}
OUT="./backups/${SLUG}_db-$TS.sql.gz"

# Backup
mkdir -p ./backups
docker compose -f docker-compose.prod.yml exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  pg_dump -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip > "$OUT"

ls -lh "$OUT"

# Down
docker compose -f docker-compose.prod.yml --env-file .env.prod down

# Pull
git fetch --all
git checkout main
git pull --ff-only origin main

# Compose : rebuild + restart
docker compose -f docker-compose.prod.yml --env-file .env.prod build --pull backend frontend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py migrate --noinput
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend frontend

# Smoke test (Traefik)
curl -fsS "https://${APP_HOST}/api/health/" || true
```

---

## 11) Dépannage rapide

* Passer `--env-file .env.prod` aux commandes Docker.
* Vérifier `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`.
* Vérifier que Traefik voit les services (`docker compose -f docker-compose.prod.yml --env-file .env.prod ps`).
* Logs backend / Traefik :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend traefik
```

---

## 12) Résumé opératoire

```bash
cd /opt/apps/mdp
TS=$(date +"%Y%m%d-%H%M%S")
SLUG=${APP_SLUG:-mdp}
OUT="./backups/${SLUG}_db-$TS.sql.gz"
docker compose -f docker-compose.prod.yml exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  pg_dump -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip > "$OUT"

ls -lh "$OUT"

docker compose -f docker-compose.prod.yml --env-file .env.prod down
git fetch --all && git checkout main && git pull --ff-only origin main
docker compose -f docker-compose.prod.yml --env-file .env.prod build --pull backend frontend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py migrate --noinput
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend frontend
curl -fsS "https://${APP_HOST}/api/health/" || true
```

---

# Annexes

## Annexe A — Résolution de l’enfer des paths

* Invariant : `.env.prod` doit définir `VITE_API_BASE=/api` (chemin relatif)
* Les appels front restent relatifs : `api.post('auth/jwt/create/', data)` ou `api.get('passwords/')` (pas de `/api` codé en dur)

👉 Le problème typique est `POST /api/api/auth/jwt/create/` ou `GET /api/api/passwords/` : cela signifie que le code a préfixé `/api` **et** que `VITE_API_BASE` n’est pas relatif. Remettre `VITE_API_BASE=/api` et retirer le `/api` superflu dans les appels.

Vérifier avec DevTools → Network → onglet XHR/fetch → filtrer sur `login`.

## Annexe B — Gestion des scripts

* **Séparation recommandée** :

  * `scripts/` expose les points d'entree standard du depot (`init.sh`, `up.sh`, `migrate.sh`, `check-invariants.sh`, etc.).
  * les sous-dossiers comme `scripts/dev/` restent possibles pour des utilitaires locaux secondaires.
  * les scripts de production doivent rester explicites, securises et documentes.
* **Versionnement** :

  * Garder les scripts génériques dans Git.
  * Exclure du Git les scripts contenant des secrets ou des chemins locaux (ajouter au `.gitignore`).
* **Nomination** : privilegier les noms standards du depot avant d'ajouter une nouvelle famille de scripts.
* **Documentation** : maintenir ce guide à jour et pointer chaque script vers son usage attendu.

---
