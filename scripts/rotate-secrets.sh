#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET_ENV="prod"
APPLY=0
BACKUP_DB=1
SHOW_VALUES=0
ADMIN_USERNAME_OVERRIDE=""
ADMIN_EMAIL_OVERRIDE=""
ROTATE_ADMIN_PASSWORD=0
ADMIN_PASSWORD_OVERRIDE=""

usage() {
  cat <<'EOF'
Usage: rotate-secrets.sh [options]

Options:
  --env dev|prod             Target environment (default: prod)
  --apply                    Apply changes (default: dry-run)
  --no-db-backup             Skip DB backup before rotation
  --show-values              Print generated values (use with caution)
  --admin-username USER      Override ADMIN_USERNAME
  --admin-email EMAIL        Override ADMIN_EMAIL
  --rotate-admin-password    Also rotate ADMIN_PASSWORD (disabled by default)
  --admin-password PASS      Use this admin password (with --rotate-admin-password)
  -h, --help                 Show this help

Default rotation:
- POSTGRES_PASSWORD
- DJANGO_SECRET_KEY

By default, ADMIN_PASSWORD is NOT changed.
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
    --apply)
      APPLY=1
      shift
      ;;
    --no-db-backup)
      BACKUP_DB=0
      shift
      ;;
    --show-values)
      SHOW_VALUES=1
      shift
      ;;
    --admin-username)
      ADMIN_USERNAME_OVERRIDE="${2:-}"
      shift 2
      ;;
    --admin-email)
      ADMIN_EMAIL_OVERRIDE="${2:-}"
      shift 2
      ;;
    --rotate-admin-password)
      ROTATE_ADMIN_PASSWORD=1
      shift
      ;;
    --admin-password)
      ADMIN_PASSWORD_OVERRIDE="${2:-}"
      shift 2
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

ENV_FILE="$ROOT_DIR/.env.${TARGET_ENV}"
LOCAL_FILE="$ROOT_DIR/.env.${TARGET_ENV}.local"
COMPOSE_FILE="$ROOT_DIR/docker-compose.${TARGET_ENV}.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[ERR] Fichier introuvable: $ENV_FILE" >&2
  exit 2
fi
if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[ERR] Fichier introuvable: $COMPOSE_FILE" >&2
  exit 2
fi

need_cmd openssl
need_cmd awk
need_cmd sed
need_cmd date

set -a
# shellcheck source=/dev/null
. "$ENV_FILE"
set +a
if [[ -f "$LOCAL_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$LOCAL_FILE"
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER manquant dans $ENV_FILE}"
: "${POSTGRES_DB:?POSTGRES_DB manquant dans $ENV_FILE}"

CURRENT_POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
ADMIN_USERNAME="${ADMIN_USERNAME_OVERRIDE:-${ADMIN_USERNAME:-admin}}"
ADMIN_EMAIL="${ADMIN_EMAIL_OVERRIDE:-${ADMIN_EMAIL:-admin@example.com}}"

gen_secret() {
  local bytes="${1:-48}"
  openssl rand -base64 "$bytes" | tr -d '\n' | tr '+/' '-_' | tr -d '='
}

NEW_POSTGRES_PASSWORD="$(gen_secret 36)"
NEW_DJANGO_SECRET_KEY="$(gen_secret 72)"
NEW_ADMIN_PASSWORD="${ADMIN_PASSWORD_OVERRIDE:-}"
if [[ "$ROTATE_ADMIN_PASSWORD" -eq 1 && -z "$NEW_ADMIN_PASSWORD" ]]; then
  NEW_ADMIN_PASSWORD="$(gen_secret 36)"
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
ENV_BACKUP_FILE="${LOCAL_FILE}.bak.${STAMP}"
DB_BACKUP_FILE="$ROOT_DIR/backups/${APP_SLUG:-mdp}_db-${TARGET_ENV}-${STAMP}.sql.gz"

echo "[PLAN] Rotation des secrets pour env=${TARGET_ENV}"
echo "       - POSTGRES_PASSWORD (rotate)"
echo "       - DJANGO_SECRET_KEY (rotate)"
if [[ "$ROTATE_ADMIN_PASSWORD" -eq 1 ]]; then
  echo "       - ADMIN_PASSWORD (rotate)"
else
  echo "       - ADMIN_PASSWORD (unchanged)"
fi
echo "       - ADMIN_USERNAME=${ADMIN_USERNAME} (conservé/forcé)"
echo "       - ADMIN_EMAIL=${ADMIN_EMAIL} (conservé/forcé)"
echo "       - Backup env local: ${ENV_BACKUP_FILE}"
if [[ "$BACKUP_DB" -eq 1 ]]; then
  echo "       - Backup DB: ${DB_BACKUP_FILE}"
else
  echo "       - Backup DB: SKIPPED (--no-db-backup)"
fi

if [[ "$SHOW_VALUES" -eq 1 ]]; then
  echo
  echo "[SECRETS GENERATED]"
  echo "POSTGRES_PASSWORD=${NEW_POSTGRES_PASSWORD}"
  echo "DJANGO_SECRET_KEY=${NEW_DJANGO_SECRET_KEY}"
  if [[ "$ROTATE_ADMIN_PASSWORD" -eq 1 ]]; then
    echo "ADMIN_PASSWORD=${NEW_ADMIN_PASSWORD}"
  fi
fi

if [[ "$APPLY" -ne 1 ]]; then
  echo
  echo "[DRY-RUN] Aucun changement appliqué."
  echo "          Relancer avec --apply pour exécuter."
  exit 0
fi

need_cmd docker
need_cmd gzip

COMPOSE=(docker compose --env-file ".env.${TARGET_ENV}" -f "docker-compose.${TARGET_ENV}.yml")

mkdir -p "$ROOT_DIR/backups"

if [[ "$BACKUP_DB" -eq 1 ]]; then
  echo "[STEP] Backup DB en cours..."
  if [[ -n "$CURRENT_POSTGRES_PASSWORD" ]]; then
    "${COMPOSE[@]}" exec -T -e PGPASSWORD="$CURRENT_POSTGRES_PASSWORD" db \
      pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$DB_BACKUP_FILE"
  else
    "${COMPOSE[@]}" exec -T db \
      pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$DB_BACKUP_FILE"
  fi
  if [[ ! -s "$DB_BACKUP_FILE" ]]; then
    echo "[ERR] Backup DB vide: $DB_BACKUP_FILE" >&2
    exit 3
  fi
  echo "[OK] Backup DB: $DB_BACKUP_FILE"
fi

if [[ -f "$LOCAL_FILE" ]]; then
  cp "$LOCAL_FILE" "$ENV_BACKUP_FILE"
  chmod 600 "$ENV_BACKUP_FILE" || true
else
  touch "$LOCAL_FILE"
  chmod 600 "$LOCAL_FILE" || true
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

echo "[STEP] Rotation mot de passe PostgreSQL (ALTER ROLE)..."
SQL_PASS="$(printf "%s" "$NEW_POSTGRES_PASSWORD" | sed "s/'/''/g")"
"${COMPOSE[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "ALTER ROLE \"$POSTGRES_USER\" WITH PASSWORD '${SQL_PASS}';"
echo "[OK] Mot de passe PostgreSQL mis à jour dans la DB."

echo "[STEP] Mise à jour ${LOCAL_FILE}..."
upsert_env_var "$LOCAL_FILE" "POSTGRES_PASSWORD" "$NEW_POSTGRES_PASSWORD"
upsert_env_var "$LOCAL_FILE" "DJANGO_SECRET_KEY" "$NEW_DJANGO_SECRET_KEY"
upsert_env_var "$LOCAL_FILE" "ADMIN_USERNAME" "$ADMIN_USERNAME"
upsert_env_var "$LOCAL_FILE" "ADMIN_EMAIL" "$ADMIN_EMAIL"
if [[ "$ROTATE_ADMIN_PASSWORD" -eq 1 ]]; then
  upsert_env_var "$LOCAL_FILE" "ADMIN_PASSWORD" "$NEW_ADMIN_PASSWORD"
fi
chmod 600 "$LOCAL_FILE" || true
echo "[OK] Fichier d'env local mis à jour."

echo "[STEP] Redémarrage backend avec les nouveaux secrets..."
"${COMPOSE[@]}" up -d --no-deps --force-recreate backend
"${COMPOSE[@]}" exec -T backend python manage.py check >/dev/null
echo "[OK] Backend redémarré et check Django OK."

if [[ "$ROTATE_ADMIN_PASSWORD" -eq 1 ]]; then
  echo "[STEP] Rotation mot de passe admin Django..."
  "${COMPOSE[@]}" exec -T \
    -e ROTATE_ADMIN_USERNAME="$ADMIN_USERNAME" \
    -e ROTATE_ADMIN_EMAIL="$ADMIN_EMAIL" \
    -e ROTATE_ADMIN_PASSWORD="$NEW_ADMIN_PASSWORD" \
    backend python manage.py shell -c 'import os; from django.contrib.auth import get_user_model; U=get_user_model(); u, _ = U.objects.get_or_create(username=os.environ["ROTATE_ADMIN_USERNAME"], defaults={"email": os.environ.get("ROTATE_ADMIN_EMAIL", "")}); u.email=os.environ.get("ROTATE_ADMIN_EMAIL", ""); u.is_staff=True; u.is_superuser=True; u.set_password(os.environ["ROTATE_ADMIN_PASSWORD"]); u.save(); print("admin updated:", u.username)'
  echo "[OK] Mot de passe admin Django mis à jour."
fi

echo
echo "[DONE] Rotation terminée sans suppression de données."
echo "       Backup env: ${ENV_BACKUP_FILE}"
if [[ "$BACKUP_DB" -eq 1 ]]; then
  echo "       Backup DB : ${DB_BACKUP_FILE}"
fi
if [[ "$ROTATE_ADMIN_PASSWORD" -eq 0 ]]; then
  echo "       ADMIN_PASSWORD non modifié (comportement par défaut)."
fi
echo "       Pense à lancer: make push-secret-single SECRET_ENV=${TARGET_ENV}"
