#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_env
compose exec -T db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
