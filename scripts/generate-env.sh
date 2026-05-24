#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TEMPLATE_FILE="${ENV_TEMPLATE_FILE:-$ROOT_DIR/.env.template}"
DEV_FILE="$ROOT_DIR/.env.dev"
PROD_FILE="$ROOT_DIR/.env.prod"
LOCAL_FILE="$ROOT_DIR/.env.local"
LOCAL_EXAMPLE_FILE="$ROOT_DIR/.env.local.example"

die() {
  echo "[ERREUR] $*" >&2
  exit 1
}

load_template() {
  local file="$1"
  local line key value

  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      ''|\#*)
        continue
        ;;
    esac

    key="${line%%=*}"
    value="${line#*=}"
    key="$(printf '%s' "$key" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    value="$(printf '%s' "$value" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"

    case "$value" in
      \"*\") value="${value#\"}"; value="${value%\"}" ;;
      \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac

    if [[ -n "$key" ]]; then
      printf -v "$key" '%s' "$value"
      export "$key"
    fi
  done < "$file"
}

quote_env_value() {
  local value="$1"
  if [[ "$value" =~ ^[A-Za-z0-9._/-]+$ ]]; then
    printf '%s' "$value"
  else
    local escaped="${value//\\/\\\\}"
    escaped="${escaped//\"/\\\"}"
    printf '"%s"' "$escaped"
  fi
}

ensure_local_key() {
  local key="$1"
  local value="${2:-}"

  if ! grep -q "^${key}=" "$LOCAL_FILE"; then
    printf '%s=%s\n' "$key" "$value" >> "$LOCAL_FILE"
    echo "[INFO] .env.local complété avec ${key}"
  fi
}

[[ -f "$TEMPLATE_FILE" ]] || die ".env.template manquant. Copiez d'abord .env.template.example vers .env.template"

load_template "$TEMPLATE_FILE"

[[ -n "${APP_NAME:-}" ]] || die "APP_NAME manquant dans .env.template"
[[ -n "${APP_SLUG:-}" ]] || die "APP_SLUG manquant dans .env.template"
[[ -n "${APP_DEPOT:-}" ]] || die "APP_DEPOT manquant dans .env.template"
[[ -n "${APP_NO:-}" ]] || die "APP_NO manquant dans .env.template"
[[ "${APP_NO}" =~ ^[0-9]+$ ]] || die "APP_NO doit être un entier positif"

app_no_int=$((10#$APP_NO))
dev_db_port=$((5432 + app_no_int))
dev_vite_port=$((5173 + app_no_int))
dev_api_port=$((8000 + app_no_int + 1))
prod_db_port=$dev_db_port
prod_api_port=$dev_api_port
prod_front_port=$((8079 + app_no_int))

dev_app_host="${DEV_APP_HOST:-localhost}"
prod_app_host="${APP_HOST:-${PROD_APP_HOST:-${APP_SLUG}.mon-site.ca}}"

app_name_rendered="$(quote_env_value "$APP_NAME")"

cat > "$DEV_FILE" <<EOF
# ============================
# Base invariants DEV
# ============================
APP_ENV=dev
APP_SLUG=${APP_SLUG}
APP_NAME=${app_name_rendered}
APP_DEPOT=${APP_DEPOT}
APP_NO=${APP_NO}
APP_HOST=${dev_app_host}

# ============================
# Ports hôte (dérivés de APP_NO)
# ============================
DEV_DB_PORT=${dev_db_port}      # 5432 + N
DEV_API_PORT=${dev_api_port}     # 8000 + (N + 1)
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

cat > "$PROD_FILE" <<EOF
# ============================
# Base invariants PROD
# ============================
APP_ENV=prod
APP_SLUG=${APP_SLUG}
APP_NAME=${app_name_rendered}
APP_DEPOT=${APP_DEPOT}
APP_NO=${APP_NO}
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

if [[ ! -f "$LOCAL_FILE" ]]; then
  if [[ -f "$LOCAL_EXAMPLE_FILE" ]]; then
    cp "$LOCAL_EXAMPLE_FILE" "$LOCAL_FILE"
    echo "[OK] .env.local créé depuis .env.local.example"
  else
    cat > "$LOCAL_FILE" <<EOF
ADMIN_USERNAME=
ADMIN_EMAIL=
ADMIN_PASSWORD=
POSTGRES_PASSWORD=
DJANGO_SECRET_KEY=
EOF
    echo "[OK] .env.local créé"
  fi
fi

ensure_local_key "ADMIN_USERNAME" "${ADMIN_USERNAME:-}"
ensure_local_key "ADMIN_EMAIL" "${ADMIN_EMAIL:-}"
ensure_local_key "ADMIN_PASSWORD" "${ADMIN_PASSWORD:-}"
ensure_local_key "POSTGRES_PASSWORD"
ensure_local_key "DJANGO_SECRET_KEY"

echo "[OK] Fichiers générés :"
echo " - $DEV_FILE"
echo " - $PROD_FILE"
