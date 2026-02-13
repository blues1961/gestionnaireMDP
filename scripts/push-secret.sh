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
  echo "[ERR] push-secret est autorisé uniquement depuis l'environnement dev (.env -> .env.dev)." >&2
  exit 2
fi

LOCAL_FILE="$ROOT_DIR/.env.local"
if [[ ! -f "$LOCAL_FILE" ]]; then
  echo "[ERR] Fichier local introuvable: $LOCAL_FILE" >&2
  exit 2
fi

SLUG="${APP_SLUG:-mdp}"
SSH_TARGET="${PROD_SSH:-linode}"
REMOTE_APP_DIR="${PROD_DIR:-/opt/apps/${SLUG}}"
REMOTE_FILE="${PROD_ENV_LOCAL_PATH:-${REMOTE_APP_DIR}/.env.local}"
REMOTE_INCOMING="${REMOTE_FILE}.incoming"

echo "[*] Push .env.local -> ${SSH_TARGET}:${REMOTE_FILE}"

scp "$LOCAL_FILE" "${SSH_TARGET}:${REMOTE_INCOMING}"

ssh "$SSH_TARGET" bash -s -- "$REMOTE_FILE" <<'EOF'
set -euo pipefail
REMOTE_FILE="$1"
REMOTE_INCOMING="${REMOTE_FILE}.incoming"
REMOTE_DIR="$(dirname -- "$REMOTE_FILE")"

mkdir -p "$REMOTE_DIR"

if [[ ! -f "$REMOTE_INCOMING" ]]; then
  echo "[ERR] Fichier temporaire introuvable: $REMOTE_INCOMING" >&2
  exit 2
fi

if [[ -f "$REMOTE_FILE" ]]; then
  cp -f "$REMOTE_FILE" "${REMOTE_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
fi

mv -f "$REMOTE_INCOMING" "$REMOTE_FILE"
chmod 600 "$REMOTE_FILE"
echo "[OK] Fichier prod mis à jour: $REMOTE_FILE"
EOF

echo "[OK] Push terminé."
