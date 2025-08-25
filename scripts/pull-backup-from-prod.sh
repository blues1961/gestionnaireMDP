# scripts/pull-backup-from-prod.sh
#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=scripts/lib/env_detect.sh
. "$(dirname "$0")/lib/env_detect.sh"
env_detect_init
echo "INFO: APP_ENV=$APP_ENV | ENV_FILE=$ENV_FILE | COMPOSE_FILE=$COMPOSE_FILE"


# Ce script s'exécute sur la machine de développement.
# Il récupère LE DERNIER dump présent sur le serveur de production
# et le copie dans ./backups côté local.


read_var() { read_env "$1"; }
PROD_SSH_USER="$(read_var PROD_SSH_USER)"
PROD_SSH_HOST="$(read_var PROD_SSH_HOST)"
PROD_APP_DIR="$(read_var PROD_APP_DIR)"
[ -n "$PROD_SSH_USER" ] && [ -n "$PROD_SSH_HOST" ] && [ -n "$PROD_APP_DIR" ] || { echo "ERROR: PROD_SSH_* missing in $ENV_FILE" >&2; exit 2; }


SERVER="$PROD_SSH_USER@$PROD_SSH_HOST"
BACKUPS_LOCAL="./backups"
BACKUPS_REMOTE="$PROD_APP_DIR/backups"
SSH_OPTS="-o StrictHostKeyChecking=accept-new"


# Trouver le dernier dump côté serveur
LAST_REMOTE="$(ssh $SSH_OPTS "$SERVER" "ls -1t '$BACKUPS_REMOTE'/*.sql '$BACKUPS_REMOTE'/*.sql.gz 2>/dev/null | head -n1" || true)"
[ -n "${LAST_REMOTE:-}" ] || { echo "ERROR: No dump found on server ($SERVER:$BACKUPS_REMOTE)" >&2; exit 1; }


mkdir -p "$BACKUPS_LOCAL"
rsync -avh --progress --partial -e "ssh $SSH_OPTS" "$SERVER:$LAST_REMOTE" "$BACKUPS_LOCAL/"


BASENAME="$(basename "$LAST_REMOTE")"
echo "OK: Pulled $BASENAME -> $BACKUPS_LOCAL/$BASENAME"
echo "Hint: Restore locally with: ./scripts/restore-db.sh" # pas de cd ni de nom de fichier nécessaire