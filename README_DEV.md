# Gestionnaire MDP - README_DEV

Ce fichier decrit le workflow developpeur actuel du depot `gestionnaireMDP`.

Le `Makefile` est l'interface principale quand une commande existe.

## Prerequis

- Docker et le plugin `docker compose`
- GNU Make
- `jq` pour `make token-test`
- un fichier `.env.local` local non versionne

## Initialisation locale

1. Initialiser le template local d'environnement :

```bash
cp .env.template.example .env.template
```

Alternative interactive :

```bash
make create-env
```

2. Generer ou regenerer les fichiers d'environnement versionnes :

```bash
make generate-env
```

3. Creer le fichier de secrets locaux a partir de l'exemple, puis remplacer toutes les valeurs fictives :

```bash
cp .env.local.example .env.local
```

4. Activer l'environnement developpement :

```bash
make dev
```

5. Demarrer la stack :

```bash
make up
```

6. Appliquer les migrations :

```bash
make migrate
```

7. Creer ou mettre a jour l'admin depuis `ADMIN_*` dans `.env.local` :

```bash
make createsuperuser
```

## Démarrage et reconstruction en développement

Depuis la racine du dépôt, avec Docker démarré et `.env.local` déjà préparé :

```bash
make dev
make rebuild
make migrate
make up
make ps
```

`make rebuild` reconstruit les images sans cache et démarre déjà les services ; `make up` peut ensuite être relancé pour assurer leur démarrage. Pour un démarrage courant sans reconstruction complète, utiliser simplement `make dev`, `make up`, puis `make migrate` si de nouvelles migrations sont présentes. Les migrations restent explicites : la nouvelle gestion de clé nécessite notamment `api/0005_keyenvelope`. Pour une base neuve, créer le compte avec `make createsuperuser` après les migrations.

`make up` et `make rebuild` vérifient la présence de Docker, du plugin `docker compose` et l’accès au daemon. Si Docker est introuvable, installer Docker Engine ou Docker Desktop sur le poste et le rendre accessible au terminal ; s’il est inaccessible, démarrer le daemon et vérifier les droits utilisateur. Un échec de construction arrête `make rebuild` avant sa tentative de démarrage. Ces commandes conservent les volumes ; ne pas utiliser `make clean` pour reconstruire une application avec des données existantes.

## URLs utiles

Les ports sont derives de `APP_NO`.

Formules cibles :

- `DEV_DB_PORT = 5432 + APP_NO`
- `DEV_VITE_PORT = 5173 + APP_NO`
- `DEV_API_PORT = 8000 + (APP_NO + 1)`

Avec la configuration actuellement versionnee (`APP_NO=1`) :

- frontend : `http://localhost:5174`
- API : `http://localhost:8002/api/`
- admin Django : `http://localhost:8002/admin/`

## Commandes courantes

```bash
make help
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
make test
make test-backend
make test-frontend
make update
make backup
make restore
make createsuperuser
make token-test
make backup-db
make restore-db
```

Commandes additionnelles utiles :

```bash
make init-secret
make push-secret
make pull-secret FORCE=1
bash scripts/verifier-invariants.sh
```

## Notes importantes

- `make up` lance en developpement les services standard `db`, `backend` et `frontend`.
- En dev, le service `frontend` execute Vite et expose l'interface sur `DEV_VITE_PORT`.
- Le backend dev ne doit pas executer `python manage.py migrate` au demarrage du conteneur.
- Les migrations doivent etre lancees explicitement via `make migrate`.
- Le frontend React tente un refresh JWT automatique au demarrage et sur `401` tant que le `refresh` local reste valide.
- `VITE_API_BASE` doit rester a `/api`.
- Le frontend ne doit pas contenir d'URL backend absolue.
- `.env.local` ne doit jamais etre committe.
- `make init-secret` regenere les secrets non `ADMIN_*` et peut tenter de resynchroniser le mot de passe PostgreSQL. A utiliser volontairement, pas machinalement.

## Verification minimale

Apres demarrage :

```bash
make ps
make token-test
make test
curl http://localhost:8002/api/healthz/
```

Le script suivant permet une verification plus large des hypotheses actuelles du depot :

```bash
bash scripts/verifier-invariants.sh
```

## Production

Le depot gere aussi un mode `prod` via :

```bash
make prod
make up
```

La production suppose un reverse proxy Traefik externe et un `.env.local` deja present sur la machine cible. Le detail des conventions attendues se trouve dans `INVARIANTS.md`.

## Gestion de clé chiffrée

La migration Django `api/0005_keyenvelope` est additive ; elle ne modifie aucune entrée ni paire existante. Appliquer volontairement `make migrate`. Après connexion, la voûte reste verrouillée et récupère l’enveloppe privée du compte. Voir [migration, tests et déploiement Linode](docs/gestion-cle-chiffree.md). Les tests doivent utiliser une base de test et des fixtures fictives ; ne pas tester sur la voûte réelle.

## Test réel de migration de clé en développement

Avec les services déjà démarrés et les migrations appliquées :

```bash
make test-key-migration
```

Cette cible utilise deux comptes fictifs à identifiant UUID, l’API réelle via le proxy Vite et les fonctions WebCrypto réelles du frontend. Elle teste un ancien fichier v1, l’enveloppe v2, la conservation de la paire et des entrées, la récupération après interruption, les mots de passe incorrects, les conflits réellement simultanés, l’isolation et le secours. Seul le mot de passe de connexion fictif atteint l’authentification ; le mot de passe de clé et les secrets de voûte restent locaux. Aucune sauvegarde réelle en clair n’est requise et aucun compte existant n’est réinitialisé.

Le lanceur vérifie les migrations sans les appliquer et nettoie uniquement ses comptes et leurs données. Si le nettoyage échoue ou si le processus est tué sans exécution du trap, reprendre avec l’UUID affiché : `make cleanup-key-migration RUN_ID=<uuid>`. La commande refuse une collision ou un marqueur d’identité différent. Le test HTTP ne pilote pas un navigateur réel et ne certifie pas le sélecteur de fichier, IndexedDB d’un profil réel ou la suspension Android ; les tests de composants complètent ce parcours.

Une recette Chromium isolée teste aussi le sélecteur de fichier v1, la sauvegarde téléchargée, l’interruption de récupération après PUT, la reprise, le nettoyage tardif d’IndexedDB et la réouverture sans fichier. Installer l’outil de test séparément du frontend (Node sur l’hôte requis) :

```bash
npm install --prefix /tmp/mdp-playwright playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/mdp-playwright-browsers /tmp/mdp-playwright/node_modules/.bin/playwright install chromium
PLAYWRIGHT_MODULE=/tmp/mdp-playwright/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/mdp-playwright-browsers make test-key-migration-browser
```

Cette cible prépare/nettoie les fixtures via Docker et lance un nouveau contexte navigateur sur le port Vite publié de développement. Elle n’utilise aucun profil personnel ni fichier réel. Les dépendances système de Chromium doivent être disponibles ; la recette automatisée ne remplace pas la validation physique Android/ThinkPad/Lemur/Thelio.

## Recette du déverrouillage temporaire

`make test-frontend` couvre la conservation en mémoire, les verrouillages et les résultats tardifs. La recette Chromium `frontend/tests/vault-session-browser.mjs` utilise un contexte neuf et intercepte **toutes** les API avec des fixtures ; aucune préparation de compte ni accès à la voûte réelle. Frontend de développement requis sur 5174, Playwright installé séparément comme ci-dessus :

```bash
PLAYWRIGHT_MODULE=/tmp/mdp-playwright/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/mdp-playwright-browsers node frontend/tests/vault-session-browser.mjs
```

La recette accélère une longue période d’inactivité pour vérifier qu’elle ne verrouille pas à elle seule. Elle ne simule pas physiquement une suspension OS ni une éviction Android. Voir [contrat, résultats et recette manuelle](docs/deverrouillage-temporaire.md). La validation des restaurations/enveloppes de clé reste séparée ; aucun déploiement implicite.
