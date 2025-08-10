# Gestionnaire de mots de passe (Zero-Knowledge) — Django + React + PostgreSQL + Docker + Traefik

Ce dépôt contient un **MVP fonctionnel** d'un gestionnaire de mots de passe **zéro-connaissance** :
- Chiffrement **côté client** (Web Crypto API) avant envoi au serveur
- Stockage sur **PostgreSQL**
- API REST **Django + DRF + JWT**
- Frontend **React** (Vite) avec générateur de mots de passe et recherche instantanée
- Déploiement **Docker Compose** avec **Traefik** (HTTPS Let's Encrypt auto)

> ⚠️ Un seul utilisateur (scénario personnel). Pas de partage, pas de pièces jointes/notes.

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
- Copiez `.env.example` -> `.env` et adaptez (mettez `DJANGO_DEBUG=True` et `CORS_ALLOWED_ORIGINS=http://localhost`)
- Lancer :
```bash
docker compose -f docker-compose.dev.yml up --build
```
- Frontend: `http://localhost:5173`
- API: `http://localhost:8000`

---

## 7) Autofill (navigateur + Android)
- Un dossier `webextension/` fournit une ébauche d'extension Manifest V3 (content script simple) pour autofill.
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
  - `POST /api/token/` (obtenir `access`/`refresh`)
  - `POST /api/token/refresh/`
- Ressources :
  - `GET/POST /api/categories/`
  - `GET/POST /api/passwords/` (CRUD)
- Tous les payloads de mots de passe sont **déjà chiffrés** côté client.

---

## 10) Mises à jour & maintenance
- Certificats Let's Encrypt : **auto-renew** via Traefik
- Migrations :
```bash
docker compose exec backend python manage.py migrate
```
- Sauvegardes : voir `scripts/backup.sh`

---

## 11) Tests rapides
- Ajouter une catégorie, créer une entrée chiffrée, recharger la page, vérifier persistance.
- Tester depuis un téléphone en 4G pour valider HTTPS public.

Bonne construction !
