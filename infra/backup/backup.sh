#!/bin/sh
# Nightly pg_dump into /backups. Runs inside the postgres image (see the "backup" service, profile "backup").
#
# A dump is written as <db>-<time>.dump.partial, read back in full with pg_restore, and only then
# renamed to <db>-<time>.dump, so every *.dump is complete. Next to it, <db>-<time>.counts holds the
# row count of every table, taken in the dump's own snapshot; restore-check.sh compares a restore with it.
# Old dumps are pruned only after a verified dump: older than BACKUP_KEEP_DAYS days goes, but the
# newest BACKUP_KEEP_MIN always stay. A failed attempt is logged and retried after BACKUP_RETRY_MINUTES.
#
#   backup.sh          a dump now, then every 24 h
#   backup.sh once     a single dump (e.g. before an upgrade); exits 1 if it failed
#   backup.sh check    the service's health check: exits 1 unless the newest dump is younger than
#                      BACKUP_MAX_AGE_HOURS
#
# Locally: PGHOST=localhost POSTGRES_USER=.. POSTGRES_PASSWORD=.. POSTGRES_DB=.. BACKUP_DIR=/tmp/b ./backup.sh once
set -eu
DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
KEEP_MIN="${BACKUP_KEEP_MIN:-7}"
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"
RETRY_MINUTES="${BACKUP_RETRY_MINUTES:-60}"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

check() {
  newest="$(find "$DIR" -maxdepth 1 -name '*.dump' -size +0c -mmin -"$((MAX_AGE_HOURS * 60))" | sort | tail -n 1)"
  if [ -z "$newest" ]; then
    echo "no verified dump younger than $MAX_AGE_HOURS h in $DIR" >&2
    return 1
  fi
  echo "newest dump: $newest"
}

wait_for_db() {
  tries=0
  until pg_isready -q; do
    tries=$((tries + 1))
    [ "$tries" -lt 60 ] || return 1
    sleep 5
  done
}

# Prints the reason and removes this attempt's files; the caller returns 1.
fail() {
  log "backup FAILED: $*" >&2
  [ -z "$base" ] || rm -f "$base.dump.partial" "$base.counts.partial" "$base.ok.partial"
}

dump_once() {
  base=""
  mkdir -p "$DIR" || { fail "cannot create $DIR"; return 1; }
  wait_for_db || { fail "database at $PGHOST not ready after 5 minutes"; return 1; }
  base="$DIR/${POSTGRES_DB}-$(date -u +%Y%m%dT%H%M%SZ)"
  # One read-only transaction exports its snapshot and counts every table's rows; pg_dump then runs
  # inside it (\!) on that same snapshot, so the counts describe exactly what the dump holds.
  # (The query matches the one in restore-check.sh.)
  psql -X -q -At -F' ' -w -v ON_ERROR_STOP=1 <<SQL || { fail "psql exited with status $?"; return 1; }
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_export_snapshot() AS snapshot \gset
\o '$base.counts.partial'
SELECT format('SELECT %L, count(*) FROM %I.%I', table_name, table_schema, table_name)
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
 ORDER BY table_name COLLATE "C"
\gexec
\o
\setenv BACKUP_SNAPSHOT :snapshot
\! pg_dump -w --snapshot="\$BACKUP_SNAPSHOT" -Fc -f '$base.dump.partial' </dev/null && touch '$base.ok.partial'
COMMIT;
SQL
  [ -e "$base.ok.partial" ] || { fail "pg_dump did not complete"; return 1; }
  # (empty when the database has no tables yet, e.g. before the first migration)
  [ -e "$base.counts.partial" ] || { fail "no row counts were written"; return 1; }
  pg_restore -f /dev/null "$base.dump.partial" || { fail "the dump does not read back"; return 1; }
  mv "$base.counts.partial" "$base.counts" && mv "$base.dump.partial" "$base.dump" \
    || { fail "cannot rename the verified dump"; rm -f "$base.counts"; return 1; }
  rm -f "$base.ok.partial"
  log "backup written: $base.dump ($(wc -c < "$base.dump") bytes, $(wc -l < "$base.counts") tables)"
}

prune() {
  # Newest first: the newest KEEP_MIN stay whatever their age, older ones go after KEEP_DAYS days.
  ls -1t "$DIR"/*.dump 2>/dev/null | tail -n +"$((KEEP_MIN + 1))" | while read -r old; do
    if [ -n "$(find "$old" -mtime +"$KEEP_DAYS")" ]; then
      if rm -f "$old" "${old%.dump}.counts"; then log "pruned $old"; else log "could not prune $old" >&2; fi
    fi
  done
  # Leftovers: an interrupted run's partial files, and the empty *.dump files that a failed
  # pg_dump used to leave behind before dumps were written as .partial first.
  find "$DIR" -maxdepth 1 -name '*.partial' -mmin +1440 -delete
  find "$DIR" -maxdepth 1 -name '*.dump' -size 0 -delete
}

case "${1:-loop}" in
  check)
    check
    ;;
  once | loop)
    export PGHOST="${PGHOST:-db}" PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE="$POSTGRES_DB"
    if [ "${1:-loop}" = once ]; then
      dump_once || exit 1
      prune || log "pruning old dumps failed" >&2
      exit 0
    fi
    while true; do
      if dump_once; then
        prune || log "pruning old dumps failed" >&2
        sleep 86400
      else
        log "next attempt in $RETRY_MINUTES minutes" >&2
        sleep "$((RETRY_MINUTES * 60))"
      fi
    done
    ;;
  *)
    echo "usage: backup.sh [once | check]" >&2
    exit 2
    ;;
esac
