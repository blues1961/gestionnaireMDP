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
make generate-env
make dev
make prod
make up
make down
make restart
make ps
make logs
make migrate
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

- `make up` lance la stack Docker effective du depot. En developpement, elle inclut encore un service `vite` en plus de `db`, `backend` et `frontend`.
- Le backend dev ne doit pas executer `python manage.py migrate` au demarrage du conteneur.
- Les migrations doivent etre lancees explicitement via `make migrate`.
- `VITE_API_BASE` doit rester a `/api`.
- Le frontend ne doit pas contenir d'URL backend absolue.
- `.env.local` ne doit jamais etre committe.
- `make init-secret` regenere les secrets non `ADMIN_*` et peut tenter de resynchroniser le mot de passe PostgreSQL. A utiliser volontairement, pas machinalement.

## Verification minimale

Apres demarrage :

```bash
make ps
make token-test
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
