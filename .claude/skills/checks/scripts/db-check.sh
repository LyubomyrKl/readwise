#!/usr/bin/env bash
# Money ledger specs and the migration drift check against a throwaway Postgres.
#
#   db-check.sh               recreate the throwaway database, migrate, drift check, run the specs
#   db-check.sh --reuse       keep the database as it is (faster when only the specs changed)
#   db-check.sh --print-url   make sure the database exists and is migrated, print its URL, exit
#   db-check.sh --no-drift    skip the drift check     --no-specs   skip the specs
#
# The database lives in the legacy `summarizer-db` container (Postgres 16, superuser `postgres`,
# trust auth inside the container). Override with CHECK_DB_CONTAINER, CHECK_DB_PORT, CHECK_DB_NAME,
# CHECK_DB_ROLE, CHECK_DB_PASSWORD. Set DATABASE_URL (and SHADOW_DATABASE_URL for the drift check)
# to use a database of your own; the running stack (workbench-db, port 45432) and the legacy dev
# database (appdb) are refused because the specs write.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
API="$ROOT/apps/api"
CONTAINER=${CHECK_DB_CONTAINER:-summarizer-db}
PORT=${CHECK_DB_PORT:-5432}
DB=${CHECK_DB_NAME:-money_session_check}
ROLE=${CHECK_DB_ROLE:-money_check}
PASS=${CHECK_DB_PASSWORD:-$ROLE}

REUSE=0 DRIFT=1 SPECS=1 PRINT=0
for arg in "$@"; do
  case "$arg" in
    --reuse) REUSE=1 ;;
    --no-drift) DRIFT=0 ;;
    --no-specs) SPECS=0 ;;
    --print-url) PRINT=1; REUSE=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "db-check: unknown option $arg" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1m» %s\033[0m\n' "$*" >&2; }

refuse_if_live() {
  local url=$1 dbname port
  dbname=$(printf '%s' "$url" | sed -E 's#^[a-z]+://[^/]*/([^?]*).*$#\1#')
  port=$(printf '%s' "$url" | sed -E 's#^[a-z]+://[^@]*@[^:/]*:?([0-9]*)/.*$#\1#')
  case "$dbname" in
    appdb|workbench) echo "db-check: refusing $dbname: that is a live database and the specs write" >&2; exit 2 ;;
  esac
  if [ "$port" = "45432" ]; then
    echo "db-check: refusing port 45432: that is the running stack's database" >&2; exit 2
  fi
}

psql_admin() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atq "$@"; }
db_exists() { [ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$1'")" = "1" ]; }

if [ -n "${DATABASE_URL:-}" ]; then
  URL=$DATABASE_URL
  SHADOW=${SHADOW_DATABASE_URL:-}
  refuse_if_live "$URL"
  log "using DATABASE_URL as given (not recreated)"
else
  URL="postgresql://$ROLE:$PASS@localhost:$PORT/$DB"
  SHADOW="postgresql://$ROLE:$PASS@localhost:$PORT/${DB}_shadow"
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" != "true" ]; then
    echo "db-check: container $CONTAINER is not running (docker start $CONTAINER, or set CHECK_DB_CONTAINER or DATABASE_URL)" >&2
    exit 2
  fi
  # the role owns the throwaway databases and may create the shadow database prisma migrate dev needs
  psql_admin -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROLE') THEN CREATE ROLE $ROLE LOGIN PASSWORD '$PASS'; END IF; END \$\$;" \
             -c "ALTER ROLE $ROLE CREATEDB;"
  if [ "$REUSE" = 1 ] && db_exists "$DB"; then
    log "reusing database $DB in $CONTAINER"
  else
    log "recreating database $DB in $CONTAINER"
    psql_admin -c "DROP DATABASE IF EXISTS $DB WITH (FORCE);" -c "CREATE DATABASE $DB OWNER $ROLE;"
  fi
  if [ "$DRIFT" = 1 ] && [ "$PRINT" = 0 ]; then
    psql_admin -c "DROP DATABASE IF EXISTS ${DB}_shadow WITH (FORCE);" -c "CREATE DATABASE ${DB}_shadow OWNER $ROLE;"
  fi
fi

export DATABASE_URL=$URL
cd "$API"
log "prisma validate + migrate deploy"
npx prisma validate >&2
npx prisma migrate deploy >&2

if [ "$PRINT" = 1 ]; then
  printf '%s\n' "$URL"
  exit 0
fi

if [ "$DRIFT" = 1 ]; then
  if [ -z "$SHADOW" ]; then
    log "no SHADOW_DATABASE_URL: drift check skipped"
  else
    log "migration drift check (migration files against the Prisma datamodel)"
    npx prisma migrate diff \
      --from-migrations prisma/schema/migrations \
      --to-schema-datamodel prisma/schema \
      --shadow-database-url "$SHADOW" \
      --exit-code
  fi
fi

if [ "$SPECS" = 1 ]; then
  log "money ledger specs (apps/api/test/db/*.db-spec.ts)"
  npx jest --config ./test/jest-db.json --runInBand
fi

log "db-check: green ($URL)"
