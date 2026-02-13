set -euo pipefail

detect_env() {
  [[ -n "${ENV:-}" ]] && { echo "$ENV"; return; }
  [[ -L .env && "$(readlink .env)" =~ \.env\.(dev|prod)$ ]] && { echo "${BASH_REMATCH[1]}"; return; }
  [[ -f .ops/current_env ]] && { e="$(cat .ops/current_env)"; [[ "$e" =~ ^(dev|prod)$ ]] && { echo "$e"; return; }; }
  g="$(git config --local --get ops.env || true)"; [[ "$g" =~ ^(dev|prod)$ ]] && { echo "$g"; return; }
  echo dev
}

load_env() {
  local ENV_ACTIVE; ENV_ACTIVE="$(detect_env)"
  set -a
  . ".env.${ENV_ACTIVE}"
  if [ -f ".env.local" ]; then
    . ".env.local"
  fi
  set +a
}

compose() {
  local ENV_ACTIVE; ENV_ACTIVE="$(detect_env)"
  local FILE="docker-compose.${ENV_ACTIVE}.yml"
  [ -f "$FILE" ] || FILE="docker-compose.dev.yml"
  load_env
  docker compose -f "$FILE" --env-file ".env.${ENV_ACTIVE}" "$@"
}
