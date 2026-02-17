#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET_FILE="${INIT_SECRET_FILE:-$ROOT_DIR/.env.local}"
TEMPLATE_FILE="${INIT_SECRET_TEMPLATE:-$ROOT_DIR/.env.local.example}"
UPDATE_DB="${INIT_SECRET_UPDATE_DB:-1}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[ERR] Commande manquante: $1" >&2
    exit 2
  }
}

parse_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  awk '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    /^[[:space:]]*[A-Za-z0-9_]+[[:space:]]*=/ {
      line = $0
      sub(/\r$/, "", line)
      key = line
      sub(/=.*/, "", key)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      value = line
      sub(/^[^=]*=/, "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^"|"$/, "", value)
      printf "%s\t%s\n", key, value
    }
  ' "$file"
}

ENV_LINK="$ROOT_DIR/.env"
if [[ ! -f "$ENV_LINK" ]]; then
  echo "[ERR] .env introuvable (symlink attendu vers .env.<env>)." >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
. "$ENV_LINK"
APP_ENV="${APP_ENV:-dev}"
set +a

ENV_SPEC="$ROOT_DIR/.env.${APP_ENV}"
if [[ ! -f "$ENV_SPEC" ]]; then
  echo "[ERR] Fichier introuvable: $ENV_SPEC" >&2
  exit 2
fi

COMPOSE_FILE="$ROOT_DIR/docker-compose.${APP_ENV}.yml"
if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[ERR] Fichier Compose introuvable: $COMPOSE_FILE" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
. "$ENV_SPEC"
set +a

POSTGRES_USER="${POSTGRES_USER:-}"
POSTGRES_DB="${POSTGRES_DB:-}"

if [[ -z "$POSTGRES_USER" || -z "$POSTGRES_DB" ]]; then
  echo "[ERR] POSTGRES_USER ou POSTGRES_DB manquant dans $ENV_SPEC" >&2
  exit 2
fi

need_cmd awk
need_cmd date
need_cmd grep
need_cmd mktemp
need_cmd openssl

mkdir -p "$(dirname "$TARGET_FILE")"

if [[ ! -f "$TEMPLATE_FILE" ]]; then
  echo "[ERR] Template introuvable: $TEMPLATE_FILE" >&2
  exit 2
fi

if [[ ! -f "$TARGET_FILE" ]]; then
  cp "$TEMPLATE_FILE" "$TARGET_FILE"
  echo "[INFO] $TARGET_FILE créé depuis $TEMPLATE_FILE"
fi

declare -A CURRENT_VALUES=()
while IFS=$'\t' read -r key value; do
  [[ -z "$key" ]] && continue
  CURRENT_VALUES["$key"]="$value"
done < <(parse_env_file "$TARGET_FILE")
CURRENT_POSTGRES_PASSWORD="${CURRENT_VALUES[POSTGRES_PASSWORD]:-}"

declare -A TEMPLATE_DEFAULTS=()
declare -A SEEN_KEYS=()
declare -a TEMPLATE_KEYS=()
while IFS=$'\t' read -r key value; do
  [[ -z "$key" ]] && continue
  if [[ -n "${SEEN_KEYS[$key]:-}" ]]; then
    continue
  fi
  SEEN_KEYS["$key"]=1
  TEMPLATE_KEYS+=("$key")
  TEMPLATE_DEFAULTS["$key"]="$value"
done < <(parse_env_file "$TEMPLATE_FILE")

if [[ "${#TEMPLATE_KEYS[@]}" -eq 0 ]]; then
  echo "[ERR] Aucun secret détecté dans $TEMPLATE_FILE" >&2
  exit 2
fi

declare -a NON_ADMIN_KEYS=()
declare -a ADMIN_KEYS=()
for key in "${TEMPLATE_KEYS[@]}"; do
  if [[ "$key" =~ ^ADMIN_ ]]; then
    ADMIN_KEYS+=("$key")
  else
    NON_ADMIN_KEYS+=("$key")
  fi
done

if [[ "${#NON_ADMIN_KEYS[@]}" -eq 0 ]]; then
  echo "[ERR] Aucun secret non-ADMIN_* dans $TEMPLATE_FILE" >&2
  exit 2
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${TARGET_FILE}.bak.${STAMP}"
cp "$TARGET_FILE" "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE" 2>/dev/null || true
echo "[*] Backup -> $BACKUP_FILE"

gen_secret() {
  local bytes="${1:-36}"
  openssl rand -base64 "$bytes" | tr -d '\n' | tr '+/' '-_' | tr -d '='
}

gen_slug() {
  local prefix="$1"
  local bytes="${2:-6}"
  printf "%s-%s" "$prefix" "$(openssl rand -hex "$bytes")"
}

generate_value_for_key() {
  local key="$1"
  case "$key" in
    DJANGO_SECRET_KEY)
      gen_secret 72
      ;;
    API_AUTH_USERNAME)
      gen_slug "api" 5
      ;;
    *_PASSWORD|*_TOKEN|*_SECRET|*_KEY)
      gen_secret 48
      ;;
    *_USERNAME)
      gen_slug "user" 4
      ;;
    *)
      gen_secret 36
      ;;
  esac
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done=0 }
    index($0, k "=") == 1 {
      if (!done) {
        print k "=" v
        done=1
      }
      next
    }
    { print }
    END {
      if (!done) print k "=" v
    }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

NEW_POSTGRES_PASSWORD=""

echo "[STEP] Régénération des variables non ADMIN_* depuis $TEMPLATE_FILE"
for key in "${NON_ADMIN_KEYS[@]}"; do
  new_value="$(generate_value_for_key "$key")"
  upsert_env_var "$TARGET_FILE" "$key" "$new_value"
  echo "       - $key mis à jour"
  if [[ "$key" == "POSTGRES_PASSWORD" ]]; then
    NEW_POSTGRES_PASSWORD="$new_value"
  fi
done

if [[ "${#ADMIN_KEYS[@]}" -gt 0 ]]; then
  echo "[INFO] Variables ADMIN_* à gérer manuellement"
  for key in "${ADMIN_KEYS[@]}"; do
    if grep -q "^${key}=" "$TARGET_FILE"; then
      echo "       - $key conservé"
    else
      upsert_env_var "$TARGET_FILE" "$key" "${TEMPLATE_DEFAULTS[$key]}"
      echo "       - $key ajouté (valeur à compléter manuellement)"
    fi
  done
fi

chmod 600 "$TARGET_FILE" 2>/dev/null || true

sync_postgres_password() {
  local old_password="$1"
  local new_password="$2"
  [[ -n "$new_password" ]] || return 0
  if [[ "$UPDATE_DB" != "1" ]]; then
    echo "[INFO] Synchronisation DB sautée (INIT_SECRET_UPDATE_DB=0)."
    return 0
  fi
  if [[ "$old_password" == "$new_password" && -n "$old_password" ]]; then
    echo "[INFO] POSTGRES_PASSWORD déjà synchronisé."
    return 0
  fi
  if [[ -z "$old_password" ]]; then
    echo "[WARN] Ancien POSTGRES_PASSWORD inconnu; rotation DB ignorée."
    return 0
  fi
  need_cmd docker
  local compose_env_file=".env.${APP_ENV}"
  local compose_file="docker-compose.${APP_ENV}.yml"
  local -a compose_cmd=(docker compose --env-file "$compose_env_file" -f "$compose_file")

  echo "[STEP] Synchronisation mot de passe PostgreSQL (env=${APP_ENV})"
  "${compose_cmd[@]}" up -d db >/dev/null

  local attempts=0
  until "${compose_cmd[@]}" exec -T -e PGPASSWORD="$old_password" db \
      pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if (( attempts > 15 )); then
      echo "[ERR] Impossible de joindre le conteneur db pour mettre à jour le mot de passe." >&2
      exit 3
    fi
    sleep 2
  done

  local sql_pass
  sql_pass="$(printf "%s" "$new_password" | sed "s/'/''/g")"
  "${compose_cmd[@]}" exec -T -e PGPASSWORD="$old_password" db \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "ALTER ROLE \"${POSTGRES_USER}\" WITH PASSWORD '${sql_pass}';"
  echo "[OK] Mot de passe PostgreSQL synchronisé."
}

if [[ -n "$NEW_POSTGRES_PASSWORD" ]]; then
  sync_postgres_password "$CURRENT_POSTGRES_PASSWORD" "$NEW_POSTGRES_PASSWORD"
fi

echo "[DONE] $TARGET_FILE mis à jour."
echo "       Pense à définir/mettre à jour manuellement les variables ADMIN_*."
