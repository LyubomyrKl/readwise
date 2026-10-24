#!/bin/sh
# Nightly pg_dump into /backups, keeping BACKUP_KEEP_DAYS days.
# Runs inside the postgres image (see the "backup" service, profile "backup").
set -eu
KEEP="${BACKUP_KEEP_DAYS:-14}"
mkdir -p /backups
while true; do
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  file="/backups/${POSTGRES_DB}-${ts}.dump"
  if PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$file"; then
    echo "backup written: $file"
  else
    echo "backup FAILED at $ts" >&2
  fi
  find /backups -name "*.dump" -mtime +"$KEEP" -delete
  sleep 86400
done
