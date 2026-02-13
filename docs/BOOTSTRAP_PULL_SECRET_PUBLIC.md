# Bootstrap d'une nouvelle machine (env local)

Ce guide est publiable tel quel: il ne contient aucune valeur secrete.

## Principe

- `.env.dev` et `.env.prod` sont versionnes dans Git.
- `.env.local` n'est jamais versionne.
- `make push-secret` et `make pull-secret` font une copie SSH directe du fichier `.env.local`.

## Commandes

Depuis la machine de developpement uniquement (`.env -> .env.dev`):

```bash
# Env actif = dev
ln -sfn .env.dev .env

# Pousser le .env.local local vers la prod
make push-secret

# Recuperer le .env.local depuis la prod (ecrase local si FORCE=1)
make pull-secret FORCE=1
```

## Variables de connexion (optionnelles)

Tu peux surcharger la cible via variables d'environnement:

- `PROD_SSH` (defaut: `linode`)
- `PROD_DIR` (defaut: `/opt/apps/${APP_SLUG}`)
- `PROD_ENV_LOCAL_PATH` (defaut: `${PROD_DIR}/.env.local`)

Exemple:

```bash
PROD_SSH=linode PROD_DIR=/opt/apps/mdp make push-secret
PROD_SSH=linode PROD_DIR=/opt/apps/mdp make pull-secret FORCE=1
```

## Garde-fous

- Les commandes sont bloquees si l'environnement actif n'est pas `dev`.
- `push-secret` cree un backup distant de l'ancien fichier:
  `.env.local.bak.<timestamp>`.

## Erreurs frequentes

`Commande autorisée uniquement depuis dev`:
- verifier le symlink `.env` (`ln -sfn .env.dev .env`).

`Fichier local introuvable: .env.local`:
- creer/copier ton fichier local avant `make push-secret`.

`scp/ssh: permission denied`:
- verifier l'acces SSH vers la cible (`ssh linode`).

## Securite

Tu peux publier:
- les noms de variables (`PROD_SSH`, `PROD_DIR`, etc.)
- la procedure

Tu ne dois jamais publier:
- le contenu de `.env.local`
- des mots de passe, tokens, cles privees, identifiants SSH
