#!/usr/bin/env bash
set -euo pipefail

log()  { echo -e "\033[1;34m→ $1\033[0m"; }
ok()   { echo -e "\033[1;32m✔ $1\033[0m"; }
err()  { echo -e "\033[1;31m✖ $1\033[0m"; exit 1; }

[ -f ".env.template" ] || err ".env.template introuvable. Copie d'abord .env.template.example vers .env.template"
[ -L ".env" ] || err ".env doit être un lien symbolique vers .env.dev ou .env.prod. Utilise make dev ou make prod avant make init"

log "Génération des fichiers d'environnement"
./scripts/generate-env.sh
ok ".env.dev, .env.prod et .env.local prêts"

log "Vérification des invariants"
./scripts/check-invariants.sh
ok "Invariants validés"

set -a
. .env
set +a

COMPOSE_FILE="docker-compose.${APP_ENV}.yml"
[ -f "$COMPOSE_FILE" ] || err "$COMPOSE_FILE introuvable"

EXPECTED_SERVICES="$(docker compose --env-file .env --env-file .env.local -f "$COMPOSE_FILE" config --services | sed '/^$/d')"
RUNNING_SERVICES="$(docker compose --env-file .env --env-file .env.local -f "$COMPOSE_FILE" ps --services --filter status=running 2>/dev/null | sed '/^$/d' || true)"

services_missing=0
while IFS= read -r service; do
  [ -n "$service" ] || continue
  if ! printf '%s\n' "$RUNNING_SERVICES" | grep -Fxq "$service"; then
    services_missing=1
    break
  fi
done <<< "$EXPECTED_SERVICES"

if [ "$services_missing" -eq 1 ]; then
  log "Démarrage des services manquants ou arrêtés"
  ./scripts/up.sh
else
  ok "Services déjà actifs, aucun redémarrage forcé"
fi

log "Statut des conteneurs"
./scripts/ps.sh

ok "Initialisation terminée"
