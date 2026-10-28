#!/bin/sh
# Copies the dumps in /backups to an off-server rclone remote once a day.
# Runs in the backup-offsite service (rclone image); the remote comes from the
# RCLONE_CONFIG_OFFSITE_* variables and BACKUP_REMOTE (e.g. offsite:workbench-backups).
# Only copies: deleting old dumps on the remote is left to its own retention.
set -eu
if [ -z "${BACKUP_REMOTE:-}" ]; then
  echo "BACKUP_REMOTE is not set; off-server copies are off" >&2
  while true; do sleep 86400; done
fi
HOUR="${BACKUP_OFFSITE_HOUR_UTC:-3}"
while true; do
  if rclone copy /backups "$BACKUP_REMOTE" --include "*.dump" --immutable --log-level INFO; then
    echo "off-server copy OK: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  else
    echo "off-server copy FAILED: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  fi
  now_h=$(date -u +%H | sed 's/^0//')
  now_m=$(date -u +%M | sed 's/^0//')
  wait=$(( ((HOUR - now_h + 24) % 24) * 3600 - now_m * 60 ))
  [ "$wait" -le 0 ] && wait=$(( wait + 86400 ))
  sleep "$wait"
done
