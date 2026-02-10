# Gestionnaire de mots de passe (Zero-Knowledge) — Django + React + PostgreSQL + Docker + Traefik

Ce dépôt contient un **MVP fonctionnel** d'un gestionnaire de mots de passe **zéro-connaissance** :
- Chiffrement **côté client** (Web Crypto API) avant envoi au serveur
- Stockage sur **PostgreSQL**
- API REST **Django + DRF + JWT**
- Frontend **React** (Vite) avec générateur de mots de passe et recherche instantanée
- Déploiement **Docker Compose** avec **Traefik** (HTTPS Let's Encrypt auto)

> ⚠️ Un seul utilisateur (scénario personnel). Pas de partage, pas de pièces jointes/notes.

> 🔐 **Invariants & contrat d’architecture** : voir [docs/INVARIANTS.md](docs/INVARIANTS.md)


---

## 1) Prérequis
- Un nom de domaine pointant vers votre VM Linode (A/AAAA)
- Ubuntu LTS récent
- Docker + Docker Compose

```bash
sudo apt update && sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo   "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu   $(. /etc/os-release && echo $VERSION_CODENAME) stable" |   sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
# Déconnectez-vous/reconnectez-vous pour appliquer le groupe docker
```

---

## 2) Configuration
Copiez `.env.example` en `.env` et **remplissez** les valeurs :
```bash
cp .env.example .env
nano .env
```
- `DOMAIN` : votre domaine (ex: `vault.mondomaine.ca`)
- `EMAIL_LETSENCRYPT` / `ACME_EMAIL` : e-mail pour Let's Encrypt
- `POSTGRES_PASSWORD`, `DJANGO_SECRET_KEY` : **forts**
- `CORS_ALLOWED_ORIGINS` : `https://votre_domaine`

---

## 3) Lancement en production (HTTPS)
```bash
docker compose up -d --build
```

- Traefik exposera automatiquement `https://DOMAIN`
- Backend: service `backend` (réseau interne, pas exposé en clair)
- Frontend: servi derrière Traefik

Vérifiez les logs Traefik/Backend en cas de besoin :
```bash
docker compose logs -f traefik
docker compose logs -f backend
```

---

## 4) Comptes & Authentification
- Le backend utilise l'auth Django. Créez un superuser **une fois** :
```bash
docker compose exec backend python manage.py createsuperuser
```
- Auth côté frontend via JWT (`/api/token/`)

> Le **mot de passe maître** n'est **jamais envoyé** au serveur : il sert à protéger votre **clé privée** côté client et/ou le keystore IndexedDB.

---

## 5) Sauvegardes chiffrées automatiques
Un cron dans le conteneur `backend` peut déclencher un dump PostgreSQL (les données sont **déjà chiffrées** côté client). Un script d'exemple est fourni dans `scripts/backup.sh` (archive compressée, option de chiffrement supplémentaire via `age` ou `openssl`).

Planification à adapter via crontab ou un service dédié.

---

## 6) Développement local
- Copiez `.env.example` -> `.env` et adaptez (mettez `DJANGO_DEBUG=1` et `FRONT_ORIGIN=http://localhost:${DEV_VITE_PORT}`)
- Lancer :
```bash
docker compose -f docker-compose.dev.yml up --build
```
- Frontend: `http://localhost:5173`
- API: `http://localhost:8000`

---

## 7) Autofill (navigateur + Android)
- Le dossier `contrib/firefox-extension/` contient l’extension Firefox complète (manifest v2) avec popup/options + autofill. Voir `contrib/README_AUTOFILL.md`.
- L’ancien proof-of-concept basé sur host natif reste disponible dans `contrib/extension/`.
- Android (Chrome/Firefox mobile) : chargez l'extension en mode développeur ou utilisez le PWA + clipboard sécurisé en attendant une intégration plus poussée.
- Le frontend fournit un bouton "Remplir" sur la page d'un site enregistré (détection d’URL).

---

## 8) Sécurité côté client
- **RSA-OAEP** pour sceller la clé symétrique AES-GCM
- **AES-GCM** (aléa 96 bits) pour chiffrer les champs sensibles (login, mot de passe, notes éventuelles)
- **IndexedDB** pour stocker la clé privée (optionnellement protégée par une phrase de passe via PBKDF2)

Voir `frontend/src/utils/crypto.js`.

---

## 9) API
- Endpoints JWT :
  - `POST /api/auth/jwt/create/` (obtenir `access`/`refresh`)
  - `POST /api/auth/jwt/refresh/`
  - `POST /api/auth/jwt/verify/`
  - `GET /api/whoami/`
- Ressources :
  - `GET/POST /api/categories/`
  - `GET/POST /api/passwords/` (CRUD)
  - `GET /api/secrets/` (liste des bundles de l'utilisateur, sans payload)
  - `GET /api/secrets/?app=<app>&env=<env>` (retourne le payload stocke pour l'utilisateur courant)
  - `POST|PUT /api/secrets/` (upsert d'un bundle chiffre)
  - `DELETE /api/secrets/?app=<app>&env=<env>`
- Tous les payloads de mots de passe sont **déjà chiffrés** côté client.

Exemple d'upsert d'un bundle (payload chiffre):

```bash
curl -X POST "https://mdp.mon-site.ca/api/secrets/" \
  -H "Authorization: Bearer <JWT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "app": "openweather",
    "env": "dev",
    "payload": {
      "ciphertext": "BASE64...",
      "iv": "BASE64...",
      "tag": "BASE64...",
      "salt": "BASE64..."
    }
  }'
```

Exemple de recuperation pour `pull-secrets`:

```bash
curl -H "Authorization: Bearer <JWT_ACCESS_TOKEN>" \
  "https://mdp.mon-site.ca/api/secrets/?app=openweather&env=dev"
```

---

## 10) Backup/restore des fichiers d'environnement (pull-secret)
Objectif: sauvegarder/restaurer les paires suivantes par environnement:
- `.env.dev` + `.env.dev.local`
- `.env.prod` + `.env.prod.local`

Le chiffrement est fait **localement** via `PULL_SECRET` avant envoi vers `/api/secrets/`.

Variables utiles:
- `PULL_SECRET` (optionnel): passphrase de chiffrement/dechiffrement directe.
- `PULL_ROOT_SECRET` (optionnel): secret racine pour dériver automatiquement `PULL_SECRET`.
- `PULL_SECRET_APP_ID` (optionnel): identifiant stable de dérivation (défaut: `APP_SLUG`).
- `PULL_SECRET_VERSION` (optionnel): version de dérivation (défaut: `v1`).
- `SECRET_ENV` (optionnel): `dev` ou `prod` (defaut = `APP_ENV` courant).
- `API_BASE_URL` (optionnel): override de l'API (sinon auto: dev `http://localhost:${DEV_API_PORT}/api`, prod `https://${APP_HOST}/api`).
- `JWT_ACCESS_TOKEN` (optionnel): token deja genere; sinon script tente `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
- `BUNDLE_APP` et `BUNDLE_ENV` (optionnels): cle logique du bundle distant.
- `FORCE=1` (pull uniquement): autorise l'ecrasement des fichiers existants.

Exemples:
```bash
# Backup des env de dev vers /api/secrets/
PULL_SECRET='mot-de-passe-long' make push-secret SECRET_ENV=dev

# Restore des env de dev depuis /api/secrets/
PULL_SECRET='mot-de-passe-long' make pull-secret SECRET_ENV=dev FORCE=1

# Variante recommandee multi-apps (derive automatiquement un secret par app/env)
PULL_ROOT_SECRET='secret-racine-long' PULL_SECRET_APP_ID='gestionnaireMDP' \
  make push-secret SECRET_ENV=dev

PULL_ROOT_SECRET='secret-racine-long' PULL_SECRET_APP_ID='gestionnaireMDP' \
  make pull-secret SECRET_ENV=dev FORCE=1
```

Commandes directes:
```bash
PULL_SECRET='mot-de-passe-long' ./scripts/push-secret.sh dev
PULL_SECRET='mot-de-passe-long' FORCE=1 ./scripts/pull-secret.sh dev
```

Backup distant en une commande (dev + prod vers l'API de prod):
```bash
PULL_ROOT_SECRET='secret-racine-long' PULL_SECRET_APP_ID='gestionnaireMDP' \
  make push-secret-all-remote
```
`API_BASE_URL` est optionnelle (defaut: `https://${APP_HOST_de_.env.prod}/api`).

---

## 11) Mises à jour & maintenance
- Certificats Let's Encrypt : **auto-renew** via Traefik
- Migrations :
```bash
docker compose exec backend python manage.py migrate
```
- Sauvegardes DB : voir `scripts/backup-db.sh` et `scripts/restore-db.sh`

---

## 12) Tests rapides
- Ajouter une catégorie, créer une entrée chiffrée, recharger la page, vérifier persistance.
- Tester depuis un téléphone en 4G pour valider HTTPS public.

Bonne construction !
