# Bootstrap d'une nouvelle machine (pull-secret)

Ce guide est une version **safe to publish**: il ne contient **aucune valeur secrete**.

## Objectif

Permettre a une machine fraichement clonee de recuperer:
- `.env.dev`
- `.env.prod`
- `.env.local`

via `make pull-secret`.

## Ce qui est public vs prive

Tu peux publier:
- les noms de variables (`API_AUTH_USERNAME`, `PULL_ROOT_SECRET`, etc.)
- les commandes de procedure
- les messages d'erreur typiques

Tu ne dois jamais publier:
- `API_AUTH_PASSWORD`
- `PULL_ROOT_SECRET`
- `JWT_ACCESS_TOKEN`
- le contenu de `.env.local` / `.env.root.local`
- des credentials SSH, mots de passe serveur, cles privees

## Prerequis minimum

1. Repo clone.
2. Fichiers versionnes presents: `.env.dev` et `.env.prod`.
3. Symlink actif:

```bash
ln -sfn .env.dev .env
```

4. Secret racine local disponible dans `.env.root.local`:

```dotenv
PULL_ROOT_SECRET=<valeur_longue_non_versionnee>
```

5. Auth API bootstrap disponible:
- option A: `JWT_ACCESS_TOKEN`
- option B: `API_AUTH_USERNAME` + `API_AUTH_PASSWORD`

## Procedure (nouvelle machine)

```bash
git clone <repo-url>
cd <repo-dir>

# 1) Verifier les env versionnes et choisir l'env actif
test -f .env.dev && test -f .env.prod
ln -sfn .env.dev .env

# 2) Ajouter le secret racine local (non commit)
cat > .env.root.local <<'EOF'
PULL_ROOT_SECRET=<a-remplacer>
EOF
chmod 600 .env.root.local

# 3) Pull des secrets (auth API bootstrap)
API_AUTH_USERNAME=<api_user> API_AUTH_PASSWORD=<api_pass> make pull-secret FORCE=1
```

Apres succes:
- `.env.local` est restaure
- `make up` fonctionne

## Obtenir API_AUTH_USERNAME / API_AUTH_PASSWORD

Ces identifiants sont ceux d'un **compte technique Django API**, pas ceux du serveur.

Creation ou rotation (machine d'administration):

```bash
ssh <prod-host>
cd /opt/apps/<app_slug>
./scripts/manage-django-account.sh \
  --env prod \
  --role api \
  --username mdp_sync_bot \
  --generate-password \
  --show-password \
  --apply
```

Conserver ensuite ces credentials dans un gestionnaire de secrets interne.

## Erreurs frequentes

`.env.prod introuvable`:
- restaurer le fichier versionne depuis le repo.

`Auth manquante pour pull-secret`:
- fournir `JWT_ACCESS_TOKEN` ou `API_AUTH_USERNAME`/`API_AUTH_PASSWORD`.

`Echec auth JWT (HTTP 401)`:
- credentials API invalides ou compte desactive.

`Echec auth JWT (HTTP 500)`:
- backend cible en erreur (souvent probleme de connexion DB).

## Publication web: est-ce dangereux?

Ce document est publiable **si et seulement si**:
- toutes les valeurs restent des placeholders
- aucun hostname interne sensible n'est ajoute
- aucun secret reel n'apparait

En cas de doute, publier la procedure mais garder les exemples d'environnement totalement generiques.
