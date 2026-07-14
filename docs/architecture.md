# Architecture — gestionnaireMDP

<!--
Document généré en aperçu par project-assistant.
Le contenu doit être validé avant son intégration.
-->

## Vue d'ensemble

`gestionnaireMDP` est une application avec frontend React, backend Django, base de données PostgreSQL, orchestrée avec Docker Compose, exposée par Traefik.

- Langages détectés : `CSS`, `HTML`, `JSON`, `JavaScript`, `Markdown`, `Python`, `Shell`, `YAML`.
- Frameworks détectés : `Django`, `React`, `Vite`.
- Technologies détectées : `Django`, `Docker Compose`, `PostgreSQL`, `React`, `Traefik`, `Vite`.
- Fichiers Docker Compose : `docker-compose.dev.yml`, `docker-compose.prod.yml`.

## Composants

### Frontend

Services frontend détectés : `frontend`.

### Backend

Services backend détectés : `backend`.

### Base de données

Services de base de données détectés : `db`.

### Services Docker

| Service | Environnements | Image / build | Dépendances | Healthcheck |
|---|---|---|---|---|
| `backend` | `dev`, `prod` | image `${APP_SLUG}-backend:dev`<br>build `./backend` | `db` | non détecté |
| `db` | `dev`, `prod` | image `postgres:16-alpine` | `aucun` | oui |
| `frontend` | `dev`, `prod` | image `node:20-alpine`<br>build `./frontend` | `backend` | non détecté |

## Flux de données

Le flux applicatif principal détecté est le suivant :

1. Le navigateur charge l’interface servie par le frontend.
2. Le frontend communique avec le backend par HTTP.
3. Le backend applique la logique métier et accède à PostgreSQL.
4. Les réponses du backend sont retournées au frontend.

## Flux réseau

- Réseaux Docker détectés : `appnet`, `edge`.
- Réseaux externes : `edge`.

Traefik agit comme point d’entrée HTTP/HTTPS en production.
Les routes détectées dans les labels Compose sont :

- `backend` : `Host(`${APP_HOST}`) && PathPrefix(`/api/`)`
- `backend` : `Host(`${APP_HOST}`) && PathPrefix(`/admin/`)`
- `frontend` : `Host(`${APP_HOST}`) && !PathPrefix(`/api/`) && !PathPrefix(`/admin/`)`

- Ports publiés par `backend` : `${DEV_API_PORT:-8002}:8000`, `${PROD_API_BIND:-127.0.0.1}:${PROD_API_PORT:-8000}:8000`.
- Ports publiés par `db` : `${DEV_DB_PORT:-5433}:5432`, `${PROD_DB_BIND:-127.0.0.1}:${PROD_DB_PORT:-5432}:5432`.
- Ports publiés par `frontend` : `${DEV_VITE_PORT:-5174}:5173`, `${PROD_FRONT_BIND:-127.0.0.1}:${PROD_FRONT_PORT:-8080}:80`.

## Persistance

- Volumes nommés : `node_modules`, `pgdata`.

- Montages de `backend` : `./backend:/app`.
- Montages de `db` : `pgdata:/var/lib/postgresql/data`.
- Montages de `frontend` : `./frontend:/app`, `node_modules:/app/node_modules`.

## Sécurité

- Les secrets locaux sont conservés dans les fichiers se terminant par `.local`.
- Le fichier `.env` est un lien symbolique vers la configuration de l’environnement actif.
- Fichiers d’environnement détectés : `.env.dev`, `.env.local`, `.env.prod`.
- Traefik assure la terminaison et le routage HTTP/HTTPS en production.

Les contraintes de sécurité détaillées restent définies dans `INVARIANTS.md` et dans la documentation spécialisée du projet.

## Décisions d'architecture

- Le frontend, le backend et la base de données sont séparés en services Docker.
- Les environnements de développement et de production possèdent des fichiers Compose distincts.
- `.env` sélectionne la configuration active par lien symbolique.
- Traefik est le point d’entrée réseau de la production.
- Vite est utilisé pour le développement ou la construction du frontend.
- PostgreSQL assure la persistance relationnelle.

## Limites et dette technique

Les limites connues et les écarts qui ne doivent pas être aggravés sont documentés dans `INVARIANTS.md`, `README_DEV.md` et `docs/specification.md`.
