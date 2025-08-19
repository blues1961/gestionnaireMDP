#!/usr/bin/env bash
set -euo pipefail


# --- Configurable via variables d'environnement ---
HOST="${HOST:-linode-ca}" # alias SSH ou user@host
REMOTE_TMP="${REMOTE_TMP:-/tmp/app-mon-site.ca-dist}" # répertoire tampon côté serveur
REMOTE_DEST="${REMOTE_DEST:-/var/www/app.mon-site.ca}" # destination finale côté serveur
FRONT_DIR="${FRONT_DIR:-frontend}" # dossier du frontend dans le repo
API_BASE="${VITE_API_BASE:-/api}" # base des endpoints côté client


say() { printf "
␛
[1;34m[deploy]
␛
[0m %s
" "$*"; }
fail() { printf "
␛
[1;31m[error]
␛
[0m %s
" "$*" >&2; exit 1; }


command -v npm >/dev/null || fail "npm n'est pas installé sur ce poste."


# 1) Build frontend
say "Build du frontend avec VITE_API_BASE=${API_BASE}"
pushd "${FRONT_DIR}" >/dev/null
export VITE_API_BASE="${API_BASE}"
npm ci
npm run build
popd >/dev/null


# 2) Envoi du build vers le serveur (répertoire tampon)
say "Rsync du build vers ${HOST}:${REMOTE_TMP}/"
rsync -avz --delete -e ssh "${FRONT_DIR}/dist/" "${HOST}:${REMOTE_TMP}/"


# 3) Promotion atomique vers le DocumentRoot avec sudo
say "Publication vers ${REMOTE_DEST}/ (sudo requis côté serveur)"
ssh "${HOST}" "sudo mkdir -p '${REMOTE_DEST}' \
&& sudo rsync -a --delete '${REMOTE_TMP}/' '${REMOTE_DEST}/' \
&& sudo chown -R www-data:www-data '${REMOTE_DEST}' \
&& rm -rf '${REMOTE_TMP}' \
&& sudo systemctl reload apache2 || true"


# 4) Sanity checks (status HTTP)
say "Vérifications HTTP rapides"
ssh "${HOST}" "set -e; \
echo -n 'GET / -> '; curl -sS -o /dev/null -w '%{http_code}
' https://app.mon-site.ca/; \
echo -n 'GET /api/csrf/ -> '; curl -sS -o /dev/null -w '%{http_code}
' https://app.mon-site.ca/api/csrf/; \
true"


say "Déploiement terminé."
