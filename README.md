# Readwise Monorepo

A polyglot monorepo containing the full Readwise stack. JavaScript/TypeScript
packages are managed with **npm workspaces** and orchestrated with
**[Turborepo](https://turbo.build/)**. Python services live in the same repo and
are managed with `pip`.

## Layout

| Path | Stack | Description |
| --- | --- | --- |
| `readwise-client` | Next.js (TypeScript) | Web client (package name `day-to-day`). Deployed to Vercel. |
| `readwise-gateway` | NestJS (TypeScript) | API gateway. Prisma + RabbitMQ + S3. Dockerized. |
| `readwise-contracts/packages/ts` | TypeScript | `@summarizer/contracts` — shared validators & types. |
| `readwise-contracts/packages/py` | Python | `summarizer-contracts` — shared validators & schemas. |
| `readwise-workers` | Python | Extraction & summarization workers. Dockerized. |
| `readwise-shared/prisma` | Prisma | Base Prisma schema, source of truth for the DB. |
| `readwise-infra` | Docker Compose | Local infrastructure (broker, storage, etc.). |

Only the three TypeScript packages are npm workspaces. The Python projects are
part of the repo but are not part of the npm workspace graph.

## Prerequisites

- Node.js `>=20` (see `.nvmrc`) and npm `>=11`
- Python `>=3.11` (for `readwise-workers` and the Python contracts)
- Docker (for `readwise-gateway`, `readwise-workers`, and `readwise-infra`)

## Getting started (JS/TS)

Install every workspace's dependencies from the repo root — this creates a
single hoisted `node_modules` and links `@summarizer/contracts` locally:

```bash
npm install
```

Common tasks run through Turborepo across all workspaces:

```bash
npm run dev          # start dev servers (client + gateway)
npm run build        # build every workspace (respecting dependency order)
npm run lint         # lint every workspace
npm run test         # test every workspace
npm run typecheck    # type-check every workspace
npm run format       # Prettier write across the repo
```

Target a single app:

```bash
npm run dev:client       # or: npx turbo run dev --filter=./readwise-client
npm run dev:gateway
npm run build:gateway
```

> Each package keeps its own `.prettierrc` and `tsconfig.json`; Prettier and
> TypeScript resolve the nearest config per file, so the client and gateway
> retain their distinct code styles.

## Getting started (Python)

```bash
# Workers
cd readwise-workers
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Shared Python contracts
cd readwise-contracts/packages/py
pip install -e ".[dev]"
```

## Database / Prisma

`readwise-shared/prisma/schema.base.prisma` is the single source of truth. The
gateway (Prisma JS) and workers (Prisma Python) schemas are generated from it:

```bash
npm run prisma:sync           # regenerate gateway + workers schemas
# then, per the script output:
cd readwise-gateway && npx prisma generate
cd readwise-workers && prisma generate
```

Schema changes reach the database through Prisma migrations, never `db push`:

```bash
cd readwise-gateway
npx prisma migrate dev --name <change>   # writes prisma/migrations/<timestamp>_<change>
npx prisma migrate deploy                # what the gateway container runs at start
```

## Infrastructure

```bash
cd readwise-infra && docker compose up -d
```

## Notes

- Docker/Vercel builds still install per-directory (each package keeps its own
  `package-lock.json`). Migrating those builds to install from the workspace
  root is a follow-up.
- Turborepo caches build/test/lint/typecheck outputs in `.turbo/` (gitignored).
