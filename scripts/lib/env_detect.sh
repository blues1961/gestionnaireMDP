# shellcheck shell=bash
# Utilitaire commun pour détecter l'env via .env et fournir un wrapper docker compose: dc
set -euo pipefail

# Lire une variable depuis $ENV_FILE sans sourcer (évite d'exporter des secrets sur l'hôte)
read_env() {
  # usage: read_env KEY
  awk -F= -v key="$1" '
    $0 ~ "^[[:space:]]*"key"[[:space:]]*=" {
      sub(/^[[:space:]]*[^=]+[[:space:]]*=[[:space:]]*/, "", $0);  # retire "KEY ="
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0);                 # trim
      gsub(/^"|"$/, "", $0);                                       # retire quotes "
      print $0
    }' "$ENV_FILE" | tail -n1
}

env_detect_init() {
  # ENV_FILE peut être surchargé par l'appelant, sinon .env
  ENV_FILE="${ENV_FILE:-.env}"
  if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not found. Create: ln -sf .env.dev .env  (or .env.prod)" >&2
    exit 2
  fi

  APP_ENV="$(read_env APP_ENV || true)"
  if [ -z "${APP_ENV:-}" ]; then
    echo "ERROR: APP_ENV not defined in $ENV_FILE (expected dev|prod)" >&2
    exit 2
  fi

  # COMPOSE_FILE peut être surchargé; sinon, choix auto par APP_ENV
  if [ "${COMPOSE_FILE:-}" = "" ]; then
    case "$APP_ENV" in
      dev)  COMPOSE_FILE="docker-compose.dev.yml"  ;;
      prod) COMPOSE_FILE="docker-compose.prod.yml" ;;
      *)    echo "ERROR: Unknown APP_ENV='$APP_ENV' (expected dev|prod)" >&2; exit 2 ;;
    esac
  fi

  # Valide tôt la combo env/compose
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null
}

# Wrapper pratique pour éviter de répéter les flags
dc() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}
