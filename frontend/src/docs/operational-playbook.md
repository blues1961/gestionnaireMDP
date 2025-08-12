# Plan de reprise après crash & exploitation (DEV/PROD)

## 0) Prérequis à conserver en lieu sûr

* **Clé RSA navigateur (export JSON)** + **passphrase**
* Fichiers **`.env`** et **`.env.production`** (jamais dans Git)
* Dernière **sauvegarde DB** PostgreSQL (`.sql`/`.dump`)

---

## 1) Reprise rapide (même machine ou nouvelle)

1. Récupérer le code depuis Git.
2. Remettre les fichiers `.env` / `.env.production` (mêmes valeurs qu’avant).
3. Lancer les services :

   ```bash
   # DEV
   docker compose -f docker-compose.dev.yml up -d --build
   # PROD (exemple)
   docker compose -f docker-compose.yml up -d --build
   ```
4. Si la DB est vide : restaurer un backup (voir Backups).
5. Se connecter à l’admin Django (`/admin/`).
6. Importer la **clé RSA navigateur** via “Sauvegarde clé” → Importer (JSON + passphrase).
7. Tester `/key-check`, puis révéler un mot de passe.

> ⚠️ Ne JAMAIS régénérer une nouvelle clé si vous voulez lire des données existantes : il faut **ré-importer** la bonne clé JSON.

---

## 2) Commandes Docker (DEV)

### Démarrer

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### Arrêter / Nettoyer

```bash
# Arrêter et supprimer les containers (conserve les volumes = DB)
docker compose -f docker-compose.dev.yml down

# ⚠️ Supprimer containers + volumes (efface la DB)
docker compose -f docker-compose.dev.yml down -v
```

### Divers

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs -f
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml restart backend
```

> En **prod**, utilisez `-f docker-compose.yml`.

---

## 3) Backups & Restauration PostgreSQL

### Sauvegarder (dump lisible)

```bash
mkdir -p backups
docker compose -f docker-compose.dev.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backups/backup_$(date +%F).sql
```

### Restaurer

```bash
cat backups/backup_YYYY-MM-DD.sql | \
  docker compose -f docker-compose.dev.yml exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

---

## 4) Clés & Secrets — rappels

* **Clé RSA navigateur (JSON + passphrase)** : jamais dans `.env`.
  Import sur chaque navigateur via “Sauvegarde clé”.
* **`DJANGO_SECRET_KEY` + identifiants PostgreSQL** : dans `.env` / `.env.production` (jamais dans Git).
* Après modification d’un `.env`, redémarrer les conteneurs.

---

## 5) Git — workflow minimal

```bash
git status
git add .
git commit -m "docs: operational playbook + docker cmds"
git push origin main
```

### `.gitignore` conseillé

```
.env
.env.production
backups/
frontend/node_modules/
**/*.zkkey.json
*.dump
*.sql
```

### Branches / tags (optionnel)

```bash
git switch -c feature/xyz
git tag -a v1.0.0 -m "first prod"
git push origin --tags
```

---

## 6) Dépannage rapide

* **403 Forbidden sur POST API en dev** : login Django Admin + bypass CSRF DEV (middleware) + CORS `http://localhost:5173`.
* **Impossible de déchiffrer** : clé JSON erronée / passphrase incorrecte / données chiffrées avec une autre clé.
* **Admin ne charge pas** : vérifier `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, cookies, et logs backend.
