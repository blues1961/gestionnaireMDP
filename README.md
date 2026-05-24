# Gestionnaire MDP

Application auto-hebergee de gestion de mots de passe, basee sur Django REST Framework, React/Vite, PostgreSQL et Docker Compose.

Le projet implemente aujourd'hui une voute chiffree cote client pour les secrets applicatifs, avec :

- authentification JWT ;
- categories par utilisateur ;
- entrees de mots de passe isolees par utilisateur ;
- chiffrement local des champs sensibles avant envoi au backend ;
- verification locale de la cle de dechiffrement ;
- export/import local du trousseau de cle ;
- stockage optionnel de bundles de secrets par application et environnement.

La documentation structurante de reference est :

- `README_DEV.md` pour le workflow developpeur ;
- `INVARIANTS.md` pour les conventions globales et les ecarts connus ;
- `docs/specification.md` pour la vue d'ensemble fonctionnelle et technique ;
- `docs/api.md` pour les endpoints backend reels ;
- `CODEX_START.md` et `AGENTS.md` pour le travail assiste par IA.

## Demarrage rapide

Le workflow `env` suit maintenant la base du template :

```bash
cp .env.template.example .env.template
make generate-env
make dev
make up
make migrate
make createsuperuser
```

Ensuite :

- frontend dev : `http://localhost:${DEV_VITE_PORT}`
- API Django : `http://localhost:${DEV_API_PORT}/api/`
- admin Django : `http://localhost:${DEV_API_PORT}/admin/`

Par defaut dans ce depot avec `APP_NO=1` :

- frontend : `http://localhost:5174`
- API : `http://localhost:8002/api/`
- admin : `http://localhost:8002/admin/`

## Fonctionnement metier

Le projet ne chiffre pas tout.

Sont chiffres cote client avant stockage :

- `login`
- `password`
- `notes`

Restent lisibles cote serveur :

- le titre de l'entree ;
- l'URL ;
- la categorie associee ;
- les metadonnees des bundles de secrets (`app`, `environment`).

La logique actuelle est donc une approche "zero-knowledge partielle" : le serveur ne peut pas lire les secrets stockes dans `ciphertext`, mais il conserve certaines metadonnees en clair.

## Stack cible

- backend : Django + Django REST Framework
- frontend : React + Vite
- base de donnees : PostgreSQL
- auth : JWT
- orchestration : Docker Compose
- reverse proxy de production : Traefik externe au depot

## Conformite aux invariants

Le projet vise les invariants communs des applications auto-hebergees de cet ecosysteme :

- backend sous `/api`
- frontend sans URL absolue codee en dur
- `VITE_API_BASE=/api`
- secrets dans `.env.local`
- separation `dev` / `prod`
- services Docker standardises `db`, `backend`, `frontend`
- ports derives de `APP_NO`

`make create-env` reste disponible comme aide interactive pour bootstrapper `.env.template`, puis lancer `make generate-env`.

Ce depot presente encore plusieurs ecarts de structure par rapport a `app-template`, documentes dans `INVARIANTS.md`. La documentation a ete re-ecrite pour rendre ces ecarts explicites et ne pas les propager.
