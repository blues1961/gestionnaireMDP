# Référence développeur de GestionnaireMDP

## Présentation technique

GestionnaireMDP utilise les technologies détectées pour son application serveur et son interface web. Cette référence décrit uniquement les éléments techniques structurés disponibles.

## Architecture Django et React

L’architecture démontrée associe une application Django à une interface React. Les routes sont centralisées dans la section **Routes et API**.

## Organisation des services

| Environnement | Service | Rôle |
|---|---|---|
| dev | backend | backend |
| dev | db | database |
| dev | frontend | frontend |
| prod | backend | backend |
| prod | db | database |
| prod | frontend | frontend |

## Backend

Composants Django détectés :
- api
- corsheaders
- django.contrib.admin
- django.contrib.auth
- django.contrib.contenttypes
- django.contrib.messages
- django.contrib.sessions
- django.contrib.staticfiles
- rest_framework
- rest_framework_simplejwt.token_blacklist

## Frontend

Capacités de l’interface détectées :
- Afficher une valeur protégée
- Aide
- Changement de thème
- Connexion
- Consulter les catégories
- Consulter les entrées de mots de passe
- Consulter les secrets applicatifs
- Créer des catégories
- Créer des entrées de mots de passe
- Créer des secrets applicatifs
- Exportation de clé
- Guide des catégories
- Générateur de mots de passe
- Gérer un coffre local chiffré côté client
- Importation de clé
- Modifier des catégories
- Modifier des entrées de mots de passe
- Modifier des secrets applicatifs
- Recherche
- Supprimer des catégories
- Supprimer des entrées de mots de passe
- Supprimer des secrets applicatifs
- S’authentifier à l’application
- Vérification de clé

## Authentification

L’authentification utilise les mécanismes détectés :
- Jetons JWT transmis avec le schéma Bearer.
- Session locale côté interface.

Les routes et méthodes démontrées figurent dans **Routes et API**.

## Routes et API

| Route | Méthodes |
|---|---|
| /admin/ | — |
| /api/auth/jwt/create/ | POST |
| /api/auth/jwt/logout/ | POST |
| /api/auth/jwt/refresh/ | — |
| /api/auth/jwt/verify/ | — |
| /api/auth/session/csrf/ | — |
| /api/auth/session/login/ | — |
| /api/auth/session/logout/ | — |
| /api/auth/session/whoami/ | — |
| /api/auth/whoami/ | — |
| /api/categories/ | GET, POST |
| /api/categories/{id}/ | GET, PUT, PATCH, DELETE |
| /api/csrf/ | — |
| /api/healthz/ | — |
| /api/login/ | — |
| /api/logout/ | — |
| /api/passwords/ | GET, POST |
| /api/passwords/{id}/ | GET, PUT, PATCH, DELETE |
| /api/secrets/ | GET, POST, PUT, DELETE |
| /api/whoami/ | — |

## Modèles ou capacités démontrées

Modèles structurés :
- Category
- PasswordEntry
- SecretBundle

## Configuration de développement

### Variables de configuration démontrées

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_USERNAME`
- `ALLOWED_HOSTS`
- `APP_DEPOT`
- `APP_ENV`
- `APP_HOST`
- `APP_NAME`
- `APP_NO`
- `APP_SLUG`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `DEV_API_PORT`
- `DEV_DB_PORT`
- `DEV_VITE_PORT`
- `DJANGO_DEBUG`
- `DJANGO_SECRET_KEY`
- `FRONT_ORIGIN`
- `POSTGRES_DB`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `PROD_API_BIND`
- `PROD_API_PORT`
- `PROD_DB_BIND`
- `PROD_DB_PORT`
- `PROD_FRONT_BIND`
- `PROD_FRONT_PORT`
- `TRAEFIK_DOCKER_NETWORK`
- `VITE_API_BASE`

## Commandes de développement et de test

La référence complète des cibles Make d’exploitation est publiée dans le **Guide d’exploitation**.

#### `test`

Exécute les suites de tests regroupées par le projet.

```bash
make test
```

#### `test-backend`

Exécute la suite de tests backend démontrée.

```bash
make test-backend
```

#### `test-frontend`

Exécute la suite de tests frontend démontrée.

```bash
make test-frontend
```

#### `token-test`

Exécute le contrôle de jeton et d’identité démontré.

```bash
make token-test
```

## Invariants techniques

### Documents protégés et contrat démontré

- `INVARIANTS.md`
- contrat app-template détecté dans INVARIANTS.md: APP_DEPOT, docker-compose.dev.yml, docker-compose.prod.yml
- cibles Make app-template vérifiées: 13
- docker-compose.dev.yml et docker-compose.prod.yml détectés
- services app-template détectés: db, backend, frontend

## Sécurité

### Contrôles de sécurité démontrés

| Identifiant | Catégorie | Règle | Preuve |
|---|---|---|
| APP-SEC-001 | authentification | Des mécanismes d’authentification ont été détectés côté backend et/ou frontend. | Bearer token, JWT, SimpleJWT |
| APP-SEC-002 | administration | Une interface d’administration Django est détectée et doit être réservée aux comptes autorisés. | backend/gestionnaire_mdp/urls.py |
| APP-SEC-003 | secrets | Des variables sensibles sont requises et leurs valeurs ne doivent pas être publiées dans le manuel. | ADMIN_PASSWORD, DJANGO_SECRET_KEY, POSTGRES_PASSWORD |

## Informations techniques manquantes

- La version applicative n’a pas été trouvée dans les métadonnées détectées.
- La version minimale de Python n’est pas déterminable statiquement.
- La version minimale de Node.js n’est pas documentée de manière fiable dans les faits structurés disponibles.
- La version minimale de Docker Compose n’est pas explicitement documentée.
- Les détails des tests d’intégration ne sont pas disponibles dans les faits structurés générés.
- Les schémas détaillés de requête et de réponse des endpoints ne sont pas disponibles.
- La matrice complète des codes d’erreur API n’est pas structurée de manière exhaustive.
- La stratégie de rétention des sauvegardes n’est pas démontrée.
