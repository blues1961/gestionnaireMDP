#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
# shellcheck source=/dev/null
. "$ROOT_DIR/.env.prod"
if [[ -f "$ROOT_DIR/.env.local" ]]; then
  # shellcheck source=/dev/null
  . "$ROOT_DIR/.env.local"
fi
set +a

SLUG="${APP_SLUG:-mdp}"
SSH_TARGET="${PROD_SSH:-linode}"
REMOTE_APP_DIR="${PROD_DIR:-/opt/apps/${SLUG}}"
REMOTE_BACKUPS_DIR="${PROD_BACKUPS_DIR:-${REMOTE_APP_DIR}/backups}"
DEV_APP_DIR_CANDIDATE="${HOME}/projets/${APP_DEPOT:-}"
if [[ -n "${DEV_DIR:-}" ]]; then
  LOCAL_APP_DIR="${DEV_DIR}"
elif [[ -n "${APP_DEPOT:-}" && -d "${DEV_APP_DIR_CANDIDATE}" ]]; then
  LOCAL_APP_DIR="${DEV_APP_DIR_CANDIDATE}"
else
  LOCAL_APP_DIR="${ROOT_DIR}"
fi
LOCAL_BACKUPS_DIR="${DEV_BACKUPS_DIR:-${LOCAL_APP_DIR}/backups}"

mkdir -p "$LOCAL_BACKUPS_DIR"

echo "[*] Remote app dir: ${SSH_TARGET}:${REMOTE_APP_DIR}"
echo "[*] Remote backups: ${SSH_TARGET}:${REMOTE_BACKUPS_DIR}"
echo "[*] Local backups: ${LOCAL_BACKUPS_DIR}"

set +e
SSH_OUTPUT="$(
  ssh "$SSH_TARGET" bash -s -- "$REMOTE_APP_DIR" "$REMOTE_BACKUPS_DIR" "$SLUG" <<'EOF'
set -euo pipefail
REMOTE_APP_DIR="$1"
REMOTE_BACKUPS_DIR="$2"
SLUG="$3"

cd "$REMOTE_APP_DIR"
make backup-db

LATEST="$(
  find "$REMOTE_BACKUPS_DIR" -maxdepth 1 -type f \
    \( -name "${SLUG}_db-*.sql.gz" -o -name "${SLUG}_db-*.sql" -o -name "${SLUG}_db.*.dump" -o -name "db-*.dump" -o -name "*.dump" \) \
    -printf '%T@ %p\n' \
    | sort -nr \
    | head -n1 \
    | cut -d' ' -f2-
)"

test -n "$LATEST"
printf '__REMOTE_FILE__=%s\n' "$LATEST"
EOF
)"
SSH_RC=$?
set -e

if (( SSH_RC != 0 )); then
  echo "[ERR] Échec du backup distant via ${SSH_TARGET}" >&2
  printf '%s\n' "$SSH_OUTPUT" >&2
  exit "$SSH_RC"
fi

REMOTE_FILE="$(printf '%s\n' "$SSH_OUTPUT" | awk -F'=' '/^__REMOTE_FILE__=/{print $2}' | tail -n1)"

if [[ -z "$REMOTE_FILE" ]]; then
  echo "[ERR] Aucun backup trouvé côté remote" >&2
  printf '%s\n' "$SSH_OUTPUT" >&2
  exit 1
fi

echo "[*] Remote file: ${REMOTE_FILE}"
scp "${SSH_TARGET}:${REMOTE_FILE}" "${LOCAL_BACKUPS_DIR}/"
LOCAL_FILE="${LOCAL_BACKUPS_DIR}/$(basename -- "$REMOTE_FILE")"
touch "$LOCAL_FILE"

echo "[OK] Backup prod rapatrié -> ${LOCAL_FILE}"
