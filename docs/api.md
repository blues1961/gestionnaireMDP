# API - Gestionnaire MDP

Toutes les routes applicatives sont servies sous `/api/`.

Base URL en developpement par defaut pour ce depot :

```text
http://localhost:8002/api/
```

## Regles generales

- format : JSON
- auth principale : JWT Bearer
- auth legacy de compatibilite : session Django avec CSRF
- aucune inscription publique
- toutes les donnees metier sont isolees par utilisateur authentifie
- aucune pagination DRF specifique n'est configuree a ce stade

## 1. Sante

### `GET /api/healthz/`

Reponse :

```json
{
  "status": "ok"
}
```

## 2. Authentification JWT

### `POST /api/auth/jwt/create/`

Entree :

```json
{
  "username": "admin",
  "password": "mot-de-passe"
}
```

Sortie :

```json
{
  "refresh": "jwt-refresh",
  "access": "jwt-access"
}
```

### `POST /api/auth/jwt/refresh/`

Entree :

```json
{
  "refresh": "jwt-refresh"
}
```

Sortie typique :

```json
{
  "access": "jwt-access"
}
```

### `POST /api/auth/jwt/verify/`

Entree :

```json
{
  "token": "jwt-access-ou-refresh"
}
```

Reponse :

- `200` si le token est valide
- `401` si le token est invalide

### `GET /api/whoami/`
### `GET /api/auth/whoami/`

Auth requise.

Sortie :

```json
{
  "id": 1,
  "username": "admin",
  "email": "admin@example.com"
}
```

## 3. Authentification session legacy

Ces routes existent encore pour compatibilite, mais le frontend principal utilise JWT.

### `GET /api/csrf/`

Pose un cookie CSRF et retourne :

- `204 No Content`

### `POST /api/login/`

Prerequis :

- cookie CSRF valide
- payload JSON

Entree :

```json
{
  "username": "admin",
  "password": "mot-de-passe"
}
```

Sortie :

```json
{
  "username": "admin"
}
```

### `POST /api/logout/`

Prerequis :

- cookie CSRF valide

Sortie :

- `204 No Content`

Important :

- ce logout ne blackliste pas un refresh token JWT ;
- il concerne la session Django legacy ;
- le frontend principal purge ses JWT localement et tente un refresh automatique via `/api/auth/jwt/refresh/` tant que le `refresh` reste valide.

## 4. Categories

Toutes les routes categories exigent un utilisateur authentifie.

### `GET /api/categories/`

Retourne les categories du proprietaire courant.

Exemple :

```json
[
  {
    "id": 1,
    "name": "Banque",
    "description": "Comptes financiers"
  }
]
```

### `POST /api/categories/`

Entree :

```json
{
  "name": "Infra",
  "description": "Services et serveurs"
}
```

Sortie :

```json
{
  "id": 2,
  "name": "Infra",
  "description": "Services et serveurs"
}
```

### `GET /api/categories/{id}/`
### `PUT /api/categories/{id}/`
### `PATCH /api/categories/{id}/`
### `DELETE /api/categories/{id}/`

Acces reserve au proprietaire de la categorie.

## 5. Mots de passe

Toutes les routes de voute exigent un utilisateur authentifie.

### Modele d'entree

Le backend stocke :

```json
{
  "id": 12,
  "title": "GitHub",
  "url": "https://github.com",
  "category": 2,
  "ciphertext": {
    "iv": "base64",
    "salt": "base64",
    "data": "base64",
    "key": "base64"
  },
  "created_at": "2026-05-24T10:00:00Z",
  "updated_at": "2026-05-24T10:00:00Z"
}
```

Le serveur ne connait pas la semantique interne du payload dechiffre. Dans le flux frontend courant, `ciphertext` encapsule surtout :

- `login`
- `password`
- `notes`

### `GET /api/passwords/`

Retourne uniquement les entrees du proprietaire courant.

### `POST /api/passwords/`

Entree :

```json
{
  "title": "GitHub",
  "url": "https://github.com",
  "category": 2,
  "ciphertext": {
    "iv": "base64",
    "salt": "base64",
    "data": "base64",
    "key": "base64"
  }
}
```

Sortie :

```json
{
  "id": 12,
  "title": "GitHub",
  "url": "https://github.com",
  "category": 2,
  "ciphertext": {
    "iv": "base64",
    "salt": "base64",
    "data": "base64",
    "key": "base64"
  },
  "created_at": "2026-05-24T10:00:00Z",
  "updated_at": "2026-05-24T10:00:00Z"
}
```

### `GET /api/passwords/{id}/`
### `PUT /api/passwords/{id}/`
### `PATCH /api/passwords/{id}/`
### `DELETE /api/passwords/{id}/`

Acces reserve au proprietaire.

Notes :

- le backend ne dechiffre jamais `ciphertext` ;
- le frontend gere la revelation localement ;
- la recherche dans les notes se fait cote frontend apres dechiffrement.

## 6. Verification de cle / KeyCheck

Il n'existe actuellement aucun endpoint backend dedie a KeyCheck.

La page `/vault/key-check` :

- telecharge les entrees via `GET /api/passwords/`
- tente un dechiffrement local dans le navigateur
- produit un rapport purement client

Conclusion :

- la verification de cle est une fonctionnalite frontend locale ;
- elle ne doit pas etre documentee comme une API serveur.

## 7. Import / export de cle

Il n'existe actuellement aucun endpoint backend d'import ou d'export de cle.

Les fonctions d'import/export visibles dans l'interface :

- utilisent `frontend/src/utils/crypto.js`
- lisent ou ecrivent un fichier JSON local
- ne transitent pas par le backend

## 8. Bundles de secrets

Endpoint unique :

### `GET /api/secrets/`

Sans parametres, retourne la liste des bundles du proprietaire courant sans exposer `payload`.

Exemple :

```json
[
  {
    "id": 3,
    "app": "openweather",
    "environment": "dev",
    "created_at": "2026-05-24T11:00:00Z",
    "updated_at": "2026-05-24T11:30:00Z"
  }
]
```

### `GET /api/secrets/?app=<app>&env=<env>`

Retourne directement le `payload` stocke pour l'utilisateur courant.

Exemple :

```json
{
  "ciphertext": "BASE64...",
  "iv": "BASE64...",
  "tag": "BASE64...",
  "salt": "BASE64..."
}
```

### `POST /api/secrets/`
### `PUT /api/secrets/`

Entree :

```json
{
  "app": "openweather",
  "env": "dev",
  "payload": {
    "ciphertext": "BASE64...",
    "iv": "BASE64...",
    "tag": "BASE64...",
    "salt": "BASE64..."
  }
}
```

`environment` est aussi accepte en alternative a `env` dans le body.

Sortie :

```json
{
  "detail": "Stored",
  "app": "openweather",
  "environment": "dev",
  "updated_at": "2026-05-24T11:30:00Z"
}
```

Codes :

- `201` si creation
- `200` si mise a jour
- `400` si `app`, `env` ou `payload` sont invalides

### `DELETE /api/secrets/?app=<app>&env=<env>`

Supprime le bundle correspondant au proprietaire courant.

Codes :

- `204` si suppression
- `404` si absent
- `400` si les query params manquent

## 9. Contraintes d'authentification

Auth requise pour :

- `GET /api/whoami/`
- `GET /api/auth/whoami/`
- toutes les routes `categories`
- toutes les routes `passwords`
- toutes les routes `secrets`

Auth non requise pour :

- `GET /api/healthz/`
- `POST /api/auth/jwt/create/`
- `POST /api/auth/jwt/refresh/`
- `POST /api/auth/jwt/verify/`
- les routes de session legacy, avec la contrainte CSRF correspondante

## 10. Exemples curl

### Sante

```bash
curl http://localhost:8002/api/healthz/
```

### Login JWT

```bash
curl -X POST http://localhost:8002/api/auth/jwt/create/ \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"mot-de-passe"}'
```

### Whoami avec JWT

```bash
curl http://localhost:8002/api/whoami/ \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

### Liste des mots de passe

```bash
curl http://localhost:8002/api/passwords/ \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

### Upsert d'un bundle de secrets

```bash
curl -X POST http://localhost:8002/api/secrets/ \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
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
