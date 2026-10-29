#!/bin/sh
# Copies the dumps in /backups, with their row counts, to an off-server rclone remote once a day.
# Runs in the backup-offsite service (rclone image). BACKUP_REMOTE names the target (e.g. offsite:),
# and its remote must be of type crypt: a dump holds the whole database (ledger, password hashes,
# second-factor secrets), so it leaves the server only encrypted, and the script refuses any other
# remote. The remote comes from the RCLONE_CONFIG_OFFSITE_* variables (see .env.example).
# Only copies: deleting old dumps on the remote is left to its own retention.
set -eu
if [ -z "${BACKUP_REMOTE:-}" ]; then
  echo "BACKUP_REMOTE is not set; off-server copies are off" >&2
  while true; do sleep 86400; done
fi
case "$BACKUP_REMOTE" in
  ?*:*) remote="${BACKUP_REMOTE%%:*}" ;;
  *) remote="" ;;
esac
kind="$(rclone listremotes --long 2>/dev/null | awk -v r="$remote:" '$1 == r { print $2 }')"
if [ -z "$remote" ] || [ "$kind" != crypt ]; then
  echo "off-server copy REFUSED: BACKUP_REMOTE=$BACKUP_REMOTE is not on an rclone crypt remote" \
    "(remote type: ${kind:-none}), so the dumps would leave the server unencrypted; see .env.example" >&2
  exit 1
fi
HOUR="${BACKUP_OFFSITE_HOUR_UTC:-3}"
while true; do
  if rclone copy /backups "$BACKUP_REMOTE" --include "*.dump" --include "*.counts" --immutable --log-level INFO; then
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
