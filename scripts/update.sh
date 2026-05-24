#!/usr/bin/env bash
set -euo pipefail

./scripts/backup-db.sh
git pull --ff-only
./scripts/check-invariants.sh
./scripts/rebuild.sh
./scripts/up.sh
./scripts/migrate.sh
./scripts/ps.sh
