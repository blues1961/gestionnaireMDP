# Documentation interne

Ce dossier contient des guides et procédures pour le projet **gestionnaire_mdp_zero_knowledge**.

- `prod-update-guide.md` : procédure pas à pas pour mettre à jour l'application en **production**.

⚠️ **Attention** : ces documents peuvent contenir des chemins, noms de domaine ou commandes sensibles.  
Ils ne doivent pas être intégrés au frontend compilé, ni exposés publiquement.  

- **Contrat d’invariants (template “MDP”)** : [INVARIANTS.md](INVARIANTS.md)


# INVARIANTS (condensé) — Copilote d’infrastructure

## Rôle

Respecter **scrupuleusement** le contrat d’architecture. Proposer des changements **compatibles**, **minimaux**, **réversibles**. Snippets **prêts à copier**. En prod, **Traefik = frontal unique**.

## Invariants clés

* **Pas de secrets** dans des `.env` versionnés.
* **Noms Compose fixes** : `db`, `backend`, `vite`, `frontend`.
* **API sous `/api/`** ; **JWT** (SimpleJWT) pour auth (create/refresh/verify, `whoami`).
* **Ports DEV** dérivés de `APP_NO` : DB `5432+N`, API `8001+N`, Vite `5173+N`.

## Nommage & chemins

* Dev : `~/projets/${APP_DEPOT}`
* Prod : `/opt/apps/${APP_SLUG}`
* Ressources Docker : `${APP_SLUG}_<service>_${APP_ENV}` ; réseau `${APP_SLUG}_appnet`

## Fichiers d’environnement

* Versionnés : `.env.dev`, `.env.prod` (**non sensibles**).
* Exemple secret : `.env.local.example`.
* Secrets réels **uniquement** en `*.local` (non commit).
* `.env` est un **symlink** vers `.env.$(APP_ENV)`.

## Backend (Django)

* Dev : `runserver 0.0.0.0:8000`.
* JWT endpoints : `/api/auth/jwt/{create,refresh,verify}/`, `whoami` canon = `/api/whoami/` (+ alias `/api/auth/whoami/`).
* CORS/CSRF dev : autoriser `http://localhost:${DEV_VITE_PORT}` ; `ALLOWED_HOSTS` dev minimal.

## Frontend (Vite + React + Axios)

* Vite dev proxy :

```js
proxy: { '/api': { target: 'http://backend:8000', changeOrigin: false } }
```

* `VITE_API_BASE = /api` (**relatif**).
* Axios : baseURL depuis `VITE_API_BASE`, login via `auth/jwt/create/`, interceptor 401.
* Stockage tokens : `localStorage['mdp.jwt']` (source unique).

## Flux dev

1. Vite écoute 5173 (→ `5173+N` hôte)
2. Appel `/api` → proxy → backend:8000
3. Django répond (CORS/CSRF/hosts alignés)

## Production

* `.env` → `.env.prod`.
* **Traefik** publie `/api` → backend (gunicorn/uwsgi) + assets front.
* **Jamais** 80/443 bind par l’app.
* `ALLOWED_HOSTS` inclut `APP_HOST`.

## Makefile (extraits)

* `help` (par défaut), `envlink[-dev|-prod]`, `up/down/restart/ps/logs`,
* `makemigrations/migrate/createsuperuser/psql`,
* `prod-deploy`, `prod-health`, `prod-logs`,
* `dps`, `dps-all` (listing containers).
* Chargement auto des secrets : `.env.local`.

## Checklist (pré-merge)

* `scripts/verifier-invariants.sh` **OK**
* Vite proxy `/api` → backend:8000
* `frontend/src/api.js` conforme (BASE, axios, login, interceptor)
* Endpoints JWT + `whoami` opérationnels
* Pas de secrets dans `.env.*` versionnés
* Ports/compose alignés (`APP_NO`)
* Dev/Prod : chemins & symlink `.env` corrects
