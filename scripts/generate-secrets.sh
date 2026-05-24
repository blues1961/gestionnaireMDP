#!/usr/bin/env bash
set -euo pipefail

ENV_LOCAL=".env.local"
ENV_TEMPLATE=".env.template"

[ -f "$ENV_TEMPLATE" ] || {
  echo "ERREUR: .env.template est absent." >&2
  echo "Copiez d'abord .env.template.example :" >&2
  echo "  cp .env.template.example .env.template" >&2
  exit 1
}

[ -f "$ENV_LOCAL" ] || {
  echo "ERREUR: .env.local introuvable." >&2
  echo "Créer d'abord le fichier avec :" >&2
  echo "  ./scripts/generate-env.sh" >&2
  exit 1
}

generate_secret() {
  openssl rand -base64 48 | tr -d '\n'
}

read_template_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$ENV_TEMPLATE" | tail -n 1
}

normalize_app_depot() {
  local depot="$1"
  printf '%s' "$depot" | tr '[:lower:]' '[:upper:]' | sed 's/[^A-Z0-9]/_/g'
}

set_value_if_empty() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=$" "$ENV_LOCAL"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_LOCAL"
  elif ! grep -q "^${key}=" "$ENV_LOCAL"; then
    echo "${key}=${value}" >> "$ENV_LOCAL"
  fi
}

APP_DEPOT="$(read_template_value APP_DEPOT)"
[ -n "$APP_DEPOT" ] || {
  echo "ERREUR: APP_DEPOT est absent de .env.template." >&2
  exit 1
}

LOCAL_API_TOKEN_KEY="$(normalize_app_depot "$APP_DEPOT")_API_TOKEN"

set_value_if_empty "POSTGRES_PASSWORD" "$(generate_secret)"
set_value_if_empty "DJANGO_SECRET_KEY" "$(generate_secret)"
set_value_if_empty "$LOCAL_API_TOKEN_KEY" "$(generate_secret)"

echo "Secrets générés dans .env.local"
echo "Vérifie ensuite ADMIN_USERNAME, ADMIN_EMAIL et ADMIN_PASSWORD."
echo "Le token local ${LOCAL_API_TOKEN_KEY} a été généré si nécessaire."
