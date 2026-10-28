# infra

Host-side pieces of the Docker Compose stack defined in the repository root.

| Path | Used by | Purpose |
|---|---|---|
| `caddy/Caddyfile` | `caddy` service | single public entry point; proxies to the web app, automatic HTTPS when `SITE_ADDRESS` is a hostname |
| `rabbitmq/rabbitmq.conf` | `rabbitmq` service | raises the consumer acknowledgement timeout to 24 h for long summarizations (interim until Phase 4 of the plan) |
| `backup/backup.sh` | `backup` service (`--profile backup`) | nightly `pg_dump` into the `backups` volume, 14-day retention |
| `backup/restore-check.sh` | `backup` service, run by hand | restores the newest dump into a scratch database and compares row counts per table: `docker compose --profile backup run --rm --entrypoint /bin/sh backup /restore-check.sh` |

Credentials and host settings live in the root `.env` (see `.env.example`).
