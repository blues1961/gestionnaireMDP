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

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$ROOT_DIR/.env.local"
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

normalize_path() {
  local p="${1#/}"
  [[ "$p" == */ ]] || p="${p}/"
  printf '%s' "$p"
}

SECRETS_PATH="${SECRETS_PATH:-secrets/}"
SECRETS_FALLBACK_PATHS="${SECRETS_FALLBACK_PATHS:-secret-bundles/,secretbundle/,secret-bundle/}"
PRIMARY_PATH="$(normalize_path "$SECRETS_PATH")"

declare -a SECRETS_PATH_CANDIDATES=("$PRIMARY_PATH")
IFS=',' read -r -a EXTRA_PATHS <<< "$SECRETS_FALLBACK_PATHS"
for raw_path in "${EXTRA_PATHS[@]}"; do
  raw_path="${raw_path//[[:space:]]/}"
  [[ -z "$raw_path" ]] && continue
  candidate="$(normalize_path "$raw_path")"
  already=0
  for existing in "${SECRETS_PATH_CANDIDATES[@]}"; do
    if [[ "$existing" == "$candidate" ]]; then
      already=1
      break
    fi
  done
  [[ "$already" -eq 1 ]] || SECRETS_PATH_CANDIDATES+=("$candidate")
done

if [[ -n "${JWT_ACCESS_TOKEN:-}" ]]; then
  ACCESS_TOKEN="$JWT_ACCESS_TOKEN"
else
  AUTH_USERNAME="${API_AUTH_USERNAME:-${ADMIN_USERNAME:-}}"
  AUTH_PASSWORD="${API_AUTH_PASSWORD:-${ADMIN_PASSWORD:-}}"
  if [[ -z "$AUTH_USERNAME" || -z "$AUTH_PASSWORD" ]]; then
    echo "[ERR] Auth manquante pour pull-secret." >&2
    echo "      Fournir JWT_ACCESS_TOKEN, ou API_AUTH_USERNAME/API_AUTH_PASSWORD" >&2
    echo "      (dans .env.local ou .env.root.local)." >&2
    exit 2
  fi
  AUTH_JSON="$(jq -n --arg u "$AUTH_USERNAME" --arg p "$AUTH_PASSWORD" '{username:$u, password:$p}')"
  AUTH_RESPONSE_FILE="$(mktemp)"
  AUTH_HTTP_CODE="$(
    curl -sS -o "$AUTH_RESPONSE_FILE" -w "%{http_code}" \
      -X POST "${API_BASE}/auth/jwt/create/" \
      -H "Content-Type: application/json" \
      -d "$AUTH_JSON"
  )"
  AUTH_RES="$(cat "$AUTH_RESPONSE_FILE" 2>/dev/null || true)"
  rm -f "$AUTH_RESPONSE_FILE"
  if [[ "$AUTH_HTTP_CODE" != "200" ]]; then
    echo "[ERR] Échec auth JWT (HTTP ${AUTH_HTTP_CODE}) via ${API_BASE}/auth/jwt/create/" >&2
    [[ -n "$AUTH_RES" ]] && echo "$AUTH_RES" >&2
    exit 3
  fi
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

SUCCESS_ENDPOINT=""
declare -a ATTEMPTED_ENDPOINTS=()
for path_candidate in "${SECRETS_PATH_CANDIDATES[@]}"; do
  endpoint="${API_BASE}/${path_candidate}"
  ATTEMPTED_ENDPOINTS+=("$endpoint")

  HTTP_CODE="$(
    curl -sS -o "$PAYLOAD_FILE" -w "%{http_code}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      "${endpoint}?app=${BUNDLE_APP}&env=${BUNDLE_ENV}"
  )"

  if [[ "$HTTP_CODE" == "200" ]]; then
    SUCCESS_ENDPOINT="$endpoint"
    break
  fi

  if [[ "$HTTP_CODE" != "404" ]]; then
    echo "[ERR] Échec récupération secret bundle (HTTP ${HTTP_CODE}) app=${BUNDLE_APP} env=${BUNDLE_ENV} endpoint=${endpoint}" >&2
    cat "$PAYLOAD_FILE" >&2 || true
    exit 3
  fi
done

if [[ -z "$SUCCESS_ENDPOINT" ]]; then
  echo "[ERR] Endpoint secrets introuvable (HTTP 404)." >&2
  printf '      endpoints testés:\n' >&2
  printf '      - %s\n' "${ATTEMPTED_ENDPOINTS[@]}" >&2
  echo "      Vérifiez le déploiement backend (route /api/secrets/) ou définissez SECRETS_PATH." >&2
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
EXPECTED_LOCAL=".env.local"
LEGACY_LOCAL=".env.${TARGET_ENV}.local"

mapfile -t ARCHIVE_ENTRIES < <(tar -tzf "$ARCHIVE")
if ((${#ARCHIVE_ENTRIES[@]} == 0)); then
  echo "[ERR] Archive vide." >&2
  exit 3
fi

for entry in "${ARCHIVE_ENTRIES[@]}"; do
  entry="${entry#./}"
  if [[ "$entry" != "$EXPECTED_MAIN" && "$entry" != "$EXPECTED_LOCAL" && "$entry" != "$LEGACY_LOCAL" ]]; then
    echo "[ERR] Archive invalide: entrée inattendue '$entry'." >&2
    exit 3
  fi
done

mkdir -p "$RESTORE_DIR"
if printf '%s\n' "${ARCHIVE_ENTRIES[@]}" | grep -qx "$EXPECTED_LOCAL"; then
  tar -xzf "$ARCHIVE" -C "$RESTORE_DIR" "$EXPECTED_MAIN" "$EXPECTED_LOCAL"
elif printf '%s\n' "${ARCHIVE_ENTRIES[@]}" | grep -qx "$LEGACY_LOCAL"; then
  tar -xzf "$ARCHIVE" -C "$RESTORE_DIR" "$EXPECTED_MAIN" "$LEGACY_LOCAL"
else
  echo "[ERR] Archive invalide: fichier local manquant (.env.local ou .env.${TARGET_ENV}.local)." >&2
  exit 3
fi

if [[ -e "$ROOT_DIR/$EXPECTED_MAIN" && "$FORCE" != "1" ]]; then
  echo "[ERR] $EXPECTED_MAIN existe déjà. Utilisez FORCE=1 pour écraser." >&2
  exit 4
fi

LOCAL_SOURCE="$RESTORE_DIR/$EXPECTED_LOCAL"
if [[ ! -f "$LOCAL_SOURCE" ]]; then
  LOCAL_SOURCE="$RESTORE_DIR/$LEGACY_LOCAL"
fi

if [[ -e "$ROOT_DIR/$EXPECTED_LOCAL" && "$FORCE" != "1" ]]; then
  if ! cmp -s "$LOCAL_SOURCE" "$ROOT_DIR/$EXPECTED_LOCAL"; then
    echo "[ERR] $EXPECTED_LOCAL existe déjà et diffère du bundle. Utilisez FORCE=1 pour écraser." >&2
    exit 4
  fi
fi

cp -f "$RESTORE_DIR/$EXPECTED_MAIN" "$ROOT_DIR/$EXPECTED_MAIN"
if [[ -e "$ROOT_DIR/$EXPECTED_LOCAL" && "$FORCE" != "1" ]]; then
  :
else
  cp -f "$LOCAL_SOURCE" "$ROOT_DIR/$EXPECTED_LOCAL"
fi
chmod 644 "$ROOT_DIR/$EXPECTED_MAIN"
chmod 600 "$ROOT_DIR/$EXPECTED_LOCAL"
ln -snf "$EXPECTED_MAIN" "$ROOT_DIR/.env"

echo "[OK] Restauration des fichiers d'environnement terminée."
echo "     restaurés: $EXPECTED_MAIN, $EXPECTED_LOCAL"
echo "     .env -> $EXPECTED_MAIN"
echo "     endpoint=${SUCCESS_ENDPOINT}"
