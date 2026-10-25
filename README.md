# Workbench

A personal toolbox. The first tool is a reader with an AI summarizer: upload
PDF/EPUB books, read them, keep highlights and notes, and generate structured
summaries with a local LLM (Ollama).

The architecture and the migration plan live in
[`docs/toolbox-architecture-plan.md`](docs/toolbox-architecture-plan.md).

## Layout

| Path | Stack | What |
|---|---|---|
| `apps/web` | Next.js 16, React 19, Tailwind 4 | web app: the shell in `src/platform`, one directory per tool in `src/tools/<id>` (mounted at `/apps/<id>`), one-line route files under `app/`; five server-side routes: the four auth routes that set the session cookies and the generic proxy `/api/gw/*` |
| `apps/api` | NestJS 11, Prisma 6, RabbitMQ, S3 | HTTP API: `src/platform` (auth, users, storage, queue, jobs, health) and `src/tools/<id>` (the reader: documents, reading, summaries); the only code that touches the database |
| `apps/workers` | Python 3.11 | job consumer (`python -m worker`) with the reader's handlers: extraction (pdfplumber/ebooklib) and the summarization pipeline (Ollama); database-free, reports through job events |
| `packages/contracts` | JSON Schema | the job and event envelopes shared by the API (zod) and the workers (pydantic), with fixtures both test against |
| `infra/` | Caddy, RabbitMQ config, backup | host-side files used by `docker-compose.yml` |
| `packages/contracts` | reserved | job/event contracts shared by API and workers (Phase 4) |
| `scripts/` | bash, Python | `smoke-summary.sh`, `test-workers.sh`, the sample PDF fixture |
| `docs/` | markdown | plan, pipeline speed backlog |

`apps/web` and `apps/api` are npm workspaces orchestrated by Turborepo; one
`package-lock.json` at the root. `apps/workers` is a Python project (`pyproject.toml`).

## Run the whole stack (Docker)

```bash
cp .env.example .env          # set the secrets, SITE_ADDRESS and the Ollama host
docker compose up -d --build  # db, minio (+buckets), rabbitmq, migrate, api, workers, web, caddy
docker compose --profile backup up -d   # optional nightly pg_dump
```

Caddy is the only public entry point. `SITE_ADDRESS=workbench.example.com`
gives automatic HTTPS; `:80` serves plain HTTP. The API listens on
`127.0.0.1:${API_PORT:-5173}` for host tools only. Images are built from the
repository root (`apps/*/Dockerfile`); the `migrate` service applies Prisma
migrations before `api` and `workers` start.

MinIO stopped publishing container images in 2025, so `minio/minio:latest` is
used with `pull_policy: missing`: it runs from the image already cached on the
host. For a fresh host, copy it over with
`docker save minio/minio:latest | ssh <host> docker load`.

Smoke-test a running stack (needs the workers and the Ollama host):

```bash
API_URL=http://127.0.0.1:5173/api scripts/smoke-summary.sh
```

### Upgrading from the pre-migration deployment

Databases created by the old `prisma db push` entrypoints have no migration
history and must be recreated once (data was declared disposable):

```bash
docker compose stop api workers
docker compose exec db psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE \"$POSTGRES_DB\";" -c "CREATE DATABASE \"$POSTGRES_DB\";"
docker compose up -d
```

## Local development

Node `>=20` (`.nvmrc`), npm `>=11`, Python 3.11, Docker.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db minio minio-init rabbitmq
npm install                              # also generates the Prisma client
cp apps/api/.env.example apps/api/.env   # then edit
cp apps/web/.env.example apps/web/.env.local
npm run dev:api                          # http://localhost:5173/api, Swagger at /api/docs
npm run dev:web                          # http://localhost:3000
```

Workers on the host:

```bash
cd apps/workers
cp .env.example .env && pip install -e ".[dev]" && prisma generate
python main.py
```

A full local stack with published ports: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build`
(Caddy on `http://localhost:8080`; override `DEV_*_PORT` if something is already listening).

## How the web app talks to the API

The browser never sees the API origin or the tokens. Sign-in goes through
`app/api/auth/*`, which stores the JWTs in httpOnly cookies; every other call goes
through the proxy `app/api/gw/[...path]`, which forwards the request to
`API_URL/api/<path>` with the token from the cookie, refreshes the token when it is
about to expire or rejected, and streams the answer back (uploads and downloads
included). On the client, `src/platform/api/http.ts` (`apiFetch`) calls the proxy;
each tool keeps its typed functions in `src/tools/<id>/api.ts` and the jobs client
lives in `src/platform/jobs/api.ts`. Adding an endpoint therefore touches two files:
the API controller and the tool's `api.ts`.

## Adding a tool to the web app

1. Create `apps/web/src/tools/<id>/` with a `manifest.ts` (id, name, icon, nav, optional settings), an `api.ts` built on `apiFetch`, and your pages.
2. Add the manifest to `apps/web/src/platform/shell/registry.ts`.
3. Add route files under `apps/web/app/(shell)/apps/<id>/` that re-export your pages.

Lint enforces the boundaries: a tool imports the platform and shared UI, never another tool.

On the API side: `apps/api/src/tools/<id>/<id>.module.ts`, one line in
`apps/api/src/tool-registry.ts`, a `prisma/schema/<id>.prisma` with `@@map("<id>_*")`
tables and a migration. Background work: register a Node handler with `NodeJobRunner`
in the module, or add a Python handler under `apps/workers/worker/tools/<id>/` and list
the tool in `apps/workers/worker/__main__.py`. Tool code may import the platform; the
platform never imports a tool (lint checks this in both apps).

## Database and migrations

The schema lives in `apps/api/prisma/schema/`, one file per owner: `platform.prisma`
(User, RefreshToken, Job) and `reader.prisma` (the reader's tables, prefixed `reader_`);
Prisma keeps the migrations of a schema folder inside it (`prisma/schema/migrations`).
The API is the only code that reads or writes the database; the Python workers get
everything they need in the job payload and report back through events.

Schema changes reach the database through migrations, never `db push`:

```bash
cd apps/api && npx prisma migrate dev --name <change>   # writes prisma/schema/migrations/<timestamp>_<change>
```

In Docker the one-shot `migrate` service runs `prisma migrate deploy` before `api`
and `workers` start. Phase 4 regenerated the initial migration (job and summary
tables, prefixed reader tables); a database created by an earlier phase must be
reset once before this version starts: `docker compose down -v` (data is disposable)
or `docker compose run --rm migrate node /repo/node_modules/prisma/build/index.js migrate reset --force`.

## Background jobs

A summary request creates `Job` rows (`reader.extract`, then `reader.summarize`) and
publishes an envelope to RabbitMQ (`workbench.jobs`, routing key `jobs.<type>`). The
worker acknowledges on claim and reports `started`, `progress`, `waiting`, `succeeded`
or `failed` on `workbench.job-events`; the API updates the row and calls the reader's
hook, which stores the extraction key on the book and the storage key on the summary.
A job whose heartbeat stops for `JOBS_LEASE_SECONDS` is re-published (up to
`JOBS_MAX_ATTEMPTS`), a job whose LLM host is down shows `waiting` and resumes by
itself. Inspect and act with `GET /api/jobs`, `GET /api/jobs/:id`,
`POST /api/jobs/:id/cancel`, `POST /api/jobs/:id/retry` (the dashboard lists recent jobs
and the summary page shows the live stage, the wait reason, cancel and retry);
dead-lettered messages land in the `*.dlq` queues (RabbitMQ management UI).

## Tests and checks

```bash
npm run lint && npm run typecheck && npm test   # Turborepo across web + api
npm run test:e2e                                # api e2e with mocked infrastructure
npm run test:workers                            # pytest in python:3.11-slim
npm run smoke                                   # end to end against a running stack
```

CI (`.github/workflows/ci.yml`) runs the same plus a migration drift check and
the three Docker builds on every push to `main`.
