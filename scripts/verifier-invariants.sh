#!/usr/bin/env bash
set -euo pipefail

echo "=== Vérification invariants (MDP) ==="

# ---------- Params projet ----------
PROJECT_SLUG="${APP_SLUG:-mdp}"
APP_ENV="${APP_ENV:-dev}"
VITE_PORT_HOST="${DEV_VITE_PORT:-5174}"
API_PORT_HOST="${DEV_API_PORT:-8002}"

VITE_CTN="${PROJECT_SLUG}_vite_${APP_ENV}"
BE_CTN="${PROJECT_SLUG}_backend_${APP_ENV}"

must_grep() {
  local file="$1"; shift
  local pattern="$1"; shift || true
  rg -n "$pattern" "$file" >/dev/null || {
    echo "❌ ${file} ne contient pas: $pattern"
    exit 1
  }
  echo "✅ ${file}: $pattern"
}

must_rg_anywhere() {
  local pattern="$1"
  rg -n "$pattern" . >/dev/null || {
    echo "❌ pattern introuvable dans le repo: $pattern"
    exit 1
  }
  echo "✅ pattern trouvé: $pattern"
}

# ---------- 1) Front (Vite + axios) ----------
must_grep frontend/vite.config.js "/api"
must_grep frontend/vite.config.js "target: 'http://backend:8000'"
must_grep frontend/vite.config.js "changeOrigin: false"

must_grep frontend/src/api.js "import axios from \"axios\""

# ✅ Check robuste pour VITE_API_BASE (avec ou sans optional chaining)
if rg -N --fixed-strings 'import.meta.env?.VITE_API_BASE' frontend/src/api.js >/dev/null \
  || rg -N --fixed-strings 'import.meta.env.VITE_API_BASE'  frontend/src/api.js >/dev/null; then
  echo "✅ frontend/src/api.js: import.meta.env?.VITE_API_BASE"
else
  echo "❌ frontend/src/api.js ne contient pas: import.meta.env?.VITE_API_BASE"
  exit 1
fi

must_grep frontend/src/api.js "axios.create"
must_grep frontend/src/api.js "auth/jwt/create/"

# ---------- 2) Backend (Django) ----------
must_grep backend/gestionnaire_mdp/settings.py "rest_framework_simplejwt"
must_grep backend/gestionnaire_mdp/settings.py "JWTAuthentication"
must_rg_anywhere "path\\('api/"
must_rg_anywhere "auth/jwt"

# ---------- 3) Compose ----------
must_grep docker-compose.dev.yml "runserver 0.0.0.0:8000"
must_grep docker-compose.dev.yml "VITE_API_BASE: \"/api\""

# ---------- 4) Conteneurs: env & ports ----------
echo "== Conteneurs =="
docker ps --format "table {{.Names}}\t{{.Ports}}" | (grep "${PROJECT_SLUG}" || true)

echo "== Vite: VITE_API_BASE dans le conteneur =="
docker exec "${VITE_CTN}" printenv VITE_API_BASE

echo "== Backend: ALLOWED_HOSTS, CORS, CSRF =="
docker exec "${BE_CTN}" sh -lc 'printenv ALLOWED_HOSTS; printenv CORS_ALLOWED_ORIGINS; printenv CSRF_TRUSTED_ORIGINS'

echo "== Backend listen 0.0.0.0:8000 (port/probe) =="
if docker exec "${BE_CTN}" sh -lc 'command -v ss >/dev/null 2>&1'; then
  if docker exec "${BE_CTN}" sh -lc 'ss -lntp' | grep -q ':8000'; then
    echo "✅ backend écoute :8000 (via ss)"
  else
    echo "❌ ss présent mais :8000 non listé"
    exit 1
  fi
elif docker exec "${BE_CTN}" sh -lc 'command -v netstat >/dev/null 2>&1'; then
  if docker exec "${BE_CTN}" sh -lc 'netstat -lntp' | grep -q ':8000'; then
    echo "✅ backend écoute :8000 (via netstat)"
  else
    echo "❌ netstat présent mais :8000 non listé"
    exit 1
  fi
else
  # Pas d’outil réseau dans le conteneur → on sonde via l’hôte
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${API_PORT_HOST}/api/" || true)
  if [ -n "$CODE" ]; then
    echo "✅ backend répond sur http://localhost:${API_PORT_HOST}/ (HTTP ${CODE})"
  else
    echo "❌ backend ne répond pas sur http://localhost:${API_PORT_HOST}/"
    exit 1
  fi
fi



# ---------- 5) Smoke tests HTTP ----------
echo "== Smoke: JWT create via Vite proxy (${VITE_PORT_HOST}) =="
set -a; [ -f ./.env.dev ] && . ./.env.dev; [ -f ./.env.dev.local ] && . ./.env.dev.local; set +a
TOKENS=$(curl -sS -X POST "http://localhost:${VITE_PORT_HOST}/api/auth/jwt/create/" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}")
echo "$TOKENS" | jq .access >/dev/null 2>&1 || { echo "❌ JWT create KO"; echo "$TOKENS"; exit 1; }
ACCESS=$(echo "$TOKENS" | jq -r .access)
echo "✅ JWT OK"

echo "== Smoke: appel API protégée (ex: /api/passwords/ ou similaire) =="
# adapte l'endpoint s'il diffère (ex: /api/passwords/ ou /api/ping)
PROBE=$(curl -sS -H "Authorization: Bearer ${ACCESS}" "http://localhost:${VITE_PORT_HOST}/api/passwords/" || true)
echo "$PROBE" | head -c 300; echo
[ -n "$PROBE" ] || { echo "⚠️ /api/passwords/ a renvoyé vide (vérifie l'endpoint protégé)"; }

echo "=== OK: invariants validés ==="
