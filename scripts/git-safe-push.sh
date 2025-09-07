#!/usr/bin/env bash
set -euo pipefail

# Options : ./scripts/git-safe-push.sh [branch] [remote]
BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
REMOTE="${2:-origin}"

# Couleurs
ok()    { printf "\033[32m%s\033[0m\n" "$*"; }
warn()  { printf "\033[33m%s\033[0m\n" "$*"; }
err()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }

# Sanity checks
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { err "Pas dans un repo Git."; exit 1; }

# Affiche l'état
echo "Repo: $(basename "$(git rev-parse --show-toplevel)")"
echo "Branche locale: ${BRANCH}"
echo "Remote: ${REMOTE}"

# Vérifie qu'il n'y a pas de conflits en cours
if [ -f .git/MERGE_HEAD ]; then
  err "Un merge est en cours. Termine-le avant de pousser."
  exit 1
fi

# Vérifie s'il y a des changements non committés
if ! git diff --quiet || ! git diff --cached --quiet; then
  warn "Des changements non committés existent. Ils ne seront PAS poussés."
fi

# Récupère l’upstream
UPSTREAM="$(git rev-parse --abbrev-ref "${BRANCH}@{upstream}" 2>/dev/null || true)"
if [ -z "${UPSTREAM}" ]; then
  warn "Aucun upstream configuré pour ${BRANCH}. Je le pointe sur ${REMOTE}/${BRANCH}."
  git branch --set-upstream-to="${REMOTE}/${BRANCH}" "${BRANCH}" || true
  UPSTREAM="${REMOTE}/${BRANCH}"
fi

echo "Upstream: ${UPSTREAM}"

# Fetch puis s'assure que le push sera fast-forward côté remote
git fetch --prune "${REMOTE}"

LOCAL="$(git rev-parse "${BRANCH}")"
REMOTE_SHA="$(git rev-parse "${UPSTREAM}" 2>/dev/null || true)"

if [ -z "${REMOTE_SHA}" ]; then
  warn "La branche ${UPSTREAM} n'existe pas encore sur ${REMOTE}. Création au push."
else
  BASE="$(git merge-base "${BRANCH}" "${UPSTREAM}")"
  if [ "${REMOTE_SHA}" != "${BASE}" ]; then
    err "Le remote a avancé. Fais d'abord : git pull --ff-only ${REMOTE} ${BRANCH}"
    exit 1
  fi
fi

# Pull fast-forward ONLY pour s'assurer que local est à jour
ok "Pull (fast-forward only)…"
git pull --ff-only "${REMOTE}" "${BRANCH}"

# Push
ok "Push…"
git push "${REMOTE}" "${BRANCH}"

ok "✅ Push OK sur ${REMOTE}/${BRANCH}"
