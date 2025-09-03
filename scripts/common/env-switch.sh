#!/usr/bin/env bash
set -euo pipefail
ENV_TARGET="${1:-dev}"
[[ "$ENV_TARGET" =~ ^(dev|prod)$ ]] || { echo "Usage: env-switch.sh dev|prod"; exit 2; }
rm -f .env; ln -s ".env.${ENV_TARGET}" .env
mkdir -p .ops; printf "%s" "$ENV_TARGET" > .ops/current_env
git config --local ops.env "$ENV_TARGET" || true
echo "ENV actif → $ENV_TARGET  (.env -> .env.$ENV_TARGET)"
