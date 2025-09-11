# INVARIANTS — **MDP** (inclut le *contrat d’architecture*)

> **Source de vérité.** Toute proposition/modification doit respecter ces règles.
> Les secrets ne doivent **jamais** apparaître dans les `.env` committés.

---

## 1) Nommage, dépôts, répertoires

* **APP\_DEPOT** : nom du dépôt Git **et** du répertoire de travail en dev.
* **APP\_SLUG** : préfixe stable pour images/containers/volumes réseaux et répertoire du projet en prod.
* **APP\_ENV** ∈ `{dev, prod}`.
* **APP\_NAME** : nom humain de l’application (entêtes/logs/outils).

**Contrainte** : toutes les applications utilisant ce template réutilisent les
mêmes noms de services Compose (`db`, `backend`, `vite`, `frontend`) et les scripts
universels déduisent l’environnement courant et (au besoin) `APP_SLUG`.

---

## 2) Ports dérivés de `APP_NO` (DEV)

On dérive des ports hôtes déterministes à partir de `APP_NO = N` :

* **DEV\_DB\_PORT**   = `5432 + N`   → Ex. N=1 ⇒ `5433`  (Postgres)
* **DEV\_API\_PORT**  = `8001 + N`   → Ex. N=1 ⇒ `8002`  (Django API)
* **DEV\_VITE\_PORT** = `5173 + N`   → Ex. N=1 ⇒ `5174`  (Vite)

**Invariants** : ces ports sont utilisés par Compose **et** par les scripts.

---

## 3) Environnements & secrets

### Fichiers

* **`.env.dev`** / **`.env.prod`** : variables **non sensibles** versionnées.
* **`.env.dev.local`** / **`.env.prod.local`** : **secrets** (non versionnés).

### Secrets (exemples de clés **uniquement** dans `.local`)

* `POSTGRES_PASSWORD`, `DJANGO_SECRET_KEY`.
* `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL` (création superuser).

> **Interdit** : ne jamais mettre des secrets dans `.env.dev` / `.env.prod`.

---

## 4) Conteneurisation (contrat)

### Services Compose (noms **fixes**)

* `db` (Postgres 16-alpine)
* `backend` (Django, image `${APP_SLUG}-backend:dev|prod`)
* `vite` (Node 20-alpine, dev-server)
* `frontend` (optionnel en dev : build statique servi par Caddy/Nginx)

### Noms concrets

* Containers, volumes, network : `${APP_SLUG}_<service>_${APP_ENV}` / `${APP_SLUG}_<nom>_${APP_ENV}`.
* Réseau par défaut : `${APP_SLUG}_appnet`.

### Dépendances & healthchecks

* `backend` dépend de `db` (healthy) ; `vite` dépend de `backend`.

---

## 5) Backend Django (API)

* **Commande dev** : `python manage.py runserver 0.0.0.0:8000` (écoute sur toutes les interfaces).
* **API base** : préfixe `/api/` (Django `urls.py`).
* **Auth** : SimpleJWT actif (`rest_framework_simplejwt`, `JWTAuthentication`).
* **CORS/CSRF (dev)** :

  * `CORS_ALLOWED_ORIGINS = http://localhost:<DEV_VITE_PORT>`
  * `CSRF_TRUSTED_ORIGINS = http://localhost, http://127.0.0.1, http://localhost:<DEV_VITE_PORT>[, http://localhost:<DEV_API_PORT>]`
* **ALLOWED\_HOSTS (dev minimal)** : `localhost,127.0.0.1,0.0.0.0,<containers backend/frontend>`
* **URLs JWT** : `/api/auth/jwt/create/` (+ endpoints standard refresh/verify si exposés).

---

## 6) Frontend (Vite + React + Axios)

### Vite (dev)

`frontend/vite.config.js`

```js
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173, // mappé vers 5173+N coté hôte
    proxy: {
      '/api': { target: 'http://backend:8000', changeOrigin: false },
    },
  },
})
```

### Variables front

* **`VITE_API_BASE`** = `/api` (toujours un **chemin relatif** en dev & prod)
* Injectée via Compose dans le service `vite`.

### Axios & base URL

`frontend/src/api.js` (invariants clés) :

* `import axios from "axios"`
* `export const BASE = normalizeBase(import.meta.env.VITE_API_BASE)`
* `export const api = axios.create({ baseURL: BASE })`
* POST login : `api.post('auth/jwt/create/', { username, password })`
* Intercepteur 401 → purge header & redirection `/login`.

### Stockage tokens (login)

* **Source unique** : `localStorage.setItem('mdp.jwt', JSON.stringify({ access, refresh }))`
* **Compat rétro (optionnel)** : `localStorage.setItem('token', access)`
* À la connexion : `setAccessToken(access)` pour armer Axios (`Authorization: Bearer ...`).
* À la déconnexion : `removeItem('mdp.jwt')` (+ purge `token` si présent).

---

## 7) Flux d’exécution (dev)

1. `vite` écoute `5173` dans le conteneur → `5173+N` sur l’hôte.
2. Le navigateur appelle `/api/...` → Vite **proxy** vers `http://backend:8000`.
3. Django répond ; CORS/CSRF/ALLOWED\_HOSTS sont configurés pour l’origine dev.

---

## 8) Compose (dev) — points d’attention

* `env_file: .env.dev` et `.env.dev.local` pour `db`, `backend`, `vite`.
* `backend.ports: "${DEV_API_PORT}:8000"`.
* `vite.ports: "${DEV_VITE_PORT}:5173"`.
* `VITE_API_BASE: "/api"` injecté dans le service `vite`.

---

## 9) Vérification automatique des invariants

Script : `scripts/vérifier_invariants.sh`

* Vérifie Vite proxy (`/api`, target backend:8000, `changeOrigin:false`).
* Vérifie `api.js` (import axios, `import.meta.env.VITE_API_BASE`, `axios.create`, endpoint JWT).
* Vérifie Django (SimpleJWT, URLs, runserver 0.0.0.0:8000).
* Vérifie Compose (commande runserver & `VITE_API_BASE:"/api"`).
* Effectue des *smoke tests* : création JWT via `http://localhost:${DEV_VITE_PORT}/api/...`.

> Toute PR doit passer ce script en local avant push.

---

## 10) Production (survol)

* Variables dans `.env.prod` + secrets dans `.env.prod.local`.
* `VITE_API_BASE` reste `/api` (chemin relatif).
* Reverse proxy (Apache/Nginx/Caddy) doit publier `/api` → backend (gunicorn/uwsgi) et les assets du front.
* `ALLOWED_HOSTS` minimal : `APP_HOST` et éventuels alias.

---

## 11) Règles *Do / Don’t*

**Do**

* Garder `/api` **relatif** côté front (pas d’URL absolue en dev/prod).
* Conserver des noms de services Compose stables (`db`,`backend`,`vite`,`frontend`).
* Centraliser les secrets dans `*.local` (jamais commit).
* Utiliser `mdp.jwt` comme **source unique** pour les tokens.

**Don’t**

* Pas de secrets dans `.env.dev` / `.env.prod` (ni dans la doc, ni dans les exemples).
* Pas de `changeOrigin:true` en dev pour `/api`.
* Pas d’URL front en dur pour l’API (toujours `VITE_API_BASE`).

---

## 12) Checklist de revue (avant merge)

* [ ] Script `scripts/vérifier_invariants.sh` **OK**.
* [ ] `frontend/vite.config.js` conforme.
* [ ] `frontend/src/api.js` conforme (BASE, axios, login endpoint, interceptor).
* [ ] `backend` lance `runserver 0.0.0.0:8000` en dev.
* [ ] `CORS_ALLOWED_ORIGINS` contient `http://localhost:${DEV_VITE_PORT}`.
* [ ] `CSRF_TRUSTED_ORIGINS` listées (localhost/127.0.0.1/ports dev).
* [ ] `ALLOWED_HOSTS` minimal.
* [ ] `.env.*.local` présents en local (non commit).

---

## 13) Emplacement du document

* **Chemin recommandé** : `docs/INVARIANTS.md` (ce document). Lien ajouté depuis `README.md`.

---

## 14) Extension cross‑apps

Ce document sert de **template** pour d’autres applications : mêmes noms de services,
mêmes conventions d’API/auth, dérivation des ports via `APP_NO`, mêmes scripts de vérification.
Seules changent les valeurs d’`APP_*` et les détails métier.

---

*Dernière mise à jour : synchronisée avec l’état du projet affiché dans `tree -L 4 -I 'node_modules|dist'`.*
