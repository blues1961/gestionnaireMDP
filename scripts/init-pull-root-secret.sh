#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUTPUT_FILE="${PULL_ROOT_SECRET_FILE:-$ROOT_DIR/.env.root.local}"
FORCE="${FORCE:-0}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[ERR] Commande manquante: $1" >&2
    exit 2
  }
}

need_cmd openssl
need_cmd grep
need_cmd sed
need_cmd mktemp

mkdir -p "$(dirname "$OUTPUT_FILE")"

if [[ "$FORCE" != "1" ]] && [[ -f "$OUTPUT_FILE" ]] && grep -q '^PULL_ROOT_SECRET=' "$OUTPUT_FILE"; then
  chmod 600 "$OUTPUT_FILE" 2>/dev/null || true
  echo "[OK] PULL_ROOT_SECRET déjà présent dans $OUTPUT_FILE"
  echo "     Utilisez FORCE=1 pour le régénérer."
  exit 0
fi

NEW_SECRET="$(openssl rand -base64 48 | tr -d '\n')"

TMP_FILE="$(mktemp)"
cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

if [[ -f "$OUTPUT_FILE" ]]; then
  sed '/^PULL_ROOT_SECRET=/d' "$OUTPUT_FILE" > "$TMP_FILE"
else
  cat > "$TMP_FILE" <<'EOF'
# Secrets racine locaux (jamais versionnés)
# Ce fichier est lu automatiquement par scripts/push-secret.sh et scripts/pull-secret.sh
EOF
fi

{
  echo
  echo "# Généré automatiquement le $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "PULL_ROOT_SECRET=\"$NEW_SECRET\""
} >> "$TMP_FILE"

umask 077
mv "$TMP_FILE" "$OUTPUT_FILE"
chmod 600 "$OUTPUT_FILE"

echo "[OK] PULL_ROOT_SECRET initialisé dans $OUTPUT_FILE"
echo "     Tu peux maintenant lancer: make push-secret"
