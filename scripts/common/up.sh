#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib.sh"
SVC="${SVC:-}"
if [[ -n "${SVC}" ]]; then compose up -d --build "$SVC"; else compose up -d --build; fi
