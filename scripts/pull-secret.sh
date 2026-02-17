#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[ERR] Commande manquante: $1" >&2
    exit 2
  }
}

need_cmd ssh
need_cmd scp
need_cmd date
need_cmd mktemp

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "[ERR] .env introuvable (symlink attendu vers .env.dev)." >&2
  exit 2
fi

set -a
# shellcheck source=/dev/null
. "$ROOT_DIR/.env"
if [[ -f "$ROOT_DIR/.env.local" ]]; then
  # shellcheck source=/dev/null
  . "$ROOT_DIR/.env.local"
fi
set +a

if [[ "${APP_ENV:-}" != "dev" ]]; then
  echo "[ERR] pull-secret est autorisé uniquement depuis l'environnement dev (.env -> .env.dev)." >&2
  exit 2
fi

FORCE="${FORCE:-0}"

SLUG="${APP_SLUG:-mdp}"
SSH_TARGET="${PROD_SSH_HOST:-${PROD_SSH:-linode}}"
REMOTE_APP_DIR="${PROD_DIR:-/opt/apps/${SLUG}}"
REMOTE_FILE="${PROD_ENV_LOCAL_PATH:-${REMOTE_APP_DIR}/.env.local}"
LOCAL_FILE="$ROOT_DIR/.env.local"
TMP_FILE="$(mktemp)"

cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

if [[ -f "$LOCAL_FILE" && "$FORCE" != "1" ]]; then
  echo "[ERR] ${LOCAL_FILE} existe déjà. Utilisez FORCE=1 pour écraser." >&2
  exit 4
fi

echo "[*] Pull ${SSH_TARGET}:${REMOTE_FILE} -> ${LOCAL_FILE}"

scp "${SSH_TARGET}:${REMOTE_FILE}" "$TMP_FILE"

if [[ -f "$LOCAL_FILE" ]]; then
  cp -f "$LOCAL_FILE" "${LOCAL_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
fi

mv -f "$TMP_FILE" "$LOCAL_FILE"
chmod 600 "$LOCAL_FILE"

echo "[OK] Restauration locale terminée: $LOCAL_FILE"
