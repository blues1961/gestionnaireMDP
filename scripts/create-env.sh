#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_FILE="${ROOT_DIR}/.env.template"
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
[[ -f "$TEMPLATE_FILE" ]] && existing+=(".env.template")
if ((${#existing[@]} > 0)) && [[ "$FORCE" != "1" ]]; then
  die "Fichiers déjà présents (${existing[*]}). Relancez avec FORCE=1 pour les régénérer."
fi

prompt_required app_slug "APP_SLUG" "${APP_SLUG:-mdp}"
prompt_required app_name "APP_NAME" "${APP_NAME:-Gestionnaire MDP}"
prompt_required app_depot "APP_DEPOT" "${APP_DEPOT:-gestionnaireMDP}"
prompt_int app_no "APP_NO" "${APP_NO:-1}"

app_name_rendered="$(quote_env_value "$app_name")"

cat >"$TEMPLATE_FILE" <<EOF
APP_NAME=${app_name_rendered}
APP_SLUG=${app_slug}
APP_DEPOT=${app_depot}
APP_NO=${app_no}
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_EMAIL=
EOF

chmod 600 "$TEMPLATE_FILE" >/dev/null 2>&1 || true

echo "[OK] Template généré :"
echo " - $TEMPLATE_FILE"
echo
echo "💡 Complétez si nécessaire .env.template, puis régénérez les environnements."

"${ROOT_DIR}/scripts/generate-env.sh"
