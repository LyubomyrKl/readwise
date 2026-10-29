# Deploying Workbench

How Workbench runs in production, how to deploy and update it, and what must never happen while
doing so. Read **Rules** before touching the server.

## The server

| | |
|---|---|
| Host | Hetzner VPS `46.225.5.84`, Ubuntu 24.04, 2 vCPU, 3.7 GB RAM, 38 GB disk (about 80% used before Workbench) |
| Login | `ssh -i ~/.ssh/hetzner root@46.225.5.84` (the key lives on the owner's Mac only) |
| Firewall | ufw allows only 22 in. Docker-published ports bypass ufw, so a port published on `0.0.0.0` is public whatever ufw says |
| Shared with | the owner's **Telegram bot**, compose project `paedavic` (see Rules) |
| Workbench | `/opt/workbench`, compose project `workbench` (the name is fixed in `docker-compose.yml`, so its volumes are `workbench_*` whatever the directory) |
| Access | Tailscale: the app is reachable only from the owner's tailnet; Claude's endpoint is public through Tailscale Funnel (see Access) |
| LLM | Ollama on the owner's own machine, reached over Tailscale (`OLLAMA_BASE_URL` = that machine's tailnet IP) |

The previous deployment of this project (`/opt/app/summarizer-gateway`, `summarizer-workers`,
`summarizer-infra`) was removed together with its data when Workbench was first deployed.

## Rules

1. **The Telegram bot is untouchable**: its deployment and its data. That is compose project
   `paedavic` in `/opt/paedavic`, containers `paedavic-api-1`, `paedavic-redis-1`,
   `paedavic-postgres-1`, volumes `paedavic_pgdata` and `paedavic_redisdata`, network
   `paedavic_default`, its root crontab line (nightly `pg_dump` into `/opt/backups`) and
   `/opt/backups`. Never stop, restart, rebuild, edit or remove any of it; do not even read its
   `.env` files. Note its state (`docker ps`, `docker volume ls | grep paedavic`,
   `crontab -l | grep paedavic`) before a deployment and compare after.
2. **Never act on all of Docker.** No `docker system prune`, `docker image prune`,
   `docker volume prune`, `docker container prune`, `docker network prune`,
   `docker builder prune`: they reach the bot's images, volumes and build cache too. Remove only
   resources you name, and only Workbench's.
3. **Keep at least 3 GB free on `/`.** The bot's Postgres and its nightly dumps need room; a full
   disk stops them. Check `df -h /` before and after every build.
4. **Keep Workbench's memory capped** so it cannot crowd the bot out (the host has no RAM to
   spare). The caps live in `.env` (see First deployment); build one image at a time and pause
   when `free -h` shows less than 500 MB available memory plus free swap.
5. **Never publish a port on a public interface.** Caddy listens on `127.0.0.1:8080` (set in
   `docker-compose.override.yml`), the API on `127.0.0.1:5173`. Public exposure happens only
   through Tailscale Funnel, and only for `/api/money/claude/*`.
6. **Tailscale serve/funnel**: run `tailscale serve status` and `tailscale funnel status` first.
   If a configuration exists that is not Workbench's, leave it alone: `tailscale serve` on a port
   replaces whatever was there.
7. **Keep the MinIO image.** `minio/minio:latest` runs from the copy cached on the host
   (`pull_policy: missing`; MinIO stopped publishing images in 2025). Never `docker rmi` it, and
   never `docker compose down --rmi all` a stack that uses it. Keep a spare copy off the server:
   `ssh -i ~/.ssh/hetzner root@46.225.5.84 'docker save minio/minio:latest' | gzip > minio-image.tar.gz`.
8. **Secrets**: `.env` is `chmod 600`, secrets are hex (`openssl rand -hex …`, no characters
   that break a connection URL), and they are never printed, pasted or committed.

## Access: why Tailscale

The app needs HTTPS, and a trusted certificate needs a name, not a bare IP:

- the session cookies are `Secure` in production, so a browser drops them over plain `http`;
- passkeys need a secure context and a domain as relying party (an IP is not allowed);
- the service worker (offline page) needs a secure context;
- Claude's connector only talks to trusted `https` URLs.

With no domain, Tailscale gives the server a name with a certificate:

| What | Where | Who can reach it |
|---|---|---|
| The app | `https://<server>.<tailnet>.ts.net` → `tailscale serve` on 443 → Caddy `127.0.0.1:8080` | the owner's devices on the tailnet |
| Claude's endpoint (MCP and read API, token-protected) | `https://<server>.<tailnet>.ts.net:8443/api/money/claude/mcp` → `tailscale funnel` on 8443, only the path `/api/money/claude` | the internet (a `mny_…` token is required; create it in Settings → Money → Claude) |

Prerequisites in the Tailscale admin console: MagicDNS and HTTPS certificates on, and the Funnel
node attribute for the server. The first `tailscale serve`/`funnel` that needs one of them prints a
link to switch it on.

Known limitation: behind `tailscale serve` every request reaches Caddy from the same local address,
so the API's rate limits for signed-out calls (login, refresh) are shared by all clients. With
the app private to the tailnet that is acceptable.

### Pivot: a domain instead of Tailscale

If the app should be public with its own name (a free `<name>.duckdns.org` pointed at
`46.225.5.84` works; plain-IP `http` does not, see above):

1. Point the name's A record at `46.225.5.84`.
2. In `.env`: `SITE_ADDRESS=<name>`, `WEBAUTHN_RP_ID=<name>`, `WEBAUTHN_ORIGIN=https://<name>`.
3. Delete `docker-compose.override.yml` (Caddy then publishes 80 and 443 and gets a Let's Encrypt
   certificate on its own), then `docker compose up -d caddy api web`.
4. `tailscale serve reset` (and `tailscale funnel --https=8443 off`); Claude's endpoint becomes
   `https://<name>/api/money/claude/mcp`.
5. Passkeys registered under the old name stop working: sign in with the password (and code) and
   register them again.

Free names on `sslip.io`/`nip.io` are not on the Public Suffix List, so Let's Encrypt rate limits
are shared with everyone using them; prefer DuckDNS or an own domain.

## First deployment

Prerequisites on the host: Docker with Compose v2.24 or later (the override file uses `!override`),
Tailscale logged in (`tailscale status`) and running with its `tailscale0` interface (containers reach
the Ollama machine's `100.x` address through it; userspace networking would not route them).

1. **State of the bot** (Rule 1) and of the host: `docker ps`, `free -h`, `df -h /`, `swapon --show`.

2. **Swap**, if there is none and at least 8 GB are free (the builds need it on 3.7 GB RAM):

   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```

3. **Code.** The server has no GitHub credentials; send a snapshot from a machine that has them:

   ```bash
   git fetch origin main
   git archive --format=tar origin/main | ssh -i ~/.ssh/hetzner root@46.225.5.84 'mkdir -p /opt/workbench && tar -x -C /opt/workbench'
   git rev-parse origin/main | ssh -i ~/.ssh/hetzner root@46.225.5.84 'cat > /opt/workbench/REVISION'
   ```

4. **`.env`** (on the server, in `/opt/workbench`):

   ```bash
   cp .env.example .env && chmod 600 .env
   set_env() { grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >> .env; }
   set_env JWT_ACCESS_SECRET "$(openssl rand -hex 32)"
   set_env JWT_REFRESH_SECRET "$(openssl rand -hex 32)"
   set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
   set_env MINIO_ROOT_PASSWORD "$(openssl rand -hex 24)"
   set_env RABBITMQ_PASS "$(openssl rand -hex 24)"
   NAME=$(tailscale status --json | python3 -c "import json,sys;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))")
   set_env SITE_ADDRESS ":80"
   set_env WEBAUTHN_RP_ID "$NAME"
   set_env WEBAUTHN_ORIGIN "https://$NAME"
   set_env OLLAMA_BASE_URL "http://<Ollama machine's tailnet IP>:11434"
   set_env REGISTRATION first-user
   # memory caps (Rule 4)
   set_env DB_MEM_LIMIT 512m;  set_env API_MEM_LIMIT 512m;   set_env WORKERS_MEM_LIMIT 768m
   set_env WEB_MEM_LIMIT 384m; set_env MINIO_MEM_LIMIT 256m; set_env RABBITMQ_MEM_LIMIT 384m
   set_env CADDY_MEM_LIMIT 128m
   ```

   Also check `OLLAMA_MODEL` and `OLLAMA_EMBED_MODEL` against the models the Ollama machine has
   (`curl http://<ip>:11434/api/tags`). If Compose complains about the comment after `API_PORT`,
   remove the comment.

5. **Private ports** (Rule 5): `/opt/workbench/docker-compose.override.yml`

   ```yaml
   services:
     caddy:
       ports: !override
         - "127.0.0.1:8080:80"
   ```

   Check: `docker compose config -q`, and `docker compose config` shows only
   `127.0.0.1:8080` for Caddy. Ports 5173 and 8080 must be free (`ss -ltn`).

6. **Images** (Rule 7): `docker image ls minio/minio` must list `latest`; if not, load it from the
   spare copy: `gunzip -c minio-image.tar.gz | ssh -i ~/.ssh/hetzner root@46.225.5.84 docker load`.

7. **Build**, one image at a time, in the background (a build outlives an SSH command), checking
   disk and memory between them (Rules 3 and 4):

   ```bash
   cd /opt/workbench
   nohup docker compose build api > /root/workbench-build-api.log 2>&1 &
   # wait for it (tail the log), check df -h / and free -h, then the same for web, then workers
   ```

8. **Start** and wait until `api` and `web` are healthy (a few minutes):

   ```bash
   docker compose up -d
   docker compose ps
   docker compose logs migrate | tail -20      # "All migrations have been successfully applied"
   curl -s localhost:5173/api/health
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/       # 200 or a redirect
   docker compose exec -T workers python -c "import os,urllib.request;print(urllib.request.urlopen(os.environ['OLLAMA_BASE_URL'].rstrip('/')+'/api/tags',timeout=8).status)"
   ```

   The last check fails while the Ollama machine is asleep or off Tailscale; summaries then wait
   and continue when it is back.

9. **Tailscale** (Rule 6):

   ```bash
   tailscale serve status; tailscale funnel status          # must be empty, or Workbench's own
   tailscale serve --bg --https=443 http://127.0.0.1:8080
   tailscale funnel --bg --https=8443 --set-path=/api/money/claude http://127.0.0.1:8080/api/money/claude
   curl -s -o /dev/null -w '%{http_code}\n' https://$NAME/                                # 200 or a redirect
   curl -s -o /dev/null -w '%{http_code}\n' https://$NAME:8443/api/money/claude/summary   # 401: reached, wants a token
   ```

   A 404 on the second check means the path mapping did not keep the prefix: turn it off
   (`tailscale funnel --https=8443 --set-path=/api/money/claude off`) and add it again with the
   target `http://127.0.0.1:8080`.

10. **Compare the bot** with step 1 (Rule 1).

11. **First sign-in**: open `https://<server>.<tailnet>.ts.net` on a device on the tailnet and
    register. The first account is the only one (`REGISTRATION=first-user`). Then, in Settings:
    turn on the authenticator app and/or add a passkey, and under Money → Claude create a token for
    Claude's connector.

## Updating to a new commit

1. Note the bot's state (Rule 1), `df -h /`, `free -h`.
2. **Dump the database first**: migrations only go forward, so the dump is the way back.

   ```bash
   cd /opt/workbench && docker compose --profile backup run --rm backup once
   ```

3. **New code next to the old**, keeping the config:

   ```bash
   # from a machine with repository access
   git fetch origin main
   git archive --format=tar origin/main | ssh -i ~/.ssh/hetzner root@46.225.5.84 'rm -rf /opt/workbench.new && mkdir /opt/workbench.new && tar -x -C /opt/workbench.new'
   git rev-parse origin/main | ssh -i ~/.ssh/hetzner root@46.225.5.84 'cat > /opt/workbench.new/REVISION'
   # on the server
   cp -p /opt/workbench/.env /opt/workbench/docker-compose.override.yml /opt/workbench.new/
   diff <(grep -o '^[A-Z_]*=' /opt/workbench/.env.example) <(grep -o '^[A-Z_]*=' /opt/workbench.new/.env.example)   # new settings to add to .env
   ```

4. **Build** (Rules 3, 4), remembering the images being replaced so only they are removed later:

   ```bash
   cd /opt/workbench.new
   OLD=$(docker image inspect -f '{{.Id}}' workbench-api workbench-web workbench-workers)
   nohup docker compose build api > /root/workbench-build-api.log 2>&1 &   # then web, then workers
   ```

5. **Switch** (the compose project name is fixed, so the same containers and volumes are used):

   ```bash
   rm -rf /opt/workbench.prev && mv /opt/workbench /opt/workbench.prev && mv /opt/workbench.new /opt/workbench
   cd /opt/workbench && docker compose up -d       # migrate runs before api and workers
   docker compose ps; docker compose logs migrate | tail -5
   ```

6. Verify as in First deployment, steps 8 and 9 (the Tailscale configuration stays as it is).
7. **Clean up only what this update replaced**: `docker rmi $OLD` (images still used by a container
   are refused, which is fine). Compare the bot (Rule 1).

### Rollback

- Code only (no new migration in the update): `mv /opt/workbench /opt/workbench.bad && mv /opt/workbench.prev /opt/workbench`,
  rebuild the three images, `docker compose up -d`.
- After a migration ran: the old code does not know the new schema. Restore the dump taken in
  step 2 (`infra/README.md`, Money data: durability), then roll the code back as above.

## Backups

`docker compose --profile backup up -d` starts the nightly dump into the `workbench_backups`
volume (verified, pruned only after a good dump, with a restore drill); the details are in
`infra/README.md`. Off-server copies need an rclone crypt remote (`BACKUP_REMOTE`). The dump holds
the database only; uploaded books and summaries live in the `workbench_minio` volume. Mind the
disk (Rule 3): dumps grow with the data.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Summaries stay "waiting" | The Ollama machine is asleep or off Tailscale. Jobs resume when it answers; check with the `workers` command in First deployment, step 8. |
| Workers cannot reach `100.x.y.z` | Tailscale on the server must run with its `tailscale0` interface (not userspace networking), so Docker traffic routes into the tailnet. |
| `tailscale serve`/`funnel` prints a link | HTTPS certificates or Funnel are off for the tailnet: open the link in the admin console, run the command again. |
| Login does nothing, or the session is lost at once | The page was opened over `http`; cookies are `Secure`. Use the `https://…ts.net` address. |
| Passkey creation or sign-in fails | `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` must match the address in the browser exactly. |
| "Registration is closed" | The first account exists. To add one: `REGISTRATION=open` in `.env`, `docker compose up -d api`, register, set it back. |
| A build gets killed, or the host slows down | Memory: swap on (First deployment, step 2), one build at a time, nothing else building. |
| Disk nearly full | Remove only Workbench's replaced images (`docker rmi <id>`), old dumps beyond retention, `/opt/workbench.prev` after a good update. Never a prune (Rule 2). |
| `port is already allocated` | Something else holds 5173 or 8080 (`ss -ltnp`); do not stop it if it is the bot's. |
| `minio` cannot start: image missing | Rule 7: load the spare copy. |

## Deploying with Claude

- A cloud Claude session cannot reach the server: it has no copy of the key and no outbound SSH.
  Run `claude remote-control` in the repository on the owner's Mac (or add it in the Claude
  desktop app under Settings → Claude Code → Remote Control); a session on the Mac runs the
  `ssh -i ~/.ssh/hetzner …` commands. Approve that command with "always allow" once, or every
  step asks again.
- Give the session the Rules above verbatim, have it report the bot's state before and after, and
  have it stop and report on anything unexpected rather than improvise.
- Making anything public (Funnel, a domain on 80/443) needs the owner's explicit approval in the
  conversation; automatic permission checks block such a tunnel otherwise.
