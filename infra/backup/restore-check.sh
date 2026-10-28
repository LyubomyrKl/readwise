#!/bin/sh
# Proves a backup restores: loads a dump into a fresh, empty scratch database and
# compares the row count of every table with the live database.
#
#   restore-check.sh [dump]      default: the newest /backups/*.dump
#
# Runs inside the backup service (same image and credentials as backup.sh):
#   docker compose --profile backup run --rm --entrypoint /bin/sh backup /restore-check.sh
# Locally: PGHOST=localhost POSTGRES_USER=.. POSTGRES_PASSWORD=.. POSTGRES_DB=.. BACKUP_DIR=. ./restore-check.sh
set -eu
export PGHOST="${PGHOST:-db}" PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD"
dump="${1:-$(ls -1t "${BACKUP_DIR:-/backups}"/*.dump | head -n 1)}"
scratch="restore_check_$(date -u +%Y%m%d%H%M%S)"
started="$(date +%s)"

echo "restoring $dump into $scratch"
psql -d postgres -qc "CREATE DATABASE \"$scratch\""
trap 'psql -d postgres -qc "DROP DATABASE IF EXISTS \"$scratch\""' EXIT
pg_restore --no-owner --exit-on-error -d "$scratch" "$dump"

counts() {
  psql -d "$1" -At -F' ' <<'SQL'
SELECT format('SELECT %L, count(*) FROM %I.%I', table_name, table_schema, table_name)
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
 ORDER BY table_name
\gexec
SQL
}

counts "$POSTGRES_DB" > /tmp/live.counts
counts "$scratch" > /tmp/restored.counts
if diff -u /tmp/live.counts /tmp/restored.counts; then
  echo "restore OK: $(wc -l < /tmp/restored.counts) tables match in $(( $(date +%s) - started ))s"
else
  echo "restore MISMATCH (rows written since the dump also show up here)" >&2
  exit 1
fi
