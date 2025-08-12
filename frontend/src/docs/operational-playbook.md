# Plan de reprise après crash & exploitation (DEV/PROD)

---

## 0) Prérequis à conserver en lieu sûr

* **Clé RSA navigateur (export JSON)** + **passphrase**
* Fichiers `.env` et `.env.production` (jamais dans Git)
* Dernière **sauvegarde DB** PostgreSQL (`.sql` / `.dump`)

---

## 1) Reprise rapide (même machine ou nouvelle)

1. Récupérer le code depuis Git.
2. Restaurer les fichiers `.env` / `.env.production`.
3. Lancer les services :

```bash
# DEV
docker compose -f docker-compose.dev.yml up -d --build
# PROD
docker compose -f docker-compose.yml up -d --build
```

4. Si la DB est vide : restaurer un backup (voir section Backups).
5. Se connecter à l’admin Django (`/admin/`).
6. Importer la clé RSA navigateur via “Sauvegarde clé” → Importer (JSON + passphrase).
7. Tester `/key-check` et révéler un mot de passe.

> ⚠️ Ne JAMAIS régénérer une nouvelle clé si vous voulez lire des données existantes.

---

## 2) Commandes Docker (DEV)

### Démarrer

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### Arrêter / Nettoyer

```bash
# Arrêter et supprimer les containers (conserve les volumes)
docker compose -f docker-compose.dev.yml down
# Supprimer containers + volumes (efface la DB)
docker compose -f docker-compose.dev.yml down -v
```

### Divers

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs -f
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml restart backend
```

> En prod : utilisez `-f docker-compose.yml`.

---

## 3) Backups de la base de données

### Sauvegarde PostgreSQL

```bash
mkdir -p backups
BACKUP_FILE="backups/backup_$(date +%F_%H%M%S).sql"
docker compose -f docker-compose.dev.yml exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$BACKUP_FILE"
```

* Le fichier est sauvegardé dans `backups/`.
* Ajouter `backups/` dans `.gitignore`.

### Vérifier le backup

```bash
ls -lh backups/
head -n 5 backups/backup_*.sql
```

### Restaurer un backup

```bash
FILE=backups/backup_YYYY-MM-DD_HHMMSS.sql
cat "$FILE" | docker compose -f docker-compose.dev.yml exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

### Bonnes pratiques

* Faire un backup avant toute mise à jour critique.
* Conserver des copies hors du serveur local.
* Automatiser via `scripts/backup-db.sh`.

---

## 4) Clés & Secrets — rappels

* Clé RSA navigateur (JSON + passphrase) : jamais dans `.env`.
* `DJANGO_SECRET_KEY` + identifiants PostgreSQL : dans `.env` / `.env.production`.
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

* **403 Forbidden sur POST API en dev** : login Django Admin + bypass CSRF DEV + CORS `http://localhost:5173`.
* **Impossible de déchiffrer** : clé JSON erronée / passphrase incorrecte / données chiffrées avec une autre clé.
* **Admin ne charge pas** : vérifier `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, cookies, et logs backend.
