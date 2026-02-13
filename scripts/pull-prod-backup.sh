#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
# shellcheck source=/dev/null
. "$ROOT_DIR/.env.prod"
if [[ -f "$ROOT_DIR/.env.prod.local" ]]; then
  # shellcheck source=/dev/null
  . "$ROOT_DIR/.env.prod.local"
fi
set +a

SLUG="${APP_SLUG:-mdp}"
SSH_TARGET="${PROD_SSH:-linode}"
REMOTE_APP_DIR="${PROD_DIR:-/opt/apps/${SLUG}}"
REMOTE_BACKUPS_DIR="${PROD_BACKUPS_DIR:-${REMOTE_APP_DIR}/backups}"

mkdir -p "$ROOT_DIR/backups"

echo "[*] Remote app dir: ${SSH_TARGET}:${REMOTE_APP_DIR}"
echo "[*] Remote backups: ${SSH_TARGET}:${REMOTE_BACKUPS_DIR}"

REMOTE_FILE="$(
  ssh "$SSH_TARGET" "set -euo pipefail; cd \"$REMOTE_APP_DIR\"; make -s backup-db >/dev/null; ls -1t \"$REMOTE_BACKUPS_DIR\"/${SLUG}_db-*.sql.gz \"$REMOTE_BACKUPS_DIR\"/${SLUG}_db-*.sql \"$REMOTE_BACKUPS_DIR\"/${SLUG}_db.*.dump \"$REMOTE_BACKUPS_DIR\"/db-*.dump \"$REMOTE_BACKUPS_DIR\"/*.dump 2>/dev/null | head -n1"
)"

if [[ -z "$REMOTE_FILE" ]]; then
  echo "[ERR] Aucun backup trouvé côté remote" >&2
  exit 1
fi

scp "${SSH_TARGET}:${REMOTE_FILE}" "$ROOT_DIR/backups/"
LOCAL_FILE="$ROOT_DIR/backups/$(basename -- "$REMOTE_FILE")"
touch "$LOCAL_FILE"

echo "[OK] Backup prod rapatrié -> ${LOCAL_FILE}"
