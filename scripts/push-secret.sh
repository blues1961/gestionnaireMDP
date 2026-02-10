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
PULL_SECRET_VERSION="${PULL_SECRET_VERSION:-v1}"
PULL_SECRET_APP_ID="${PULL_SECRET_APP_ID:-${APP_SLUG_SAFE}}"

if [[ -z "${PULL_SECRET:-}" ]]; then
  if [[ -n "${PULL_ROOT_SECRET:-}" ]]; then
    PULL_SECRET="$(
      printf 'pull-secret:%s:%s:%s' "$PULL_SECRET_VERSION" "$PULL_SECRET_APP_ID" "$TARGET_ENV" \
        | openssl dgst -sha256 -mac HMAC -macopt "key:${PULL_ROOT_SECRET}" -binary \
        | base64 | tr -d '\n'
    )"
  else
    echo "[ERR] PULL_SECRET manquant (ou fournir PULL_ROOT_SECRET pour derivation)." >&2
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

FILES=(".env.${TARGET_ENV}" ".env.${TARGET_ENV}.local")
for f in "${FILES[@]}"; do
  if [[ ! -f "$ROOT_DIR/$f" ]]; then
    echo "[ERR] Fichier requis introuvable: $f" >&2
    exit 2
  fi
done

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ARCHIVE="$TMP_DIR/env-files.tar.gz"
ENCRYPTED="$TMP_DIR/env-files.enc"
PAYLOAD_FILE="$TMP_DIR/payload.json"
POST_FILE="$TMP_DIR/post.json"

tar -C "$ROOT_DIR" -czf "$ARCHIVE" "${FILES[@]}"
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "$ARCHIVE" \
  -out "$ENCRYPTED" \
  -pass "pass:${PULL_SECRET}"

CIPHERTEXT_B64="$(base64 -w 0 "$ENCRYPTED")"
FILES_JSON="$(printf '%s\n' "${FILES[@]}" | jq -R . | jq -s .)"

jq -n \
  --arg kind "env-files-backup" \
  --argjson version 1 \
  --arg algorithm "openssl-aes-256-cbc-pbkdf2" \
  --arg archive "tar.gz" \
  --arg ciphertext "$CIPHERTEXT_B64" \
  --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg app_env "$TARGET_ENV" \
  --arg source_env "$APP_ENV_ACTIVE" \
  --arg host "$(hostname)" \
  --argjson files "$FILES_JSON" \
  '{
    kind: $kind,
    version: $version,
    algorithm: $algorithm,
    archive: $archive,
    ciphertext: $ciphertext,
    files: $files,
    meta: {
      created_at: $created_at,
      source_app_env: $app_env,
      current_symlink_env: $source_env,
      source_host: $host
    }
  }' > "$PAYLOAD_FILE"

jq -n \
  --arg app "$BUNDLE_APP" \
  --arg env "$BUNDLE_ENV" \
  --slurpfile payload "$PAYLOAD_FILE" \
  '{
    app: $app,
    env: $env,
    payload: $payload[0]
  }' > "$POST_FILE"

HTTP_CODE="$(
  curl -sS -o "$TMP_DIR/response.json" -w "%{http_code}" \
    -X POST "${API_BASE}/secrets/" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d @"$POST_FILE"
)"

if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" ]]; then
  echo "[ERR] Échec upload secret bundle (HTTP ${HTTP_CODE})." >&2
  cat "$TMP_DIR/response.json" >&2 || true
  exit 3
fi

echo "[OK] Backup des env poussé."
echo "     app=${BUNDLE_APP} env=${BUNDLE_ENV} files=${FILES[*]}"
echo "     endpoint=${API_BASE}/secrets/"
