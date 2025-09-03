#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib.sh"
SVC="${SVC:-backend}"
compose logs -f "$SVC"
