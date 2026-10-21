#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a separate empty database}"
backup="${1:?Usage: bash scripts/restore.sh backup.dump}"
# No --clean: never silently delete existing objects.
pg_restore --dbname="${RESTORE_DATABASE_URL%%\?*}" --no-owner --no-privileges --exit-on-error "$backup"
echo "Restore finished. Verify counts and health before considering a production recovery."
