#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib.sh"
compose ps
