#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
out="${1:?Usage: bash scripts/backup.sh /secure/path/backup.dump}"
umask 077
pg_dump --dbname="${DATABASE_URL%%\?*}" --format=custom --file="$out"
echo "Backup saved."
