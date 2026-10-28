# infra

Host-side pieces of the Docker Compose stack defined in the repository root.

| Path | Used by | Purpose |
|---|---|---|
| `caddy/Caddyfile` | `caddy` service | single public entry point; proxies to the web app, automatic HTTPS when `SITE_ADDRESS` is a hostname |
| `rabbitmq/rabbitmq.conf` | `rabbitmq` service | raises the consumer acknowledgement timeout to 24 h for long summarizations (interim until Phase 4 of the plan) |
| `backup/backup.sh` | `backup` service (`--profile backup`) | nightly `pg_dump` into the `backups` volume, 14-day retention |
| `backup/offsite.sh` | `backup-offsite` service (`--profile backup`) | daily `rclone copy` of the dumps to an off-server remote (`BACKUP_REMOTE`, configured with `RCLONE_CONFIG_OFFSITE_*`); copies only, so a wiped server cannot delete the remote's history |
| `backup/restore-check.sh` | `backup` service, run by hand | restores the newest dump into a scratch database and compares row counts per table: `docker compose --profile backup run --rm --entrypoint /bin/sh backup /restore-check.sh` |

Credentials and host settings live in the root `.env` (see `.env.example`).

## Money data: durability and encryption at rest

The money tool's targets (docs/money/requirements.md): no data loss, a daily copy off the
server, restore in under an hour.

- Nightly dump: `backup` service. Off-server copy: `backup-offsite` (set `BACKUP_REMOTE`).
- Restore drill: `docker compose --profile backup run --rm --entrypoint /bin/sh backup /restore-check.sh`
  restores the newest dump into a scratch database and compares every table's row count. Run it
  once per milestone and after changing the backup setup.
- Restoring for real: `docker compose stop api web`, then
  `docker compose exec db pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB" /path/to/dump`
  (copy the dump into the db container first, or mount the backups volume), then start api and web.
- Encryption at rest is the host's job: put the Docker data directory (or the Postgres volume) on a
  LUKS-encrypted disk or Hetzner volume. Dumps leave the server through rclone; wrap the remote
  in an rclone `crypt` remote to encrypt them there as well.
