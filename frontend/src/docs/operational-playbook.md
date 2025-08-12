# Plan de reprise après crash & exploitation (DEV/PROD)

---

## 0) Prérequis à conserver en lieu sûr

* **Clé RSA navigateur** (export JSON) + **passphrase**
* Fichiers `.env` et `.env.production` (jamais dans Git)
* Dernière **sauvegarde DB** PostgreSQL (`.sql` / `.dump`)

---

## 1) Reprise rapide

1. Récupérer le code depuis Git.
2. Restaurer `.env` / `.env.production`.
3. Lancer :

```bash
# DEV
docker compose -f docker-compose.dev.yml up -d --build
# PROD
docker compose -f docker-compose.yml up -d --build
```

4. Restaurer la DB si vide (voir section **3 - Backups**).
5. Se connecter à l’admin Django (`/admin/`).
6. Importer clé RSA via “Sauvegarde clé” → Importer (JSON + passphrase).
7. Tester `/key-check`.

> ⚠️ Ne pas régénérer la clé si données existantes.

---

## 2) Commandes Docker (DEV)

**Démarrage :**

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

**Arrêt :**

```bash
# Conserve les volumes
docker compose -f docker-compose.dev.yml down
# Supprime aussi la DB
docker compose -f docker-compose.dev.yml down -v
```

**Utilitaires :**

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs -f
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml restart backend
```

> En prod : remplacer par `-f docker-compose.yml`.

---

## 3) Backups de la base de données

### Sauvegarde :

```bash
mkdir -p backups
BACKUP_FILE="backups/backup_$(date +%F_%H%M%S).sql"
docker compose -f docker-compose.dev.yml exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$BACKUP_FILE"
```

* Sauvegardes stockées dans `backups/` (mettre dans `.gitignore`).
* Créer un script `scripts/backup-db.sh` pour automatiser.

### Vérification :

```bash
ls -lh backups/
head -n 5 backups/backup_*.sql
```

### Restauration :

```bash
FILE=backups/backup_YYYY-MM-DD_HHMMSS.sql
cat "$FILE" | docker compose -f docker-compose.dev.yml exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

### Bonnes pratiques :

* Faire un backup avant toute MAJ critique.
* Copier régulièrement les backups hors serveur.
* Tester la restauration au moins 1×/mois.

### Accès aux backups :

* Les fichiers sont créés dans le dossier `backups/` à la racine du projet.
* Pour exporter hors serveur :

```bash
scp backups/backup_YYYY-MM-DD_HHMMSS.sql user@serveur:/chemin/de/sauvegarde/
```

### Backups automatiques :

* Automatiser avec un cron job sur le serveur :

```bash
0 3 * * * /chemin/vers/scripts/backup-db.sh
```

* Conserver plusieurs générations (7 jours, 4 semaines, 12 mois).
* Tester régulièrement la restauration sur un environnement de staging.

---

## 4) Clés & Secrets

* Clé RSA navigateur : **jamais** dans `.env`.
* `DJANGO_SECRET_KEY` + mots de passe PostgreSQL : dans `.env` / `.env.production`.
* Après modification des fichiers `.env`, redémarrer les containers.

---

## 5) Git — Workflow

### Commandes de base :

```bash
git status
git add .
git commit -m "docs: operational playbook + docker cmds"
git push origin main
```

### .gitignore recommandé :

```
.env
.env.production
backups/
frontend/node_modules/
**/*.zkkey.json
*.dump
*.sql
```

### Branches & tags :

```bash
git switch -c feature/xyz
git tag -a v1.0.0 -m "first prod"
git push origin --tags
```

---

## 6) Dépannage

* **403 Forbidden** : vérifier login admin, CORS et CSRF.
* **Déchiffrement impossible** : clé ou passphrase incorrecte.
* **Admin KO** : vérifier `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, cookies, logs backend.

---

## 8) Scripts d’automatisation (backup & restore)

### 8.1 `scripts/backup-db.sh` — backup + rotation

Crée le fichier **`scripts/backup-db.sh`** puis rends-le exécutable :

```bash
mkdir -p scripts
cat > scripts/backup-db.sh <<'BASH'
#!/usr/bin/env bash
set -euo pipefail

# Config via variables d'env (valeurs par défaut ci-dessous)
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"  # ou docker-compose.yml en prod
BACKUP_DIR="${BACKUP_DIR:-backups}"
GZIP="${GZIP:-1}"                 # 1 = compresser en .gz, 0 = garder .sql
RETENTION_DAYS="${RETENTION_DAYS:-14}"  # supprimer les backups plus vieux que N jours

mkdir -p "$BACKUP_DIR"
TS="$(date +%F_%H%M%S)"
OUTFILE="$BACKUP_DIR/backup_${TS}.sql"

# Dump depuis le conteneur PostgreSQL
# (les variables $POSTGRES_USER / $POSTGRES_DB sont lues dans le conteneur)
docker compose -f "$COMPOSE_FILE" exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$OUTFILE"

# Compression optionnelle
if [ "$GZIP" = "1" ]; then
  gzip -f "$OUTFILE"
  OUTFILE="${OUTFILE}.gz"
fi

# Vérification basique (fichier non vide)
if [ ! -s "$OUTFILE" ]; then
  echo "Backup échoué: fichier vide $OUTFILE" >&2
  exit 1
fi

# Rotation (supprime les backups plus vieux que RETENTION_DAYS)
find "$BACKUP_DIR" -type f -name 'backup_*.sql*' -mtime +"$RETENTION_DAYS" -print -delete || true

echo "✅ Backup OK: $OUTFILE"
BASH
chmod +x scripts/backup-db.sh
```

**Utilisation (DEV) :**

```bash
./scripts/backup-db.sh
```

**Utilisation (PROD) avec répertoires dédiés et rétention 30 jours :**

```bash
COMPOSE_FILE=docker-compose.yml \
BACKUP_DIR=/var/backups/gestionnaire_mdp \
RETENTION_DAYS=30 \
GZIP=1 \
./scripts/backup-db.sh
```

---

### 8.2 `scripts/restore-db.sh` — restauration .sql / .sql.gz

Crée le fichier **`scripts/restore-db.sh`** :

```bash
cat > scripts/restore-db.sh <<'BASH'
#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"
FILE="${1:-}"

if [ -z "$FILE" ]; then
  echo "Usage: $0 backups/backup_YYYY-MM-DD_HHMMSS.sql[.gz]" >&2
  exit 1
fi

if [[ "$FILE" == *.gz ]]; then
  # Restauration depuis un dump compressé
  zcat "$FILE" | docker compose -f "$COMPOSE_FILE" exec -T db \
    sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
else
  # Restauration depuis un dump texte
  cat "$FILE" | docker compose -f "$COMPOSE_FILE" exec -T db \
    sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
fi

echo "✅ Restauration terminée depuis: $FILE"
BASH
chmod +x scripts/restore-db.sh
```

**Exemples :**

```bash
# DEV
./scripts/restore-db.sh backups/backup_2025-08-12_031500.sql.gz

# PROD (spécifie le compose prod)
COMPOSE_FILE=docker-compose.yml ./scripts/restore-db.sh /var/backups/gestionnaire_mdp/backup_2025-08-12_031500.sql.gz
```

---

### 8.3 Cron d’automatisation (prod)

Exemple de tâche planifiée quotidienne à 03:00 avec rétention 30 jours :

```cron
0 3 * * * cd /opt/gestionnaire_mdp_zero_knowledge && \
  COMPOSE_FILE=docker-compose.yml \
  BACKUP_DIR=/var/backups/gestionnaire_mdp \
  RETENTION_DAYS=30 \
  GZIP=1 \
  /bin/bash scripts/backup-db.sh >> logs/backup.log 2>&1
```

**Conseils :**

* Crée un dossier `logs/` et surveille `logs/backup.log`.
* Teste la restauration **au moins 1×/mois** avec `restore-db.sh` sur un environnement de test.
* Exporte périodiquement les backups hors du serveur (S3, disque externe, etc.).
