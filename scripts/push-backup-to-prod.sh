#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib/env_detect.sh"
env_detect_init
echo "INFO: APP_ENV=$APP_ENV | ENV_FILE=$ENV_FILE | COMPOSE_FILE=$COMPOSE_FILE"


PROD_SSH_USER="$(read_env PROD_SSH_USER)"
PROD_SSH_HOST="$(read_env PROD_SSH_HOST)"
PROD_APP_DIR="$(read_env PROD_APP_DIR)"
[ -n "$PROD_SSH_USER" ] && [ -n "$PROD_SSH_HOST" ] && [ -n "$PROD_APP_DIR" ] || { echo "ERROR: PROD_SSH_* missing in $ENV_FILE"; exit 2; }


SERVER="$PROD_SSH_USER@$PROD_SSH_HOST"
BACKUPS_LOCAL="./backups"
BACKUPS_REMOTE="$PROD_APP_DIR/backups"
SSH_OPTS="-o StrictHostKeyChecking=accept-new"


DUMP="$(ls -1t "$BACKUPS_LOCAL"/*.sql "$BACKUPS_LOCAL"/*.sql.gz 2>/dev/null | head -n1 || true)"
[ -n "${DUMP:-}" ] || { echo "ERROR: No dump found in $BACKUPS_LOCAL"; exit 1; }


ssh $SSH_OPTS "$SERVER" "mkdir -p '$BACKUPS_REMOTE'"
rsync -avh --progress --partial -e "ssh $SSH_OPTS" "$DUMP" "$SERVER:$BACKUPS_REMOTE/"
BASENAME="$(basename "$DUMP")"
echo "OK: Sent $BASENAME -> $SERVER:$BACKUPS_REMOTE/$BASENAME"
echo "Hint: On server: cd '$PROD_APP_DIR' && ./scripts/prod-restore.sh 'backups/$BASENAME'"