# Workbench

A personal toolbox. The first tool is a reader with an AI summarizer: upload
PDF/EPUB books, read them, keep highlights and notes, and generate structured
summaries with a local LLM (Ollama).

The architecture and the migration plan live in
[`docs/toolbox-architecture-plan.md`](docs/toolbox-architecture-plan.md).

## Layout

| Path | Stack | What |
|---|---|---|
| `apps/web` | Next.js 16, React 19, Tailwind 4 | web app: shell, reader, summary viewer, server-side routes that call the API |
| `apps/api` | NestJS 11, Prisma 6, RabbitMQ, S3 | HTTP API: auth, books, highlights, notes, summarizer; owns the database schema and migrations |
| `apps/workers` | Python 3.11 | extraction (pdfplumber/ebooklib) and the summarization pipeline (Ollama) |
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

## Database and migrations

`apps/api/prisma/schema.base.prisma` is the single source of truth. The Prisma JS
schema (`apps/api/prisma/schema.prisma`) and the Prisma Python copy
(`apps/workers/schema.prisma`) are generated from it:

```bash
npm run prisma:sync
```

Schema changes reach the database through migrations, never `db push`:

```bash
cd apps/api
npx prisma migrate dev --name <change>   # writes prisma/migrations/<timestamp>_<change>
npx prisma migrate deploy                # what the migrate service runs
```

## Tests and checks

```bash
npm run lint && npm run typecheck && npm test   # Turborepo across web + api
npm run test:e2e                                # api e2e with mocked infrastructure
npm run test:workers                            # pytest in python:3.11-slim
npm run smoke                                   # end to end against a running stack
```

CI (`.github/workflows/ci.yml`) runs the same plus a migration drift check and
the three Docker builds on every push to `main`.
