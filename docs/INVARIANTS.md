# Invariants annexes

Ce document n'est plus un contrat primaire cross-apps.

La source de verite pour `gestionnaireMDP` est :

1. `../INVARIANTS.md`
2. `specification.md`
3. `api.md`

Ce fichier sert uniquement de rappel compact pour les annexes de `docs/`.

## Invariants courants du depot

- services Compose standardises : `db`, `backend`, `frontend`
- noms de conteneurs : `${APP_SLUG}_<service>_${APP_ENV}`
- backend sous `/api`
- frontend sans URL absolue vers le backend
- `VITE_API_BASE=/api`
- ports dev derives de `APP_NO`
- secrets reels uniquement dans `.env.local`
- `.env` est un symlink vers `.env.dev` ou `.env.prod`
- auth principale : JWT SimpleJWT
- `GET /api/whoami/` et `GET /api/auth/whoami/` exigent un JWT
- compat session legacy isolee sous `/api/auth/session/*`
- alias historiques `/api/csrf/`, `/api/login/`, `/api/logout/` conserves mais deprecies
- logout JWT : `POST /api/auth/jwt/logout/`
- paire de cles locale stockee en `IndexedDB`
- migration legacy possible depuis `localStorage`, puis purge de la copie legacy

## Ce qu'il ne faut pas reintroduire

- un service Compose `vite` comme contrat structurel separe du service `frontend`
- une auth DRF par session/basic sur les routes JWT standard
- une cle privee utilisateur conservee en clair dans `localStorage`
- des secrets dans `.env.dev` ou `.env.prod`
- des routes frontend qui codent `/api` en dur devant une base deja relative

## Usage recommande

Avant de modifier une annexe de `docs/`, verifier :

- `../README_DEV.md` pour le workflow
- `../INVARIANTS.md` pour les regles globales
- `api.md` pour la surface backend reelle
- `specification.md` pour le comportement applicatif attendu
