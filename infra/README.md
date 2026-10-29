# infra

Host-side pieces of the Docker Compose stack defined in the repository root.

| Path | Used by | Purpose |
|---|---|---|
| `caddy/Caddyfile` | `caddy` service | single public entry point; proxies to the web app, except `/api/money/claude/*` (Claude's token-authenticated access) which goes to the API; automatic HTTPS when `SITE_ADDRESS` is a hostname; security headers (nosniff, a referrer policy, no framing, HSTS over HTTPS) |
| `backup/backup.sh` | `backup` service (`--profile backup`) | nightly `pg_dump` into the `backups` volume, read back in full before it is kept, with the row count of every table taken in the dump's snapshot (`<dump>.counts`); 14-day retention that always keeps the newest 7 dumps; the service turns unhealthy when the newest dump is older than 26 h |
| `backup/offsite.sh` | `backup-offsite` service (`--profile backup`) | daily `rclone copy` of the dumps and their counts to an off-server rclone `crypt` remote (`BACKUP_REMOTE`, configured with `RCLONE_CONFIG_OFFSITE_*`; any other remote is refused); copies only, so a wiped server cannot delete the remote's history |
| `backup/restore-check.sh` | `backup` service, run by hand | restores the newest dump into a scratch database and compares every table's row count with the counts taken with that dump: `docker compose --profile backup run --rm --entrypoint /bin/sh backup /restore-check.sh` |

Credentials and host settings live in the root `.env` (see `.env.example`). Every container has
rotated logs (json-file, three files of 10 MB) and a memory and CPU limit (`*_MEM_LIMIT`, `*_CPUS`).
Sign-ups: `REGISTRATION=first-user` (the default) lets one account register on a fresh server and
nobody after it; set `open` or `closed` to change that.

## Money data: durability and encryption at rest

The money tool's targets (docs/money/requirements.md): no data loss, a daily copy off the
server, restore in under an hour.

- Nightly dump: `backup` service. Off-server copy: `backup-offsite` (set `BACKUP_REMOTE`).
  A failed dump is logged and retried every hour, and older dumps are only pruned after a good one.
  Once the newest good dump is older than `BACKUP_MAX_AGE_HOURS` (26 h), `docker compose ps` shows
  `backup` as unhealthy; Docker only records that, so have whatever watches the host look at
  `docker inspect -f '{{.State.Health.Status}}' workbench-backup`.
  An extra dump on demand, before an upgrade say: `docker compose --profile backup run --rm backup once`.
- The dump holds the Postgres database only. The files in MinIO (uploaded books, covers, extractions,
  summaries, checkpoints) are not in it; copy the `minio` volume separately if they matter.
- Restore drill: `docker compose --profile backup run --rm --entrypoint /bin/sh backup /restore-check.sh`
  restores the newest dump into a scratch database and compares every table's row count with the
  counts taken in the dump's own snapshot, so rows written since then do not disturb it; it also fails
  when the newest dump is older than `BACKUP_MAX_AGE_HOURS`. Run it once per milestone and after
  changing the backup setup. For an off-server copy, fetch a dump with its counts and check that file:

  ```sh
  docker compose --profile backup run --rm --entrypoint rclone backup-offsite lsf offsite:
  docker compose --profile backup run --rm -v "$PWD/restore:/restore" --entrypoint rclone backup-offsite \
    copy offsite: /restore --include "workbench-<time>.*"
  docker compose --profile backup run --rm -v "$PWD/restore:/restore:ro" --entrypoint /bin/sh backup \
    /restore-check.sh /restore/workbench-<time>.dump
  ```
- Restoring for real: `docker compose stop api web`, then
  `docker compose exec db pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB" /path/to/dump`
  (copy the dump into the db container first, or mount the backups volume), then start api and web.
- Encryption at rest is the host's job: put the Docker data directory (or the Postgres volume) on a
  LUKS-encrypted disk or Hetzner volume. Dumps leave the server only through the rclone `crypt`
  remote, encrypted with its two passwords; keep those somewhere other than the server too, since
  without them the copies cannot be read.
