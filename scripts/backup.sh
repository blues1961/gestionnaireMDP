#!/usr/bin/env bash
set -euo pipefail

# Usage: docker compose exec backend bash /app/scripts/backup.sh
DATE=$(date +%F_%H-%M-%S)
BACKUP_DIR=/app/backups
mkdir -p "$BACKUP_DIR"
PG_DSN="host=$DB_HOST port=$DB_PORT dbname=$POSTGRES_DB user=$POSTGRES_USER password=$POSTGRES_PASSWORD"

echo "[*] Dump PostgreSQL..."
pg_dump "$PG_DSN" > "$BACKUP_DIR/db_${DATE}.sql"

echo "[*] Compress..."
tar -czf "$BACKUP_DIR/backup_${DATE}.tar.gz" -C "$BACKUP_DIR" "db_${DATE}.sql"
rm "$BACKUP_DIR/db_${DATE}.sql"

echo "[*] Done: $BACKUP_DIR/backup_${DATE}.tar.gz"
