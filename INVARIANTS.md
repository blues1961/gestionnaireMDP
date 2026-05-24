# INVARIANTS.md

## Role

Ce fichier est le contrat technique du projet.

Il documente :

- les invariants globaux a respecter ;
- les regles specifiques a une application de gestion de mots de passe ;
- les ecarts actuellement presents dans `gestionnaireMDP` afin de ne pas les banaliser.

En cas de contradiction :

1. `docs/specification.md`
2. `docs/api.md`
3. `INVARIANTS.md`
4. `README_DEV.md`
5. `README.md`
6. le code existant

## 1. Variables obligatoires

Les variables suivantes doivent exister dans `.env.dev` et `.env.prod` :

```env
APP_NAME=
APP_SLUG=
APP_DEPOT=
APP_NO=
APP_ENV=
APP_HOST=
POSTGRES_DB=
POSTGRES_USER=
POSTGRES_HOST=
POSTGRES_PORT=
VITE_API_BASE=/api
```

Regles :

- `APP_NAME` est le nom lisible de l'application.
- `APP_SLUG` est l'identifiant technique court.
- `APP_DEPOT` est le nom du depot Git.
- `APP_NO` est l'identifiant numerique servant a deriver les ports.
- `APP_ENV` vaut `dev` ou `prod`.
- `APP_HOST` est le domaine public attendu en production.
- `POSTGRES_DB` doit suivre `${APP_SLUG}_pg_db`.
- `POSTGRES_USER` doit suivre `${APP_SLUG}_pg_user`.
- `VITE_API_BASE` doit rester `/api`.

## 2. Fichiers d'environnement

Structure cible :

```text
.env.template.example
.env.template
.env.dev
.env.prod
.env.local
.env
```

Regles :

- `.env.dev` et `.env.prod` sont versionnes.
- `.env.local` n'est jamais versionne.
- `.env` doit etre un lien symbolique vers `.env.dev` ou `.env.prod`.
- les secrets ne doivent pas etre dupliques dans `.env.dev` ou `.env.prod`.

Etat actuel du depot :

- `.env.template.example` est versionné ;
- `.env.template` est local et sert de source de vérité pour `make generate-env` ;
- `.env.dev`, `.env.prod`, `.env.local.example` et `.env` existent ou sont attendus ;
- `make create-env` est conservé comme bootstrap interactif de `.env.template`.

## 3. Regles de secrets

Les secrets doivent etre definis uniquement dans `.env.local`.

Exemples :

```env
POSTGRES_PASSWORD=
DJANGO_SECRET_KEY=
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_EMAIL=
JWT_SECRET=
PROD_SSH_HOST=
```

Interdit :

- un secret dans `.env.dev` ;
- un secret dans `.env.prod` ;
- un secret dans Git ;
- un secret dans la documentation ;
- un secret dans les examples `curl`.

Regle supplementaire pour ce depot :

- le fichier d'exemple `.env.local.example` ne doit contenir que des valeurs fictives manifestement non exploitables.

## 4. Conventions Docker Compose

Fichiers obligatoires :

```text
docker-compose.dev.yml
docker-compose.prod.yml
```

Conventions cibles :

- utiliser `docker compose`, jamais `docker-compose` ;
- services standards : `db`, `backend`, `frontend` ;
- noms de conteneurs : `${APP_SLUG}_${SERVICE}_${APP_ENV}` ;
- separation stricte `dev` / `prod` ;
- usage prefere des cibles `make` quand elles existent.

Etat actuel du depot :

- la production utilise bien `db`, `backend`, `frontend` ;
- le developpement utilise aussi `db`, `backend`, `frontend` ;
- le service `frontend` execute Vite en developpement.

## 5. Conventions de ports

Les ports de developpement sont derives de `APP_NO`.

Formules :

```text
DEV_DB_PORT   = 5432 + APP_NO
DEV_VITE_PORT = 5173 + APP_NO
DEV_API_PORT  = 8000 + (APP_NO + 1)
```

Avec `APP_NO=1` :

```env
DEV_DB_PORT=5433
DEV_VITE_PORT=5174
DEV_API_PORT=8002
```

Regles :

- ne pas coder des ports arbitraires dans la documentation ;
- ne pas changer `APP_NO` sans demande explicite ;
- recalculer les ports a partir de `APP_NO` lors d'une regeneration d'env.

## 6. Regles frontend / backend

Regles obligatoires :

- toutes les routes backend applicatives doivent etre sous `/api` ;
- le frontend doit appeler l'API via `VITE_API_BASE=/api` ;
- aucune URL absolue de backend ne doit etre codee en dur dans le frontend ;
- les donnees privees doivent etre filtrees cote backend, jamais seulement masquees cote frontend ;
- les routes admin peuvent rester sous `/admin/`, hors contrat applicatif principal.

Etat actuel du depot :

- le backend expose bien les routes applicatives sous `/api` ;
- `frontend/src/api.js` utilise bien `import.meta.env?.VITE_API_BASE` ;
- le dev passe par le proxy Vite vers `http://backend:8000`.

## 7. Authentification

Conventions cibles :

- JWT pour l'authentification applicative ;
- pas d'inscription publique ;
- `whoami` disponible pour verifier l'utilisateur courant ;
- le backend doit rester source de verite pour l'isolation des donnees par utilisateur.

Etat actuel du depot :

- JWT SimpleJWT est en place ;
- `GET /api/whoami/` et `GET /api/auth/whoami/` existent ;
- des endpoints de session Django legacy (`/api/csrf/`, `/api/login/`, `/api/logout/`) existent encore pour compatibilite ;
- aucun endpoint public de creation de compte n'est present.

## 8. Interface de commande

Quand le `Makefile` expose une commande, il doit etre prefere.

Commandes actuelles de reference :

```bash
make init
make generate-env
make dev
make prod
make check
make up
make down
make restart
make rebuild
make ps
make logs
make migrate
make update
make backup
make restore
make createsuperuser
make backup-db
make restore-db
```

Etat actuel du depot :

- l'interface principale existe et expose désormais les noms standards du template ;
- `generate-env.sh`, `generate-secrets.sh`, `init.sh`, `check-invariants.sh`, `update.sh`, `rebuild.sh` et les autres scripts standards existent sous les noms attendus ;
- le depot conserve aussi quelques scripts supplementaires propres a son exploitation.

## 9. Regles de securite specifiques au gestionnaire de mots de passe

Regles non negociables :

- le backend ne doit jamais recevoir de mot de passe maitre ;
- le backend ne doit jamais dechiffrer `PasswordEntry.ciphertext` ;
- les champs sensibles d'une entree de voute doivent rester chiffres cote serveur ;
- aucune journalisation ne doit inclure des secrets en clair ;
- aucune exportation claire ne doit etre automatique ;
- toute fonctionnalite d'export clair doit etre explicite, locale et accompagnee d'un avertissement.

Pour le depot actuel :

- `login`, `password` et `notes` sont chiffres cote client ;
- le titre, l'URL, la categorie et certaines metadonnees restent en clair ;
- la cle privee est stockee localement dans le navigateur via `IndexedDB` et peut etre exportee manuellement ;
- une migration legacy depuis `localStorage` peut exister a la premiere lecture, mais la copie legacy doit ensuite etre supprimee ;
- le fichier d'export de cle est lui-meme sensible et ne doit jamais etre committe ni place dans un stockage non maitrise.

## 10. Zero-knowledge

Le terme "zero-knowledge" doit etre utilise avec precision.

Dans ce depot, la garantie actuelle est partielle :

- le serveur stocke des blobs chiffres pour les secrets ;
- le serveur ne stocke pas la cle privee ;
- le serveur peut toutefois lire certaines metadonnees non chiffrees.

Ne pas presenter l'application comme "zero-knowledge complet" tant que :

- les metadonnees restent visibles ;
- la gestion de cle reste accessible au contexte JavaScript du navigateur, meme si elle n'est plus laissee en clair dans `localStorage` ;
- le threat model n'est pas formalise.

## 11. Ecarts connus a ne pas aggraver

Les ecarts suivants existent deja et doivent etre traites comme temporaires :

- presence de scripts d'exploitation hors nomenclature standard du template ;
- certains guides annexes du depot n'ont pas encore tous ete re-alignes sur les invariants courants ;

Tant qu'ils ne sont pas corriges :

- ne pas etendre ces ecarts a de nouveaux fichiers ;
- ne pas dupliquer de nouvelles conventions paralleles ;
- documenter tout changement qui touche l'exploitation, l'auth ou le chiffrement.
