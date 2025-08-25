#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.dev}"
set -a
source "$ENV_FILE"
set +a

SERVER="$PROD_SSH_USER@$PROD_SSH_HOST"
APP_DIR="$PROD_APP_DIR"
BACKUPS_LOCAL="./backups"
BACKUPS_REMOTE="$APP_DIR/backups"
SSH_OPTS="-o StrictHostKeyChecking=accept-new"

DUMP=$(ls -1t "$BACKUPS_LOCAL"/*.sql "$BACKUPS_LOCAL"/*.sql.gz 2>/dev/null | head -n1 || true)
if [[ -z "${DUMP:-}" ]]; then
  echo "❌ Aucun dump trouvé dans $BACKUPS_LOCAL" >&2
  exit 1
fi

ssh $SSH_OPTS "$SERVER" "mkdir -p '$BACKUPS_REMOTE'"
rsync -avh --progress --partial -e "ssh $SSH_OPTS" "$DUMP" "$SERVER:$BACKUPS_REMOTE/"

BASENAME=$(basename "$DUMP")
cat <<EOF

✅ Transfert OK → $SERVER:$BACKUPS_REMOTE/$BASENAME

Pour restaurer en PROD :
  ssh $SERVER 'cd "$APP_DIR" && COMPOSE_FILE=docker-compose.prod.yml ENV_FILE=.env.prod ./scripts/restore-db.sh "backups/$BASENAME"'
EOF
