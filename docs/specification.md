# Specification - Gestionnaire MDP

## 1. But de l'application

`gestionnaireMDP` est une application web auto-hebergee de gestion de mots de passe et de secrets personnels.

Son but est de permettre a un utilisateur authentifie de :

- classer ses identifiants par categories ;
- stocker des secrets applicatifs dans une voute ;
- chiffrer localement les champs sensibles avant leur envoi au backend ;
- verifier localement qu'il possede toujours la bonne cle ;
- exporter ou reimporter son trousseau de cle ;
- stocker, en option, des bundles de secrets chiffres par application et environnement.

## 2. Perimetre fonctionnel actuel

Fonctionnalites implementees dans le code :

- authentification JWT via SimpleJWT ;
- endpoint `whoami` ;
- CRUD des categories ;
- CRUD des entrees de mots de passe ;
- recherche cote frontend dans le titre, la categorie et les notes dechiffrees ;
- revele locale d'une entree ;
- verification locale de dechiffrement de l'ensemble de la voute ;
- export local de la voute en JSON ou CSV en clair ;
- export local de la cle privee protege par passphrase ;
- import local de la cle privee depuis un fichier d'export ;
- stockage de `SecretBundle` par utilisateur, `app` et `environment` ;
- route de sante backend.

## 3. Fonctionnalites visibles mais non pleinement integrees

Elements presents dans le depot ou la documentation annexe :

- extension navigateur et outillage d'autofill sous `contrib/` ;
- scripts de push/pull de `.env.local` entre dev et prod ;
- scripts de rotation de secrets et de backup/restore PostgreSQL ;
- auth par session Django legacy conservee pour compatibilite.

Ces elements existent, mais ne constituent pas encore une architecture totalement harmonisee avec `app-template`.

## 4. Architecture

### 4.1 Backend

- framework : Django 5
- API : Django REST Framework
- auth : JWT SimpleJWT, avec classes d'authentification DRF et compat session/basic
- routes principales : `backend/api/urls.py`
- base de donnees : PostgreSQL

### 4.2 Frontend

- framework : React 18
- build/dev : Vite
- client HTTP : Axios
- routage : React Router
- chiffrement local : Web Crypto API

### 4.3 Deploiement

- `docker-compose.dev.yml`
- `docker-compose.prod.yml`
- proxy de production attendu : Traefik externe
- `Makefile` comme interface d'exploitation principale disponible

## 5. Modele de donnees

### 5.1 Utilisateur

Le projet repose sur le modele utilisateur Django standard.

Le code ne fournit pas encore d'API d'administration des utilisateurs, mais chaque enregistrement metier est rattache a un proprietaire.

### 5.2 Category

Champs :

- `owner`
- `name`
- `description`

Regles :

- unicite par couple `(owner, name)` ;
- tri par nom ;
- usage purement prive par utilisateur.

### 5.3 PasswordEntry

Champs :

- `owner`
- `title`
- `url`
- `category`
- `ciphertext`
- `created_at`
- `updated_at`

`ciphertext` est un `JSONField` stockant un bundle chiffre produit par le frontend. La structure actuellement emise par le code React contient :

- `iv`
- `salt`
- `data`
- `key`

Le backend traite ce contenu comme opaque.

### 5.4 SecretBundle

Champs :

- `owner`
- `app`
- `environment`
- `payload`
- `created_at`
- `updated_at`

Regles :

- unicite par `(owner, app, environment)` ;
- `payload` doit rester un objet JSON chiffre du point de vue applicatif ;
- les metadonnees `app` et `environment` restent en clair.

## 6. Securite

### 6.1 Authentification

- login principal via `POST /api/auth/jwt/create/`
- refresh via `POST /api/auth/jwt/refresh/`
- verification via `POST /api/auth/jwt/verify/`
- `GET /api/whoami/` et `GET /api/auth/whoami/`

Il n'existe pas d'inscription publique.

### 6.2 Isolation des donnees

- les querysets `Category` et `PasswordEntry` sont filtres sur `request.user` ;
- `SecretBundle` est egalement adresse par utilisateur courant ;
- l'application est donc concue pour une isolation stricte par proprietaire.

### 6.3 Surface sensible

- les mots de passe en clair n'atteignent pas le backend dans le flux nominal ;
- la cle privee reste locale au navigateur ;
- le backend peut toutefois lire certaines metadonnees non chiffrees.

## 7. Chiffrement et logique zero-knowledge

Le chiffrement est gere dans `frontend/src/utils/crypto.js`.

Flux actuel :

1. le frontend genere ou recharge une paire RSA-OAEP ;
2. les champs sensibles sont serialises localement ;
3. une cle AES-GCM aleatoire chiffre le payload ;
4. la cle AES est elle-meme chiffree avec la cle publique RSA ;
5. le bundle chiffre est stocke dans `PasswordEntry.ciphertext`.

Pour l'export de cle :

1. la cle privee est exportee ;
2. une cle AES est derivee d'une passphrase via PBKDF2 ;
3. l'export est protege par AES-GCM.

Limite importante :

- l'implementation actuelle releve d'un zero-knowledge partiel, pas complet, car `title`, `url`, `category`, `app` et `environment` restent lisibles cote serveur.

## 8. Flux utilisateur

### 8.1 Connexion

1. l'utilisateur ouvre `/login`
2. il soumet username et mot de passe
3. le frontend stocke `access` et `refresh` en local
4. il est redirige vers `/vault`

### 8.2 Creation d'une entree

1. l'utilisateur ouvre `/vault/new`
2. il saisit titre, URL, categorie, login, mot de passe et notes
3. le frontend chiffre localement `login`, `password`, `notes`
4. le backend stocke l'entree

### 8.3 Consultation / revelation

1. le frontend liste les entrees depuis `/api/passwords/`
2. les metadonnees s'affichent
3. au moment de la revelation, le frontend dechiffre localement `ciphertext`

### 8.4 Verification de cle

1. l'utilisateur ouvre `/vault/key-check`
2. le frontend tente de dechiffrer chaque entree
3. il produit un resume des succes et echecs

### 8.5 Sauvegarde / import de cle

1. l'utilisateur exporte sa cle dans un fichier JSON protege par passphrase
2. il peut reimporter ce fichier sur un autre navigateur
3. une cle differente rend les anciennes entrees indechiffrables

### 8.6 Bundles de secrets

1. un client authentifie enregistre un bundle chiffre pour `app` + `env`
2. le backend l'upsert dans `SecretBundle`
3. un client peut ensuite le relire ou le supprimer

## 9. Limites connues

- pas d'API d'administration des utilisateurs ;
- pas d'inscription publique ;
- pas de refresh JWT automatique cote frontend ;
- pas de logout JWT avec invalidation de refresh token ;
- presence d'endpoints session legacy non harmonisee avec le flux JWT principal ;
- stockage local de la paire de cle en `localStorage`, plus faible qu'un stockage durci ;
- export JSON/CSV de la voute en clair, donc operationnellement risqué ;
- metadonnees de la voute non chiffrees ;
- peu ou pas de tests automatises visibles dans le depot principal.

## 10. Prochaines etapes recommandees

1. Completer l'alignement sur `app-template` en ajoutant les scripts standards encore manquants (`init.sh`, `check-invariants.sh`, `update.sh`, `rebuild.sh`, etc.).
2. Ajouter une gestion frontend complete du refresh/logout JWT.
3. Durcir le stockage local de la cle et formaliser le threat model du chiffrement.
4. Ajouter des validations backend sur les references de categorie et des tests d'isolation par utilisateur.
5. Revoir la terminologie "zero-knowledge" dans tout le projet pour rester exacte.
