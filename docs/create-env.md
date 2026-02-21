# Générer les fichiers `.env` avec `create-env`

Ce dépôt fournit une commande unique pour préparer les fichiers d’environnement **non sensibles** (`.env.dev` et `.env.prod`). Cette procédure remplace les copier/coller manuels et garantit le respect des invariants (ports dérivés de `APP_NO`, noms `POSTGRES_*`, `ALLOWED_HOSTS`, etc.).

## 1. Quand exécuter `make create-env` ?

1. Cloner l’application (`git clone …`).
2. Depuis la racine du projet :

```bash
make create-env
```

Le script `scripts/create-env.sh` est interactif : il demande les invariants de base (slug, nom humain, dépôt Git, `APP_NO`, domaine prod). À la fin, les fichiers `.env.dev` et `.env.prod` sont créés/écrasés (permissions `600`).

> **Astuce** : pour régénérer après coup, relancer avec `FORCE=1 make create-env`.

## 2. Variables demandées

| Question                         | Description                                                                                         |
|----------------------------------|-----------------------------------------------------------------------------------------------------|
| `APP_SLUG`                       | Préfixe court (db, conteneurs, dossier `/opt/apps/${APP_SLUG}`)                                     |
| `APP_NAME`                       | Nom humain (logs/entêtes) ; guillemets ajoutés si nécessaire                                        |
| `APP_DEPOT`                      | Nom du dépôt Git (`~/projets/${APP_DEPOT}` en dev)                                                  |
| `APP_NO`                         | Index numérique pour dériver les ports dev (`N=1 → 5433/8002/5174`)                                 |
| `APP_HOST (prod)`                | Domaine public (prod) : utilisé pour `ALLOWED_HOSTS`, Traefik, `FRONT_ORIGIN`                       |
| *(optionnel via env)* `DEV_APP_HOST` | Host utilisé en dev (défaut `localhost`) pour `APP_HOST` côté `.env.dev`                           |

Chaque réponse possède un défaut que l’on peut accepter en appuyant sur **Entrée**.

## 3. Pré-remplir les réponses (CI, scripts)

Le script lit les variables d’environnement avant de poser les questions. Exemple :

```bash
APP_SLUG=blog \
APP_NAME="Blog Personnel" \
APP_DEPOT=gestionnaireBlog \
APP_NO=4 \
PROD_APP_HOST=blog.example.com \
DEV_APP_HOST=localhost \
make create-env
```

La commande devient ainsi non‑interactive (pratique pour les templates automatisés).

## 4. Étapes suivantes

1. Copier les secrets (non versionnés) :

```bash
cp .env.local.example .env.local
```

2. Remplir/ajuster `.env.local` (mots de passe DB, clés Django, comptes admin…).
3. Créer le symlink `ln -sfn .env.dev .env`.
4. Poursuivre le bootstrap classique (`make init-secret`, `docker compose ...`).

## 5. Que contient `.env.dev` ?

- `APP_ENV`, `APP_SLUG`, `APP_NAME`, `APP_DEPOT`, `APP_NO`, `APP_HOST`.
- Ports `DEV_*` calculés via `APP_NO`.
- `POSTGRES_*` dérivés de `APP_SLUG`.
- `ALLOWED_HOSTS=${APP_HOST},localhost,…` et `FRONT_ORIGIN=http://${APP_HOST}:${DEV_VITE_PORT}`.
- `VITE_API_BASE=/api`.
- Un rappel indiquant que les secrets vivent dans `.env.local`.

`.env.prod` suit la même structure, avec `DJANGO_DEBUG=0`, `FRONT_ORIGIN=https://${APP_HOST}` et les ports prod (`PROD_DB_PORT`, `PROD_API_PORT`, `PROD_FRONT_PORT`) dérivés automatiquement.

## 6. Pourquoi ce script ?

- Garantit le respect des invariants documentés dans `docs/INVARIANTS.md`.
- Évite les erreurs récurrentes (ports incohérents, `APP_SLUG` oublié dans `POSTGRES_*`, `ALLOWED_HOSTS` incomplets).
- Permet de bootstrapper de nouvelles apps à partir du template en quelques commandes reproductibles.

**Rappel** : les secrets réels ne doivent jamais être commités. Seuls `.env.dev`, `.env.prod`, et `.env.local.example` sont versionnés.
