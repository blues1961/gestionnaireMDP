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
- enveloppe de clé chiffrée privée associée au compte, récupération automatique et déverrouillage local ;
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
- la clé privée déchiffrée reste uniquement en mémoire pendant le déverrouillage ;
- les URL utilisateur ouvertes par le frontend sont normalisees et limitees a `http` / `https` ;
- le frontend de production sert une politique CSP restrictive depuis Nginx ;
- le backend peut toutefois lire certaines metadonnees non chiffrees.

## 7. Chiffrement et logique zero-knowledge

Le chiffrement est gere dans `frontend/src/utils/crypto.js`.

Le modele de menace detaille est documente dans `docs/threat-model.md`.

Flux actuel :

1. après authentification, le frontend récupère l’enveloppe du compte via `/api/key-envelope/` ;
2. à chaque nouveau chargement et déverrouillage, la phrase de passe de clé est saisie localement, distincte de la connexion ;
3. le client valide le format, déchiffre la clé, vérifie la paire par challenge RSA et déchiffre toutes les `PasswordEntry` avant d’autoriser les écritures ;
4. la paire est installée en mémoire seulement après ces contrôles ; ni JWT ni ancienne paire persistée ne suffisent ;
5. les champs sensibles sont chiffrés par AES-GCM avec une clé aléatoire enveloppée par RSA-OAEP/SHA-256 ; les bundles existants ne changent pas.

La création RSA 4096 est uniquement une action explicite pour une nouvelle voûte sans entrées, sans enveloppe ni `SecretBundle`. Les voûtes existantes ne génèrent jamais automatiquement de clé. Une rotation de paire n’est pas prise en charge.

Le format serveur et les nouveaux exports sont `zk-keybundle-v2` : PKCS8 privé chiffré AES-256-GCM, PBKDF2/SHA-256 à 600 000 itérations, sel 16 octets et IV 12 octets. Les métadonnées et la clé publique SPKI sont authentifiées comme AAD. Les lecteurs locaux acceptent aussi les exports v1 (minimum 200 000 itérations) et vérifient la cohérence privée/publique ; les nouvelles écritures serveur sont exclusivement v2. Bornes, encodage et AAD : [API](api.md#7-enveloppe-de-clé-chiffrée).

Le seuil de 600 000 suit la recommandation PBKDF2-HMAC-SHA256 de [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) ; il ne constitue pas une mesure de performances Android. Le mécanisme AAD suit [Web Crypto AES-GCM](https://www.w3.org/TR/webcrypto/#aes-gcm). Mesurer le temps de dérivation sur les quatre appareils avant déploiement. Une phrase forte d’au moins 16 caractères est exigée pour les nouveaux exports/enregistrements ; la longueur seule ne garantit pas l’entropie.

Aucun cache persistant de clé n’est ajouté, même chiffré. Le mode hors ligne n’est pas implémenté. Les anciens emplacements IndexedDB `active` et localStorage `zk_keypair_v1` ne sont lus que sur action de migration, jamais pour ouvrir automatiquement la voûte. Leur purge est subordonnée à une sauvegarde confirmée, au téléversement, à la relecture serveur et aux vérifications locales. Voir [migration et déploiement](gestion-cle-chiffree.md).

La validation de relecture compare la révision, le contenu chiffré et chaque métadonnée validée. Elle accepte le réordonnancement des champs JSON par PostgreSQL, sans accepter un changement de valeur. Cette règle vaut aussi pour le remplacement de phrase de passe depuis l’export de clé.

La garantie reste un zero-knowledge partiel : les métadonnées de voûte restent lisibles, et le JavaScript d’un navigateur compromis peut accéder aux secrets déverrouillés.

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
4. le frontend récupère automatiquement l’enveloppe du compte et exige le mot de passe de clé ; une enveloppe absente ouvre la migration initiale
5. au redemarrage, le frontend tente de restaurer une session valide via `refresh` si `access` a expire
6. il est redirige vers `/vault`

### 8.1.b Deconnexion

1. le frontend verrouille immédiatement la voûte puis appelle `POST /api/auth/jwt/logout/` avec le `refresh` courant si disponible
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
4. si le déchiffrement échoue, l’utilisateur peut verrouiller et ouvrir le parcours d’import de secours

### 8.4 Verification de cle

1. l'utilisateur ouvre `/vault/key-check`
2. le frontend tente de dechiffrer chaque entree
3. il produit un resume des succes et echecs
4. en cas d’échec, l’interface permet de verrouiller puis restaurer une clé compatible

### 8.5 Clé, migration, sauvegarde et verrouillage

- La page `/vault/key-backup` produit un export indépendant chiffré de la même paire. Après téléchargement et confirmation de sauvegarde, l’utilisateur peut remplacer l’enveloppe serveur avec ce nouveau mot de passe de clé ; le numéro de révision lu à l’ouverture protège des conflits.
- L’import de secours se fait depuis la porte de déverrouillage. Il vérifie la paire et toutes les entrées avant toute écriture. Une enveloppe déjà associée impose la même clé publique ; il ne s’agit pas d’une rotation.
- Une voûte vide est vérifiée par un challenge RSA indépendant des entrées et une confirmation explicite de provenance. Cela ne prouve pas l’appartenance historique d’un ancien fichier à un compte vide. Une ancienne paire globale seule ne peut pas être attribuée à une voûte vide sans enveloppe : utiliser une sauvegarde identifiée.
- Le déverrouillage reste en mémoire dans l’application chargée tant que la page existe et que la session de connexion reste valide. Changer d’onglet, de fenêtre/application ou de vue React, suspendre l’appareil et rester inactif ne le suppriment pas automatiquement.
- Verrouillage manuel, déconnexion et changement/invalidation de compte abandonnent clé et composants déchiffrés. Rechargement, fermeture et destruction/éviction du document exigent un nouveau déverrouillage. Les événements de cycle de vie (`visibilitychange`, `blur`, `focus`, `pagehide`, `pageshow`, `freeze`, `resume`) ne verrouillent pas ; une page conservée en BFCache garde son état mémoire.
- Chaque onglet conserve sa clé propre. BroadcastChannel et le signal localStorage non sensible `mdp.lock` propagent les verrouillages manuels et invalidations, jamais les clés. Le signal est conservateur pour toute l’origine (y compris d’autres comptes ouverts). Les changements JWT de compte ou suppressions verrouillent puis rechargent les autres onglets ; un refresh du même compte ne les verrouille pas.
- Avant accès crypto, révélation/copie/export et traitement de résultats tardifs, l’état de verrouillage et la génération de session sont contrôlés. La validité locale des JWT est contrôlée sans requête déclenchée par un changement d’onglet ; une réponse protégée `401`, une suppression/changement de JWT ou une déconnexion verrouille. Voir [contrat détaillé et recette](deverrouillage-temporaire.md).
- Les opérations asynchrones portent une génération de session : un résultat tardif ne réactive pas une session verrouillée. Les requêtes d’écriture de voûte sont refusées lorsqu’elle est verrouillée.
- Le fichier de sauvegarde reste hors Git. Voir [procédure complète et limites](gestion-cle-chiffree.md).

### 8.6 Bundles de secrets

1. un client authentifie enregistre un bundle chiffre pour `app` + `env`
2. le backend l'upsert dans `SecretBundle`
3. un client peut ensuite le relire ou le supprimer

## 9. Limites connues

- pas d'API d'administration des utilisateurs ;
- pas d'inscription publique ;
- presence d'endpoints session legacy encore exposes pour compatibilite ;
- clé déverrouillée accessible au contexte JavaScript ; anciens stockages locaux conservés tant que leur migration n’est pas validée ;
- export JSON/CSV de la voute en clair, donc operationnellement risqué ;
- metadonnees de la voute non chiffrees ;
- couverture automatisee encore partielle, meme si des tests backend Django et frontend Vitest existent maintenant sur l'auth et la gestion locale de cle.

## 10. Prochaines etapes recommandees

1. Appliquer progressivement les mitigations les plus rentables du threat model, surtout autour du risque XSS et des exports clairs.
2. Etendre encore les tests automatises aux composants React critiques et aux flux utilisateur principaux de la voute.
3. Decider a terme si les endpoints de session Django legacy doivent etre conserves ou supprimes.
4. Revoir la terminologie "zero-knowledge" dans tout le projet pour rester exacte.

## 11. KeyEnvelope

Un `KeyEnvelope` par utilisateur : `owner` OneToOne, `envelope` JSON chiffré, `revision` positive, `updated_at`. Aucun fichier public, aucune clé déchiffrée. Le compte authentifié est l’unique source de propriétaire. Un verrou PostgreSQL sur le compte sérialise création et remplacement, y compris lorsque l’enveloppe n’existe pas encore. L’API refuse la substitution de clé publique et ne fournit pas de suppression.
