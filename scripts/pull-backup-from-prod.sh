#!/usr/bin/env bash
set -euo pipefail

# Par défaut on lit .env.dev (contient PROD_SSH_*)
ENV_FILE="${ENV_FILE:-.env.dev}"
set -a
source "$ENV_FILE"
set +a

SERVER="$PROD_SSH_USER@$PROD_SSH_HOST"
APP_DIR="$PROD_APP_DIR"
BACKUPS_LOCAL="./backups"
BACKUPS_REMOTE="$APP_DIR/backups"
SSH_OPTS="-o StrictHostKeyChecking=accept-new"

# Dernier dump côté PROD
LAST_REMOTE=$(ssh $SSH_OPTS "$SERVER" "ls -1t '$BACKUPS_REMOTE'/*.sql '$BACKUPS_REMOTE'/*.sql.gz 2>/dev/null | head -n1" || true)
if [[ -z "${LAST_REMOTE:-}" ]]; then
  echo "❌ Aucun dump trouvé côté PROD ($SERVER:$BACKUPS_REMOTE)" >&2
  exit 1
fi

mkdir -p "$BACKUPS_LOCAL"

# Téléchargement PROD → DEV
rsync -avh --progress --partial -e "ssh $SSH_OPTS" "$SERVER:$LAST_REMOTE" "$BACKUPS_LOCAL/"

BASENAME=$(basename "$LAST_REMOTE")
cat <<EOF

✅ Rapatriement OK → $BACKUPS_LOCAL/$BASENAME

Pour restaurer en DEV :
  ./scripts/restore-db.sh "$BACKUPS_LOCAL/$BASENAME"
EOF
