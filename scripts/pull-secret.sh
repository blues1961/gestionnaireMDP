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

need_cmd curl
need_cmd jq
need_cmd openssl
need_cmd tar
need_cmd base64
need_cmd mktemp

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "[ERR] .env introuvable à la racine (symlink attendu vers .env.dev ou .env.prod)." >&2
  exit 2
fi

set -a
# shellcheck source=/dev/null
. "$ROOT_DIR/.env"
set +a

APP_ENV_ACTIVE="${APP_ENV:-}"
if [[ -z "$APP_ENV_ACTIVE" ]]; then
  echo "[ERR] APP_ENV manquant dans .env" >&2
  exit 2
fi

TARGET_ENV="${1:-$APP_ENV_ACTIVE}"
if [[ ! "$TARGET_ENV" =~ ^(dev|prod)$ ]]; then
  echo "[ERR] Environnement invalide: '$TARGET_ENV' (attendu: dev|prod)" >&2
  exit 2
fi

TARGET_ENV_FILE="$ROOT_DIR/.env.${TARGET_ENV}"
if [[ ! -f "$TARGET_ENV_FILE" ]]; then
  echo "[ERR] Fichier introuvable: .env.${TARGET_ENV}" >&2
  exit 2
fi

set -a
# shellcheck source=/dev/null
. "$TARGET_ENV_FILE"
set +a

if [[ -f "$ROOT_DIR/.env.${TARGET_ENV}.local" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$ROOT_DIR/.env.${TARGET_ENV}.local"
  set +a
fi

APP_SLUG_SAFE="${APP_SLUG:-mdp}"
BUNDLE_APP="${BUNDLE_APP:-${APP_SLUG_SAFE}-env}"
BUNDLE_ENV="${BUNDLE_ENV:-$TARGET_ENV}"
FORCE="${FORCE:-0}"
PULL_SECRET_VERSION="${PULL_SECRET_VERSION:-v1}"
PULL_SECRET_APP_ID="${PULL_SECRET_APP_ID:-${APP_SLUG_SAFE}}"
PULL_ROOT_SECRET_FILE="${PULL_ROOT_SECRET_FILE:-$ROOT_DIR/.env.root.local}"

if [[ -z "${PULL_ROOT_SECRET:-}" && -f "$PULL_ROOT_SECRET_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$PULL_ROOT_SECRET_FILE"
  set +a
fi

if [[ -z "${PULL_SECRET:-}" ]]; then
  if [[ -n "${PULL_ROOT_SECRET:-}" ]]; then
    PULL_SECRET="$(
      printf 'pull-secret:%s:%s:%s' "$PULL_SECRET_VERSION" "$PULL_SECRET_APP_ID" "$TARGET_ENV" \
        | openssl dgst -sha256 -mac HMAC -macopt "key:${PULL_ROOT_SECRET}" -binary \
        | base64 | tr -d '\n'
    )"
  else
    echo "[ERR] PULL_SECRET manquant (ou fournir PULL_ROOT_SECRET pour derivation)." >&2
    echo "      Astuce: initialiser $PULL_ROOT_SECRET_FILE via ./scripts/init-pull-root-secret.sh" >&2
    exit 2
  fi
fi

if [[ -n "${API_BASE_URL:-}" ]]; then
  API_BASE="${API_BASE_URL%/}"
else
  if [[ "$TARGET_ENV" == "dev" ]]; then
    API_BASE="http://localhost:${DEV_API_PORT:-8000}/api"
  else
    : "${APP_HOST:?APP_HOST manquant pour construire API_BASE_URL en prod}"
    API_BASE="https://${APP_HOST}/api"
  fi
fi

if [[ -n "${JWT_ACCESS_TOKEN:-}" ]]; then
  ACCESS_TOKEN="$JWT_ACCESS_TOKEN"
else
  : "${ADMIN_USERNAME:?ADMIN_USERNAME manquant (.env.${TARGET_ENV}.local)}"
  : "${ADMIN_PASSWORD:?ADMIN_PASSWORD manquant (.env.${TARGET_ENV}.local)}"
  AUTH_JSON="$(jq -n --arg u "$ADMIN_USERNAME" --arg p "$ADMIN_PASSWORD" '{username:$u, password:$p}')"
  AUTH_RES="$(curl -fsS -X POST "${API_BASE}/auth/jwt/create/" \
    -H "Content-Type: application/json" \
    -d "$AUTH_JSON")"
  ACCESS_TOKEN="$(printf '%s' "$AUTH_RES" | jq -r '.access // empty')"
  if [[ -z "$ACCESS_TOKEN" ]]; then
    echo "[ERR] Impossible d'obtenir un token JWT via ${API_BASE}/auth/jwt/create/" >&2
    exit 3
  fi
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

PAYLOAD_FILE="$TMP_DIR/payload.json"
ENCRYPTED="$TMP_DIR/env-files.enc"
ARCHIVE="$TMP_DIR/env-files.tar.gz"
RESTORE_DIR="$TMP_DIR/restore"

HTTP_CODE="$(
  curl -sS -o "$PAYLOAD_FILE" -w "%{http_code}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "${API_BASE}/secrets/?app=${BUNDLE_APP}&env=${BUNDLE_ENV}"
)"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[ERR] Échec récupération secret bundle (HTTP ${HTTP_CODE}) app=${BUNDLE_APP} env=${BUNDLE_ENV}" >&2
  cat "$PAYLOAD_FILE" >&2 || true
  exit 3
fi

if ! jq -e '.kind == "env-files-backup" and (.version|tonumber) == 1 and (.ciphertext|type) == "string"' "$PAYLOAD_FILE" >/dev/null; then
  echo "[ERR] Payload incompatible (kind/version/ciphertext)." >&2
  exit 3
fi

jq -r '.ciphertext' "$PAYLOAD_FILE" | base64 -d > "$ENCRYPTED"
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "$ENCRYPTED" \
  -out "$ARCHIVE" \
  -pass "pass:${PULL_SECRET}"

EXPECTED_MAIN=".env.${TARGET_ENV}"
EXPECTED_LOCAL=".env.${TARGET_ENV}.local"

mapfile -t ARCHIVE_ENTRIES < <(tar -tzf "$ARCHIVE")
if ((${#ARCHIVE_ENTRIES[@]} == 0)); then
  echo "[ERR] Archive vide." >&2
  exit 3
fi

for entry in "${ARCHIVE_ENTRIES[@]}"; do
  entry="${entry#./}"
  if [[ "$entry" != "$EXPECTED_MAIN" && "$entry" != "$EXPECTED_LOCAL" ]]; then
    echo "[ERR] Archive invalide: entrée inattendue '$entry'." >&2
    exit 3
  fi
done

mkdir -p "$RESTORE_DIR"
tar -xzf "$ARCHIVE" -C "$RESTORE_DIR" "$EXPECTED_MAIN" "$EXPECTED_LOCAL"

for f in "$EXPECTED_MAIN" "$EXPECTED_LOCAL"; do
  if [[ -e "$ROOT_DIR/$f" && "$FORCE" != "1" ]]; then
    echo "[ERR] $f existe déjà. Utilisez FORCE=1 pour écraser." >&2
    exit 4
  fi
done

cp -f "$RESTORE_DIR/$EXPECTED_MAIN" "$ROOT_DIR/$EXPECTED_MAIN"
cp -f "$RESTORE_DIR/$EXPECTED_LOCAL" "$ROOT_DIR/$EXPECTED_LOCAL"
chmod 644 "$ROOT_DIR/$EXPECTED_MAIN"
chmod 600 "$ROOT_DIR/$EXPECTED_LOCAL"
ln -snf "$EXPECTED_MAIN" "$ROOT_DIR/.env"

echo "[OK] Restauration des fichiers d'environnement terminée."
echo "     restaurés: $EXPECTED_MAIN, $EXPECTED_LOCAL"
echo "     .env -> $EXPECTED_MAIN"
