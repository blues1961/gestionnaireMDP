#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET_ENV="prod"
ROLE="app"
USERNAME=""
EMAIL=""
PASSWORD=""
GENERATE_PASSWORD=0
SHOW_PASSWORD=0
APPLY=0

usage() {
  cat <<'EOF'
Usage: manage-django-account.sh [options]

Options:
  --env dev|prod           Target environment (default: prod)
  --role app|admin|api     Account role (default: app)
  --username USER          Username (required)
  --email EMAIL            Email (optional)
  --password PASS          Password value
  --generate-password      Generate strong random password
  --show-password          Print password in output (careful)
  --apply                  Apply changes (default: dry-run)
  -h, --help               Show help

Role behavior:
- app: non-staff, non-superuser (usage quotidien)
- admin: staff + superuser (admin Django)
- api: non-staff, non-superuser + update API_AUTH_* in .env.<env>.local
EOF
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[ERR] Commande manquante: $1" >&2
    exit 2
  }
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      TARGET_ENV="${2:-}"
      shift 2
      ;;
    --role)
      ROLE="${2:-}"
      shift 2
      ;;
    --username)
      USERNAME="${2:-}"
      shift 2
      ;;
    --email)
      EMAIL="${2:-}"
      shift 2
      ;;
    --password)
      PASSWORD="${2:-}"
      shift 2
      ;;
    --generate-password)
      GENERATE_PASSWORD=1
      shift
      ;;
    --show-password)
      SHOW_PASSWORD=1
      shift
      ;;
    --apply)
      APPLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERR] Option inconnue: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ ! "$TARGET_ENV" =~ ^(dev|prod)$ ]]; then
  echo "[ERR] --env invalide: '$TARGET_ENV' (attendu: dev|prod)" >&2
  exit 2
fi
if [[ ! "$ROLE" =~ ^(app|admin|api)$ ]]; then
  echo "[ERR] --role invalide: '$ROLE' (attendu: app|admin|api)" >&2
  exit 2
fi
if [[ -z "$USERNAME" ]]; then
  echo "[ERR] --username est requis." >&2
  exit 2
fi

if [[ "$GENERATE_PASSWORD" -eq 1 ]]; then
  need_cmd openssl
  PASSWORD="$(openssl rand -base64 32 | tr -d '\n' | tr '+/' '-_' | tr -d '=')"
fi

if [[ "$APPLY" -eq 1 && -z "$PASSWORD" ]]; then
  echo "[ERR] En mode --apply, fournir --password ou --generate-password." >&2
  exit 2
fi

IS_STAFF="False"
IS_SUPERUSER="False"
if [[ "$ROLE" == "admin" ]]; then
  IS_STAFF="True"
  IS_SUPERUSER="True"
fi

LOCAL_FILE="$ROOT_DIR/.env.${TARGET_ENV}.local"
COMPOSE_FILE="$ROOT_DIR/docker-compose.${TARGET_ENV}.yml"
if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[ERR] Fichier introuvable: $COMPOSE_FILE" >&2
  exit 2
fi

echo "[PLAN] Manage Django account"
echo "       env=${TARGET_ENV} role=${ROLE} username=${USERNAME}"
if [[ -n "$EMAIL" ]]; then
  echo "       email=${EMAIL}"
fi
echo "       staff=${IS_STAFF} superuser=${IS_SUPERUSER}"
if [[ "$PASSWORD" == "" ]]; then
  echo "       password=(unchanged - dry-run only)"
elif [[ "$SHOW_PASSWORD" -eq 1 ]]; then
  echo "       password=${PASSWORD}"
else
  echo "       password=(set)"
fi
if [[ "$ROLE" == "api" ]]; then
  echo "       will update API_AUTH_USERNAME/API_AUTH_PASSWORD in .env.${TARGET_ENV}.local"
fi

if [[ "$APPLY" -ne 1 ]]; then
  echo "[DRY-RUN] Aucun changement appliqué. Ajouter --apply pour exécuter."
  exit 0
fi

need_cmd docker
need_cmd awk

COMPOSE=(docker compose --env-file ".env.${TARGET_ENV}" -f "docker-compose.${TARGET_ENV}.yml")

"${COMPOSE[@]}" exec -T \
  -e ACCOUNT_USERNAME="$USERNAME" \
  -e ACCOUNT_EMAIL="$EMAIL" \
  -e ACCOUNT_PASSWORD="$PASSWORD" \
  -e ACCOUNT_IS_STAFF="$IS_STAFF" \
  -e ACCOUNT_IS_SUPERUSER="$IS_SUPERUSER" \
  backend python manage.py shell -c 'import os; from django.contrib.auth import get_user_model; U=get_user_model(); u, _ = U.objects.get_or_create(username=os.environ["ACCOUNT_USERNAME"]); u.email=os.environ.get("ACCOUNT_EMAIL",""); u.is_staff=(os.environ.get("ACCOUNT_IS_STAFF","False")=="True"); u.is_superuser=(os.environ.get("ACCOUNT_IS_SUPERUSER","False")=="True"); u.is_active=True; u.set_password(os.environ["ACCOUNT_PASSWORD"]); u.save(); print("updated:", u.username, "staff=",u.is_staff, "superuser=",u.is_superuser)'

if [[ "$ROLE" == "api" ]]; then
  mkdir -p "$(dirname "$LOCAL_FILE")"
  if [[ ! -f "$LOCAL_FILE" ]]; then
    touch "$LOCAL_FILE"
  fi

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

  upsert_env_var "$LOCAL_FILE" "API_AUTH_USERNAME" "$USERNAME"
  upsert_env_var "$LOCAL_FILE" "API_AUTH_PASSWORD" "$PASSWORD"
  chmod 600 "$LOCAL_FILE" || true
  echo "[OK] API_AUTH_* mis à jour dans $LOCAL_FILE"
fi

echo "[DONE] Compte '${USERNAME}' géré avec succès."
