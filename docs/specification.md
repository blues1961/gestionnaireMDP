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
- auth : JWT SimpleJWT comme mecanisme DRF principal ; compat session Django isolee sur des vues legacy dediees
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
- noms prod derives de `APP_SLUG` et `APP_ENV` pour les conteneurs, le volume PostgreSQL et le reseau applicatif
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
- logout JWT via `POST /api/auth/jwt/logout/`
- refresh via `POST /api/auth/jwt/refresh/`
- verification via `POST /api/auth/jwt/verify/`
- `GET /api/whoami/` et `GET /api/auth/whoami/`
- compat session legacy via `/api/auth/session/*` et alias historiques deprecies

Il n'existe pas d'inscription publique.

### 6.2 Isolation des donnees

- les querysets `Category` et `PasswordEntry` sont filtres sur `request.user` ;
- `SecretBundle` est egalement adresse par utilisateur courant ;
- l'application est donc concue pour une isolation stricte par proprietaire.

### 6.3 Surface sensible

- les mots de passe en clair n'atteignent pas le backend dans le flux nominal ;
- la cle privee reste locale au navigateur et est conservee en `IndexedDB` ;
- les URL utilisateur ouvertes par le frontend sont normalisees et limitees a `http` / `https` ;
- le frontend de production sert une politique CSP restrictive depuis Nginx ;
- le backend peut toutefois lire certaines metadonnees non chiffrees.

## 7. Chiffrement et logique zero-knowledge

Le chiffrement est gere dans `frontend/src/utils/crypto.js`.

Le modele de menace detaille est documente dans `docs/threat-model.md`.

Flux actuel :

1. le frontend genere ou recharge une paire RSA-OAEP ;
2. la paire active est conservee localement en `IndexedDB` ;
3. une ancienne paire stockee en `localStorage` est migree puis purgee si elle existe encore ;
4. les champs sensibles sont serialises localement ;
5. une cle AES-GCM aleatoire chiffre le payload ;
6. la cle AES est elle-meme chiffree avec la cle publique RSA ;
7. le bundle chiffre est stocke dans `PasswordEntry.ciphertext`.

Pour l'export de cle :

1. la cle privee est exportee ;
2. une cle AES est derivee d'une passphrase via PBKDF2 ;
3. l'export est protege par AES-GCM.

Limite importante :

- l'implementation actuelle releve d'un zero-knowledge partiel, pas complet, car `title`, `url`, `category`, `app` et `environment` restent lisibles cote serveur.
- le durcissement `IndexedDB` reduit l'exposition triviale de la cle privee, mais elle reste accessible au contexte JavaScript local du navigateur.

### 7.1 Resume du threat model

Le projet protege raisonnablement contre la lecture passive des secrets en base ou cote serveur, tant que le navigateur de l'utilisateur reste sain.

Il ne protege pas correctement contre :

- un XSS ;
- une extension navigateur malveillante ;
- un frontend distribue par un serveur compromis ;
- un export clair mal manipule ;
- un poste local deja compromis.

Le modele courant repose donc sur une hypothese forte : le navigateur executant l'application est de confiance.

## 8. Flux utilisateur

### 8.1 Connexion

1. l'utilisateur ouvre `/login`
2. il soumet username et mot de passe
3. le frontend stocke `access` et `refresh` en local
4. au redemarrage, le frontend tente de restaurer une session valide via `refresh` si `access` a expire
5. il est redirige vers `/vault`

### 8.1.b Deconnexion

1. le frontend appelle `POST /api/auth/jwt/logout/` avec le `refresh` courant si disponible
2. le backend blacklist le refresh token
3. le frontend purge ensuite la session locale et redirige vers `/login`

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
- presence d'endpoints session legacy encore exposes pour compatibilite ;
- stockage local de la paire de cle toujours accessible au contexte JavaScript du navigateur ;
- export JSON/CSV de la voute en clair, donc operationnellement risqué ;
- metadonnees de la voute non chiffrees ;
- couverture automatisee encore partielle, meme si des tests backend Django et frontend Vitest existent maintenant sur l'auth et la gestion locale de cle.

## 10. Prochaines etapes recommandees

1. Appliquer progressivement les mitigations les plus rentables du threat model, surtout autour du risque XSS et des exports clairs.
2. Etendre encore les tests automatises aux composants React critiques et aux flux utilisateur principaux de la voute.
3. Decider a terme si les endpoints de session Django legacy doivent etre conserves ou supprimes.
4. Revoir la terminologie "zero-knowledge" dans tout le projet pour rester exacte.
