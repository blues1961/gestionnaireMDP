#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_FILE="${ROOT_DIR}/.env.dev"
PROD_FILE="${ROOT_DIR}/.env.prod"
FORCE="${FORCE:-0}"

die() {
  echo "[ERREUR] $*" >&2
  exit 1
}

prompt_required() {
  local __var_name="$1"
  local __label="$2"
  local __default="$3"
  local __value=""

  while true; do
    if [[ -t 0 ]]; then
      read -r -p "${__label} [${__default}]: " __value || true
    else
      echo "${__label}=${__default}"
      __value="$__default"
    fi
    __value="${__value:-$__default}"
    if [[ -n "$__value" ]]; then
      printf -v "$__var_name" "%s" "$__value"
      break
    fi
    echo "La valeur « ${__label} » ne peut pas être vide." >&2
  done
}

prompt_int() {
  local __var_name="$1"
  local __label="$2"
  local __default="$3"
  local __value=""

  while true; do
    if [[ -t 0 ]]; then
      read -r -p "${__label} [${__default}]: " __value || true
    else
      echo "${__label}=${__default}"
      __value="$__default"
    fi
    __value="${__value:-$__default}"
    if [[ "$__value" =~ ^[0-9]+$ ]]; then
      printf -v "$__var_name" "%s" "$__value"
      break
    fi
    echo "La valeur « ${__label} » doit être un entier positif." >&2
  done
}

quote_env_value() {
  local value="$1"
  if [[ "$value" =~ ^[A-Za-z0-9._-]+$ ]]; then
    printf '%s' "$value"
  else
    local escaped="${value//\\/\\\\}"
    escaped="${escaped//\"/\\\"}"
    printf '"%s"' "$escaped"
  fi
}

existing=()
[[ -f "$DEV_FILE" ]] && existing+=(".env.dev")
[[ -f "$PROD_FILE" ]] && existing+=(".env.prod")
if ((${#existing[@]} > 0)) && [[ "$FORCE" != "1" ]]; then
  die "Fichiers déjà présents (${existing[*]}). Relancez avec FORCE=1 pour les régénérer."
fi

prompt_required app_slug "APP_SLUG" "${APP_SLUG:-mdp}"
prompt_required app_name "APP_NAME" "${APP_NAME:-Gestionnaire MDP}"
prompt_required app_depot "APP_DEPOT" "${APP_DEPOT:-gestionnaireMDP}"
prompt_int app_no "APP_NO" "${APP_NO:-1}"

slug_lower="$(echo "$app_slug" | tr '[:upper:]' '[:lower:]')"
default_prod_host="${PROD_APP_HOST:-${slug_lower}.mon-site.ca}"
prompt_required prod_app_host "APP_HOST (prod)" "$default_prod_host"
dev_app_host="${DEV_APP_HOST:-localhost}"

app_no_int=$((10#$app_no))
dev_db_port=$((5432 + app_no_int))
dev_api_port=$((8001 + app_no_int))
dev_vite_port=$((5173 + app_no_int))
prod_db_port=$((5432 + app_no_int))
prod_api_port=$((8001 + app_no_int))
prod_front_port=$((8079 + app_no_int))

app_name_rendered="$(quote_env_value "$app_name")"

cat >"$DEV_FILE" <<EOF
# ============================
# Base invariants DEV
# ============================
APP_ENV=dev
APP_SLUG=${app_slug}
APP_NAME=${app_name_rendered}
APP_DEPOT=${app_depot}
APP_NO=${app_no}
APP_HOST=${dev_app_host}

# ============================
# Ports hôte (dérivés de APP_NO)
# ============================
DEV_DB_PORT=${dev_db_port}      # 5432 + N
DEV_API_PORT=${dev_api_port}     # 8001 + N
DEV_VITE_PORT=${dev_vite_port}    # 5173 + N

# ============================
# PostgreSQL (conteneur db)
# ============================
POSTGRES_DB=\${APP_SLUG}_pg_db
POSTGRES_USER=\${APP_SLUG}_pg_user
POSTGRES_HOST=db
POSTGRES_PORT=5432

# ============================
# Backend Django
# ============================
DJANGO_DEBUG=1
ALLOWED_HOSTS=\${APP_HOST},localhost,127.0.0.1,backend,frontend,vite
FRONT_ORIGIN=http://\${APP_HOST}:\${DEV_VITE_PORT}

# ============================
# Frontend Vite
# ============================
VITE_API_BASE=/api

# ============================
# Secrets dans .env.local (non versionné)
# ============================
# POSTGRES_PASSWORD=***
# DJANGO_SECRET_KEY=***
# ADMIN_USERNAME=***
# ADMIN_PASSWORD=***
# ADMIN_EMAIL=***
EOF

cat >"$PROD_FILE" <<EOF
# ============================
# Base invariants PROD
# ============================
APP_ENV=prod
APP_SLUG=${app_slug}
APP_NAME=${app_name_rendered}
APP_DEPOT=${app_depot}
APP_NO=${app_no}
APP_HOST=${prod_app_host}

# ============================
# Ports hôte PROD (debug/local)
# ============================
PROD_DB_PORT=${prod_db_port}
PROD_API_PORT=${prod_api_port}
PROD_FRONT_PORT=${prod_front_port}

# ============================
# PostgreSQL (service db)
# ============================
POSTGRES_DB=\${APP_SLUG}_pg_db
POSTGRES_USER=\${APP_SLUG}_pg_user
POSTGRES_HOST=db
POSTGRES_PORT=5432

# ============================
# Backend Django
# ============================
DJANGO_DEBUG=0
ALLOWED_HOSTS=\${APP_HOST}
FRONT_ORIGIN=https://\${APP_HOST}
CORS_ALLOWED_ORIGINS=\${FRONT_ORIGIN}
CSRF_TRUSTED_ORIGINS=\${FRONT_ORIGIN}

# ============================
# Frontend Vite
# ============================
VITE_API_BASE=/api

# ============================
# Secrets dans .env.local (non versionné)
# ============================
# POSTGRES_PASSWORD=***
# DJANGO_SECRET_KEY=***
# ADMIN_USERNAME=***
# ADMIN_PASSWORD=***
# ADMIN_EMAIL=***
EOF

chmod 600 "$DEV_FILE" "$PROD_FILE" >/dev/null 2>&1 || true

echo "[OK] Fichiers générés :"
echo " - $DEV_FILE"
echo " - $PROD_FILE"
echo
echo "💡 Ajoutez/ajustez les secrets réels dans .env.local (non versionné)."
