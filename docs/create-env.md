# Générer les fichiers `.env`

Le workflow courant suit maintenant la logique du template :

1. `.env.template.example` est versionné ;
2. `.env.template` est local ;
3. `make generate-env` génère `.env.dev` et `.env.prod`.

## 1. Workflow recommandé

Depuis la racine du projet :

```bash
cp .env.template.example .env.template
```

Puis compléter `.env.template` avec au minimum :

```env
APP_NAME=
APP_SLUG=
APP_DEPOT=
APP_NO=
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_EMAIL=
```

Ensuite :

```bash
make generate-env
make dev
```

## 2. Bootstrap interactif

Le dépôt conserve une aide interactive :

```bash
make create-env
```

Cette commande :

- crée `.env.template` si nécessaire ;
- y place les invariants de base ;
- lance ensuite `make generate-env`.

> **Astuce** : pour recréer `.env.template`, relancer avec `FORCE=1 make create-env`.

## 3. Étapes suivantes

1. Vérifier ou compléter `.env.local` :

```bash
cp .env.local.example .env.local
```

2. Ajuster les valeurs réelles dans `.env.local`.
3. Démarrer :

```bash
make up
make migrate
make createsuperuser
```

## 4. Que contient `.env.dev` ?

- `APP_ENV`, `APP_SLUG`, `APP_NAME`, `APP_DEPOT`, `APP_NO`, `APP_HOST`.
- Ports `DEV_*` calculés via `APP_NO`.
- `POSTGRES_*` dérivés de `APP_SLUG`.
- `ALLOWED_HOSTS=${APP_HOST},localhost,…` et `FRONT_ORIGIN=http://${APP_HOST}:${DEV_VITE_PORT}`.
- `VITE_API_BASE=/api`.
- Un rappel indiquant que les secrets vivent dans `.env.local`.

`.env.prod` suit la même structure, avec `DJANGO_DEBUG=0`, `FRONT_ORIGIN=https://${APP_HOST}` et les ports prod (`PROD_DB_PORT`, `PROD_API_PORT`, `PROD_FRONT_PORT`) dérivés automatiquement.

## 5. Pourquoi ce workflow ?

- Garantit le respect des invariants documentés dans `INVARIANTS.md`.
- Évite les erreurs récurrentes (ports incohérents, `APP_SLUG` oublié dans `POSTGRES_*`, `ALLOWED_HOSTS` incomplets).
- Rapproche le dépôt du fonctionnement de `app-template`.

**Rappel** : les secrets réels ne doivent jamais être commités. Seuls `.env.dev`, `.env.prod`, et `.env.local.example` sont versionnés.
