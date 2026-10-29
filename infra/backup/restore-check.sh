#!/bin/sh
# Proves a backup restores: loads a dump into a fresh, empty scratch database and compares the row
# count of every table with the counts backup.sh took in the dump's own snapshot (the .counts file
# next to the dump), so rows written since the dump do not matter.
#
#   restore-check.sh [dump]      default: the newest /backups/*.dump, which must also be younger
#                                than BACKUP_MAX_AGE_HOURS (default 26), or backups have stopped
#
# Runs inside the backup service (same image and credentials as backup.sh):
#   docker compose --profile backup run --rm --entrypoint /bin/sh backup /restore-check.sh
# Locally: PGHOST=localhost POSTGRES_USER=.. POSTGRES_PASSWORD=.. BACKUP_DIR=. ./restore-check.sh
set -eu
export PGHOST="${PGHOST:-db}" PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD"
DIR="${BACKUP_DIR:-/backups}"
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"

if [ $# -gt 0 ]; then
  dump="$1"
else
  dump="$(ls -1t "$DIR"/*.dump 2>/dev/null | head -n 1)"
  if [ -z "$dump" ]; then
    echo "restore check FAILED: no dump in $DIR" >&2
    exit 1
  fi
  if [ -z "$(find "$dump" -mmin -"$((MAX_AGE_HOURS * 60))")" ]; then
    echo "restore check FAILED: the newest dump, $dump, is older than $MAX_AGE_HOURS h; are backups running?" >&2
    exit 1
  fi
fi
expected="${dump%.dump}.counts"
if [ ! -e "$expected" ]; then
  echo "restore check FAILED: no row counts next to the dump ($expected); backup.sh writes one with every dump" >&2
  exit 1
fi

scratch="restore_check_$(date -u +%Y%m%d%H%M%S)"
tmp="$(mktemp -d)"
started="$(date +%s)"
trap 'psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$scratch\""; rm -rf "$tmp"' EXIT

echo "restoring $dump into $scratch"
psql -X -q -d postgres -c "CREATE DATABASE \"$scratch\""
pg_restore --no-owner --exit-on-error -d "$scratch" "$dump"

# Same query as in backup.sh, so the two outputs compare line by line.
psql -X -q -At -F' ' -v ON_ERROR_STOP=1 -d "$scratch" > "$tmp/restored.counts" <<'SQL'
SELECT format('SELECT %L, count(*) FROM %I.%I', table_name, table_schema, table_name)
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
 ORDER BY table_name COLLATE "C"
\gexec
SQL
if diff -u "$expected" "$tmp/restored.counts"; then
  echo "restore OK: $(wc -l < "$expected") tables hold the rows of the dump's snapshot, in $(( $(date +%s) - started ))s"
else
  echo "restore MISMATCH: the restored tables differ from the row counts taken with the dump" >&2
  exit 1
fi
