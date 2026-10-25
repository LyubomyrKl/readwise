# Readvise → Workbench (personal toolbox): Architecture Assessment and Migration Plan

Date: 2026-10-24, revision 2 (updated with the answers to the verification survey)
Scope: `readwise-client` (Next.js), `readwise-gateway` (NestJS), `readwise-workers` (Python), `readwise-shared` (Prisma), `readwise-contracts`, `readwise-infra`.
Status: assessment and plan only. No refactoring has been applied.

Every claim marked **[confirmed]** was read directly from the code at the paths given. Claims marked **[assumption]** still need verification. Facts marked **[survey]** come from your answers on 2026-10-24.

### What changed in revision 2

| Survey answer | Consequence for the plan |
|---|---|
| Everything runs on one Hetzner host in one Docker network; the client is self-hosted | Single-host Compose behind a reverse proxy is the topology. The Vercel body-size concern is gone. `vercel.json` is dead. Presigned transfers are optional. A `web` Dockerfile must be added because none is committed. |
| No database or object-storage data worth keeping | No backups, exports, baseline migration or expand/contract steps. The schema is redesigned directly, with one fresh initial migration and a reset. Table renames are free. |
| Reader and summarizer must be one solid feature | One tool, `reader`, owns the library, upload, extraction, viewers, highlights, notes and summaries. The platform keeps only generic services. The registry starts with one entry. |
| Tools live under `/apps/` | URL scheme is `/apps/<toolId>/...`; platform routes are `/`, `/settings`, `/auth`, `/api`. |
| Rename packages; `readwise-*` names are legacy | Repository becomes `apps/web`, `apps/api`, `apps/workers`, `packages/*`, `infra/`. The toolbox is named **Workbench** (identifier `workbench`); see §1.12. |
| Next tool will most likely be Node-side | The job system gets two consumer runtimes from day one: Node handlers inside the API codebase, Python handlers in the worker image. Only the API codebase touches the database. |
| Ollama is started by hand; one book can take up to 12 hours; speed is a separate concern | Jobs are acknowledged on claim and tracked by a database lease with heartbeats, not by a 12-hour unacknowledged delivery. A `waiting` state covers "LLM host unreachable". Pipeline speed is out of scope for the refactor and tracked separately in `docs/pipeline-speed-backlog.md`. |
| `USE_NEW_PIPELINE` is unknown to you | It defaults to true, so the legacy pipeline is unused and is deleted in Phase 2 instead of Phase 6. |
| Only one user; solo developer committing to main | Multi-session auth, refresh rotation and per-user throttling stay optional. Each phase is a sequence of commits on `main` closed by a git tag. CI runs on push. |

---

## Executive summary

The repository is already a modular-ish monolith: one Next.js front end, one NestJS API, one Python worker process, Postgres + MinIO + RabbitMQ. The summarizer is a thin NestJS module (289 lines) plus a large, well-structured Python pipeline (about 8,700 lines). The Anki ("learning") and dictionary features are cleanly separable: nothing in books, summarizer, highlights or notes imports them, and the only cross-module import on the backend is dictionary → learning **[confirmed]**.

The real obstacles to a toolbox are not the folder names. They are:

1. **The front end has a hand-written BFF that mirrors the gateway 1:1** (about 70 route files, 1,588 lines) plus a single global typed registry in `readwise-client/lib/fetcher.ts`. Every new endpoint in any tool touches four to five files. This is the main extensibility tax.
2. **`Book.status` is written by three actors** (upload, extraction, summarization). Failed summaries make books disappear from the library, and the user's chosen strategy never reaches the summarizer **[confirmed, §1.9]**.
3. **The schema is applied by `prisma db push` from two runtimes at container start**, with migration history for only two tables. Since the data is disposable **[survey]**, this is fixed by one fresh initial migration rather than a baseline.
4. **Feature state lives in the app shell** (upload provider, cover provider, hard-coded app switcher and middleware route lists).
5. **Twelve-hour jobs are carried as unacknowledged AMQP deliveries**, which the broker's default consumer timeout almost certainly interrupts every 30 minutes **[assumption, §1.7]**.

Recommendation in one paragraph: keep the three deployables and three infrastructure services exactly as they are. Do not add services. Introduce a `platform` / `tools` split inside each deployable, a static tool registry on the front end, a `Job` table with database leases so Python never touches the schema again and Node handlers can join, and a generic authenticated proxy that replaces the hand-written BFF. Remove learning and dictionary first, because that deletes roughly 40% of the TypeScript and makes every later step smaller.

Rough size of what is involved (lines of TypeScript/Python, excluding generated code and dependencies):

| Area | Lines | Fate |
|---|---:|---|
| Gateway: learning module | 3,974 | remove |
| Gateway: dictionary module | 2,158 | remove |
| Client: dictionary routes + hook + API + types | ~5,140 | remove |
| Client: learning routes + hook + API + types + settings page | ~2,400 | remove |
| Gateway: summarizer module | 289 | keep, becomes a sub-module of `tools/reader` |
| Workers: summarization pipeline | ~8,700 | keep, repackage as `worker/tools/reader` |
| Workers: extraction | ~700 | keep, same tool |
| Workers: legacy pipeline (`text_summarizer.py`, `llm_client.py`) | ~300 | delete |
| Client: reader UI (viewers, highlights, notes, library, upload, summary) | ~6,800 | keep, becomes `src/tools/reader` |
| Client: BFF route files | 1,588 | collapse to about 3 files |
| `readwise-contracts` | 990 | delete (unused, schema does not match reality) |

---

## 1. Current-state assessment

### 1.1 Tech stack **[confirmed]**

| Layer | Technology | Evidence |
|---|---|---|
| Monorepo | npm workspaces + Turborepo 2 (`turbo.json`), Node 20 (`.nvmrc`) | root `package.json` |
| Front end | Next.js 16 (app router, Turbopack), React 19, Tailwind 4, shadcn/ui (new-york), framer-motion, Sentry | `readwise-client/package.json`, `components.json` |
| Readers | `@embedpdf/*` + `pdfjs-dist` (PDF), `react-reader` + `epubjs` (EPUB) | `app/reader/book/[id]/(components)/PDFReader.tsx`, `EPUBReader.tsx` |
| API | NestJS 11, Passport JWT, class-validator, Swagger, Throttler, Prisma 6.13, `amqp-connection-manager`, AWS SDK v3 (S3), pino, Sentry | `readwise-gateway/package.json` |
| Workers | Python 3.11, pika, prisma-client-py 0.11.0, boto3, pdfplumber, ebooklib, NLTK, scikit-learn, tiktoken, httpx, pydantic-settings | `readwise-workers/requirements.txt` |
| LLM | Ollama via OpenAI-compatible API and native `/api/embeddings`; no OpenAI usage despite the `openai` package | `workers/summarization-worker/llm/async_client.py`, `segmentation/ollama_client.py` |
| Data | PostgreSQL 16, MinIO (S3), RabbitMQ 3.13 | `readwise-infra/docker-compose.yml` |
| Deploy | One Hetzner host, one Docker network **[survey]**; gateway and workers have Dockerfiles, the client has none; `vercel.json` is a leftover | `README.md`, `readwise-client/vercel.json` |

Git history: 243 commits from 2025-08-09 to 2026-07-21, single author, six former repositories merged into one monorepo on the last day. No root CI. The only CI workflows are inside `readwise-contracts/.github/`.

### 1.2 Project structure **[confirmed]**

```
readvise/
├── package.json, turbo.json, sync-prisma.sh        # workspace root (3 npm workspaces)
├── readwise-client/        Next.js app (package name "day-to-day")
│   ├── app/                 routes: reader/, learning/, dictionary/, settings/, auth/, api/ (BFF)
│   ├── app/(components)     AppSidebar, FileUpload, UploadWidget, ModeToggle, Offline, SW
│   ├── app/(providers)      Theme, Motion, Upload, BookCover, Offline
│   ├── components/          AppSwitcher, MobileSidebar, ui/ (shadcn)
│   ├── hooks/               useBookMutations, useReadingSession, useHighlights, useNotes, useLearning, useDictionary
│   ├── lib/                 api/ (server-side axios + endpoint wrappers), fetcher.ts (typed client registry), types/
│   └── middleware.ts        cookie-presence auth guard with hard-coded protected route regexes
├── readwise-gateway/       NestJS API
│   ├── src/modules/         auth, users, books, summarizer, highlights, notes, learning, dictionary, health
│   ├── src/infrastructure/  prisma, s3, rabbitmq
│   ├── src/common/          decorators, logger, middleware, sentry filter, sanitize
│   ├── prisma/              generated schema.prisma + 3 migrations (auth tables only)
│   └── scripts/             openapi/SDK generation, orphaned merge-and-migrate.js
├── readwise-workers/       Python
│   ├── main.py              spawns both workers as subprocesses
│   ├── shared/              database.py (Prisma), messaging.py (pika), s3_storage.py (boto3)
│   ├── workers/extraction-worker/      main.py, pdf_extractor.py, epub_extractor.py
│   ├── workers/summarization-worker/   main.py + 12 subpackages (pipeline)
│   └── schema.prisma        generated copy of the base schema
├── readwise-shared/prisma/schema.base.prisma   # single source of truth for the DB
├── readwise-contracts/     JSON Schemas + TS/Py validators (unused)
└── readwise-infra/         docker-compose for db, minio, rabbitmq
```

### 1.3 Frontend architecture **[confirmed]**

- **Routing.** Four top-level areas (`/reader`, `/learning`, `/dictionary`, `/settings`) each have their own `layout.tsx` that instantiates `AppSidebar` with a hard-coded `nav` array. The app switcher (`components/AppSwitcher.tsx`) hard-codes the list of apps. The home page (`app/page.tsx`) hard-codes three buttons. `middleware.ts` hard-codes protected route regexes. Adding a tool today means editing five places.
- **Data access.** Three layers:
  1. Server side: `lib/api/client.ts` creates an axios instance per call, reads the `access_token` cookie, and `withRefresh` retries once after refreshing. `lib/api/endpoints/*.ts` wrap gateway endpoints.
  2. BFF: `app/api/**/route.ts` (about 70 files) each import an endpoint wrapper, forward the call, and map axios errors. Response envelopes are inconsistent (`GET /api/books` returns an array, `GET /api/books/[id]` returns `{ data }`).
  3. Browser: `lib/fetcher.ts` exposes `apiFetch(method, path, body, params)` typed against a single `ApiRegistry` type that lists every endpoint of every feature. It also implements 401 → refresh → retry → redirect.
- **State.** No server-state library. Components use `useState` + `useEffect` with a `fetchedRef` guard to survive StrictMode double-mount (`app/reader/library/page.tsx`, `app/reader/book/[id]/summary/page.tsx`, hooks). Optimistic updates are hand-rolled in `useHighlights`/`useNotes`.
- **Shell.** `app/layout.tsx` mounts `UploadWidget`, `ServiceWorkerRegistration`, `OfflineIndicator`; `Providers.tsx` nests Theme → Offline → Motion → Upload → BookCover. Upload and cover state are reader concerns living in the global shell.
- **Code splitting.** Route-level splitting from Next.js, plus `dynamic()` for `react-reader`. No further lazy loading is needed structurally.
- **PWA.** `public/sw.js` (network-first with cache fallback, cache name `summarizer-v3`), `manifest.json` named "Summarizer".
- **Tests.** Two Jest tests (`OfflineIndicator`, `useOffline`). Coverage threshold of 50% is configured but cannot be met.

### 1.4 Backend architecture **[confirmed]**

- `AppModule` imports nine feature modules and three global infrastructure modules. `PrismaModule` and `S3Module` are `@Global()`; `RabbitMQModule` is not (imported by books, summarizer, health).
- Controllers use a custom `@ApiEndpoint` decorator (`src/common/api-endpoint.decorator.ts`) that bundles Swagger metadata and the JWT guard. Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`. Global `ThrottlerGuard` (10/s, 100/min, 1000/h per IP).
- **Cross-module imports** (only three, via `grep "from '@/modules/"`):
  - `dictionary → learning` (`dictionary.module.ts`, `dictionary.service.ts`, `dictionary.controller.ts`): dictionary entries create learning cards.
  - `summarizer → books` (`summarizer.service.ts` imports `BOOK_WITH_RELATIONS`, `convertBookToResponse`, `BOOK_ERROR_MESSAGES`; `summarizer.models.ts` has `SummaryResponse extends BookResponse`).
  - Nothing imports learning or dictionary from books, summarizer, highlights, notes, auth or users.
- **Learning's data dependencies on the reader** are Prisma lookups, not imports: `learning.service.ts` validates `bookId` and `highlightId`, and `createNoteFromHighlight` reads `Highlight` (lines 103–209). The client never calls the from-highlight endpoint from any reader UI.
- **Logging.** `PinoLoggerService` exists but is never injected and `app.useLogger` is never called; services use Nest's default `Logger`. `RequestLoggerMiddleware` creates a second pino instance and a request id that is not propagated anywhere.
- **Health.** `/health/ready` checks the DB with `SELECT 1`; the storage and queue checks only test that the services were injected (`health.controller.ts` lines 96–126). `RabbitMQService.isConnected()` exists but is unused.
- **Tests.** Unit specs exist only for learning plus one e2e. Removing learning removes every backend test. The summarizer path has no tests at any layer.

### 1.5 Data model and migrations **[confirmed]**

Source of truth: `readwise-shared/prisma/schema.base.prisma`. `sync-prisma.sh` prepends a generator block and copies the models into `readwise-gateway/prisma/schema.prisma` and `readwise-workers/schema.prisma`. Both generated files currently match the base exactly (verified with `diff`).

Ownership by table:

| Owner (today) | Tables | Notes |
|---|---|---|
| Platform / auth | `User`, `RefreshToken` | only tables with real migrations |
| Reader + summarizer (shared) | `Book` | 27 columns mixing file metadata, reading progress, summarizer outputs (`summaryStorageKey`, `extractionStorageKey`, `summaryType`, `summarizationStrategy`) and a shared `status` |
| Reader | `Note`, `Highlight` | FK to Book, soft delete |
| Half-built | `Tag`, `BookTag`, `NoteTag`, `HighlightTag` | no API endpoints exist; `BookResponse.tags` is returned and rendered in `BookProfile.tsx` and `LastReadCard.tsx` |
| Learning (Anki) | `LearningNote`, `LearningCard`, `CardReview`, `LearningSession`, `UserLearningStats`, `UserLearningSettings` + enums `NoteSourceType`, `CardType`, `CardState`, `ReviewRating` | `LearningNote` FKs to Book, Highlight, DictionaryEntry (all `SetNull`) |
| Dictionary | `DictionaryEntry`, `Collocation`, `SemanticGroup`, `EntrySemanticGroup`, `SynonymGroup`, `EntrySynonymGroup` | |

Migrations: `readwise-gateway/prisma/migrations/` contains three migrations from 2025-08-10 that create, drop and recreate only `User` and `RefreshToken`. Every other table was created by `prisma db push`, which both Docker entrypoints run at startup. The gateway uses Prisma 6.13; prisma-client-py 0.11.0 bundles its own, older engine **[assumption]**. Because the data is disposable **[survey]**, the fix is a fresh initial migration and a database reset, not a baseline.

Two further inconsistencies: `PrismaService` builds its connection URL from `POSTGRES_*` and hard-codes port 5432, while the entrypoint's `db push` reads `DATABASE_URL`. `scripts/merge-and-migrate.js` reads `src/models/*.prisma`, a directory that does not exist.

### 1.6 API structure and communication **[confirmed]**

Gateway routes (all under `/api`, JWT bearer unless noted):

| Module | Routes |
|---|---|
| auth | `POST register`, `login`, `refresh` (public); `GET me`; `POST logout` |
| users | `PATCH users/me` |
| books | `POST books/upload` (multipart, fields `book`, `cover`), `GET books`, `GET books/:id`, `GET :id/download`, `GET :id/cover`, `POST last-accessed`, `time-spent`, `favorite`, `reading-position`, `DELETE :id` |
| summarizer | `POST summarizer/request`, `POST summarizer/summary`, `GET summarizer/status/:bookId` |
| highlights | `GET/POST books/:bookId/highlights`, `PATCH/DELETE highlights/:id` |
| notes | `GET/POST books/:bookId/notes`, `GET/PATCH/DELETE notes/:id` |
| learning | 18 routes |
| dictionary | 28 routes |
| health | `GET health`, `GET health/ready` (no throttle) |

Browser → Next.js BFF (`/api/...`, cookies) → gateway (`API_URL/api/...`, bearer). Binary files flow S3 → gateway stream → BFF **buffered as `arraybuffer`** (`lib/api/endpoints/books.ts`, `app/api/books/[id]/download/route.ts`) → browser. Uploads flow browser `XMLHttpRequest` → BFF `formData` → gateway `FileFieldsInterceptor` with **no `limits`** (in-memory multer) → S3. `BOOK_CONSTRAINTS.MAX_BOOK_SIZE` (1 GB) is defined but never applied. On a self-hosted single host this is a memory concern, not a platform limit.

Swagger is served at `/api/docs` in all environments. OpenAPI/SDK generation exists (`scripts/generate-openapi.ts`, `scripts/release-sdk.sh` pushing to a separate GitHub repo) but no package depends on the result; `vercel.json` still writes a GitHub token into git credentials to install it.

### 1.7 Background processing pipeline **[confirmed]**

```
UI "Generate summary"
  → POST /api/summarizer (BFF) → POST /summarizer/request (gateway)
  → SummarizerService.requestSummary: if Book.summaryStorageKey exists, return early
  → RabbitMQService.publishSummaryRequest → queue "extract_request"
      message: { messageId, type:'summary_request', version:1, userId, bookId,
                 summaryPercent:0.4, summarizationType, summarizationStrategy,
                 requestedAt, autoSummarize:true }
Extraction worker (queue extract_request, prefetch 1, asyncio.run per message)
  → Book.status = processing → download from bucket "books" → pdfplumber / ebooklib
  → upload markdown to bucket "extractions" → Book.extractionStorageKey, status = ready
  → publish to "summary_request": { bookId, task:'summarize', summaryType, summaryPercent }
Summarization worker (queue summary_request)
  → idempotency: skip if summaryStorageKey && summaryType match
  → Book.status = processing → DeterministicSegmenter (Ollama embeddings + LLM JSON)
  → PipelineBuilder preset (PIPELINE_MODE fast|balanced|quality) → async pipeline
     with per-section checkpoints in bucket "checkpoints"
  → upload JSON to bucket "summaries" → Book.summaryStorageKey/summaryType, status = ready
  → on exception: Book.status = error, errorMessage; message nack(requeue=False)
UI polls GET /api/summarizer/status/:bookId every 3 s (Processing.tsx) with a simulated progress bar
```

Infrastructure facts: no dead-letter exchange, so a nacked message is lost. Python heartbeat is disabled (`RABBITMQ_HEARTBEAT=0`) to survive long LLM calls. Bucket names are hard-coded in Python (`books`, `extractions`, `summaries`, `checkpoints`) and env-configured in the gateway; the gateway has no setting for `extractions` or `checkpoints`. The pipeline reaches Ollama over the network on a host you start by hand, and a single book can take up to 12 hours **[survey]**.

**Long deliveries and the broker timeout [assumption, verify in your RabbitMQ config].** RabbitMQ 3.8.17+ closes a channel whose consumer has held a delivery unacknowledged longer than `consumer_timeout`, which defaults to 30 minutes, and redelivers the message. The summarization worker acknowledges only after the whole job, so a multi-hour job would be interrupted every 30 minutes, reconnected by the retry loop in `messaging.py`, and resumed from the S3 checkpoint. The checkpoint mechanism may be masking this today. `readwise-infra/docker-compose.yml` mounts no `rabbitmq.conf`, so the default applies unless it was changed on the host. The target design in §2.9 removes the dependency on long unacknowledged deliveries entirely.

The Python pipeline itself is the best-structured code in the repo: protocols in `core/protocols.py`, dataclasses in `core/models.py`, settings via pydantic (`config/settings.py`, `config/feature_flags.py`), a fluent `PipelineBuilder`, five strategies, validation loop, hierarchical merge, S3 checkpoint/resume. It is preserved as-is and only repackaged. The legacy path (`text_summarizer.py`, `llm_client.py`, `USE_NEW_PIPELINE=false`) is still instantiated on every start and still owns `save_summary_to_s3`; since the flag is never set **[survey]**, the legacy path is dead code and is deleted in Phase 2 after moving `save_summary_to_s3` to the storage helper.

### 1.8 Authentication, configuration, deployment

- **Auth [confirmed].** Email + argon2 password; access JWT (15 min) and refresh JWT (7 d) signed with separate secrets; refresh tokens stored as argon2 hashes. `issueTokens` revokes all existing refresh tokens, so there is one session at a time. `refresh` does not rotate the refresh token. `expiresAt` is hard-coded to 7 days. Secrets are read from `process.env` in `AuthService` and `JwtStrategy`, bypassing the validated `ConfigService`. Tokens are stored by the BFF in `httpOnly` cookies; `middleware.ts` checks cookie presence only (`jose` is a dependency but is never imported). With a single user **[survey]** the single-session behavior is acceptable.
- **Config [confirmed].** `src/config/env.validation.ts` validates required env with class-validator at boot. Three overlapping `.env` files repeat Postgres/S3/RabbitMQ credentials. No `.env.example` files are committed. No `.env` files are tracked in git.
- **Deployment [survey + confirmed].** Everything runs on one Hetzner host in one Docker network. The repository nevertheless contains three separate `docker-compose.yml` files with two networking models (`summarizer_net` bridge for infra and gateway, `network_mode: host` for workers), no Compose service for the client, and no client Dockerfile. Both app entrypoints run `prisma db push`. How the client is currently built and started on the host is not visible in the repository; the plan adds a `web` Dockerfile and a single root Compose file.
- **Observability [confirmed].** Sentry in both apps (5xx only on the gateway). pino configured but not wired as the Nest logger. Python uses `logging.basicConfig` with emoji-prefixed messages and `tqdm` progress bars to stderr. No metrics, no correlation id across the queue hop.

### 1.9 Defects and hidden couplings found during the investigation **[all confirmed]**

1. **The chosen summarization strategy never reaches the summarizer.** The gateway publishes `summarizationStrategy`, but `shared/messaging.py` `send_summary_request` forwards only `bookId`, `task`, `summaryType`, `summaryPercent` (lines 60–68), and the summarization worker falls back to `'structured'` (`summarization-worker/main.py` line 362). `userId` is dropped too. The strategy picker in `GenerateSummaryState.tsx` and `BookProfile.tsx` is therefore cosmetic.
2. **Books whose summarization fails disappear from the library.** `getAllBooks` filters `status notIn [pending, error]` (`books.service.ts` line 122) and the workers write `status = error` on failure.
3. **Extraction files are deleted from the wrong bucket.** `deleteBook` calls `deleteSummaryObject(book.extractionStorageKey)` (summaries bucket), but extractions live in `extractions` (`books.service.ts` lines 271–276 vs `extraction-worker/main.py` line 124). Checkpoints are never deleted on book deletion.
4. **Overloaded `Book.status` causes UI races.** Between a request and the first worker pick-up the status is `ready` with no summary key, so the summary page can fall back to the "Generate" screen after a reload.
5. **`SummaryResponse extends BookResponse`** returns every note, highlight and tag of the book with the summary payload.
6. **`readwise-contracts` describes a different system.** Its request schema requires `v, jobId, userId, input, params`; the real message has none of those fields. Its CI validates `openapi/gateway.v1.yaml`, which does not exist. Nothing imports it.
7. **Unused dependencies and vestigial config.** Client: `jose`, `crypto-js`, `jszip` never imported. Gateway: `@aws-sdk/s3-request-presigner` never used; `S3_PUBLIC_HOST`/`S3_PUBLIC_PROTOCOL` unused. Workers: `OPENAI_API_KEY` unused; per-worker `Dockerfile` and `requirements.txt` duplicate the root ones with version drift (`openai==1.6.1` vs `>=1.12.0`); README describes TF-IDF/OpenAI/HTML output that no longer exists.
8. **Branding drift.** "Summarizer", "Readwise", "readvise", "day-to-day", "summarize-api-sdk". You confirmed the `readwise` names are legacy; the new name is Workbench (§1.12).
9. **Per-IP throttling behind a proxy.** All browser traffic reaches the gateway from the BFF's IP. Harmless for one user.
10. **Duplicate lockfiles.** Root `package-lock.json` plus per-package lockfiles in client, gateway and contracts.

### 1.10 Reader evaluation and the decision taken

Dependencies from the summarizer on reader code:

| Summarizer needs | Where it lives today |
|---|---|
| A document record with `mime`, `fileStorageKey`, `title`, `author` | `Book` table, `BooksService.uploadBook` |
| File upload to S3 and download streaming | `BooksService`, `BookFilesService`, `S3Service`, `UploadProvider`, `app/reader/ingest/upload` |
| Text extraction (PDF/EPUB → markdown in S3) | `extraction-worker` |
| A place in the UI to trigger and view a summary | `app/reader/book/[id]/summary/*`, the dialog inside `BookProfile.tsx` |

Reader-only capabilities with no inbound dependency from the summarizer: viewers, gestures, highlights, notes, reading position, time tracking, favorites/finished flags, cover-style preference.

**Decision [survey answer 9]:** reader and summarizer are one tool. The tool `reader` owns the library, upload, storage keys, extraction, viewers, highlights, notes and summaries. Two internal rules keep it from becoming a tangle: the tool is organized as sub-modules (`documents`, `reading`, `summaries`) and the `summaries` sub-module may depend on `documents` but never on `reading`; and `documents` is written so it can be promoted to `platform/` by a directory move if a second tool ever needs documents. Until then nothing is extracted, because extracting it now would be speculative.

### 1.11 Survey results and remaining assumptions

| # | Question | Answer | Effect |
|---|---|---|---|
| 1 | Where does the client run? | Hetzner, self-hosted | Vercel concerns dropped; add `web` Dockerfile |
| 2 | Where do API, workers, infra run? | Same Docker network on the same host | Single root Compose; remove `network_mode: host` |
| 3 | Production data worth keeping? | No | Fresh initial migration + reset; no backups/exports as prerequisites |
| 4 | Learning/dictionary data to export? | No | Plain drop |
| 5 | Live DB matches schema? | "Should be" | Irrelevant after reset |
| 6 | Ollama availability and job duration | Started by hand; up to 12 h per book; speed is a separate story | `waiting` job state, DB leases; speed work excluded from the refactor (see `docs/pipeline-speed-backlog.md`) |
| 7 | `USE_NEW_PIPELINE` ever false? | Unknown flag, so never set | Delete legacy pipeline in Phase 2 |
| 8 | Users | Only you | Auth hardening stays optional |
| 9 | Reader as separate optional tool? | No, one solid feature with the summarizer | One tool `reader` |
| 10 | Python DB-free vs writing to Postgres? | Asked for a recommendation | DB-free Python; only the API codebase owns the schema (§2.9, D8) |
| 11 | Topology | Single host | Compose + Caddy |
| 12 | Rename packages? | Yes; `readwise` names are legacy | `apps/web`, `apps/api`, `apps/workers`; name chosen: Workbench (§1.12) |
| 13 | URL scheme | Everything under `/apps/` | `/apps/<toolId>/...` |
| 14 | Next tool runtime | Node-side most likely | Node job runner inside the API codebase from Phase 4 |
| 15 | Git workflow | Commits to main, solo | Tag per phase, CI on push |

Still open: the RabbitMQ `consumer_timeout` value on the host (only matters until Phase 4 removes long unacknowledged deliveries).

### 1.12 Name

The toolbox is called **Workbench**. It was chosen because it says what the product is (one place where personal tools are kept and used), it is neutral across any future tool domain, it reads well as a page title and PWA name, and it is short enough for technical identifiers. Collisions with unrelated commercial products do not matter for a private, self-hosted application. Where it appears:

| Use | Value |
|---|---|
| Repository directory and GitHub repository | `workbench` (rename of `readvise` / `LyubomyrKl/readwise`, whenever convenient) |
| npm package scope | `@workbench/web`, `@workbench/api`, `@workbench/contracts`, `@workbench/api-types` |
| Python distribution | `workbench-workers` (import name stays `worker`) |
| Containers and Compose project | `workbench-api`, `workbench-workers`, `workbench-web`, `workbench-db`, `workbench-minio`, `workbench-rabbitmq`, `workbench-caddy` |
| Docker network | `workbench_net` |
| RabbitMQ exchanges | `workbench.jobs`, `workbench.job-events` |
| PWA manifest, page titles, Swagger title | "Workbench" |
| Service-worker cache | `workbench-v1` |

If you prefer another name, every occurrence is one search-and-replace. Two alternates that also fit: "Satchel" (characterful, nods to the reading origin) and "Klym" (a personal brand from your surname).

---

## 2. Target architecture

### 2.1 Shape: a modular monolith with two job runtimes

Keep exactly three deployables and three infrastructure services on the one host:

| Deployable | Role in the toolbox |
|---|---|
| `web` (Next.js) | Application shell (dashboard, navigation, settings, auth pages) and one UI package per tool. One build, one container. |
| `api` (NestJS) | Platform modules (auth, users, storage, queue, jobs, health) and one NestJS module per tool. Also hosts the Node job runner. One process, one database connection pool, one OpenAPI document. |
| `workers` (Python) | One process that consumes Python job queues. Platform code (consumer, S3, job events, settings, LLM client) plus one handler package per tool that needs Python. The summarization pipeline moves here unchanged. |

Why not split further: single developer, personal use, about 45k lines, and the only component with a different runtime profile (Python, heavy native deps, long LLM calls) is already separate. The couplings that hurt today are inside the processes and are fixed by module boundaries, not by processes.

Why not a single Node process with in-process jobs only: the AI pipeline is Python and stays Python. RabbitMQ already works for it. The next tool being Node-side **[survey]** is handled by a Node consumer of the same queue system inside the API codebase, not by a new service.

### 2.2 Vocabulary

- **Platform**: code every tool may depend on. Owns users, auth, file storage, the job system, configuration, logging, health, and the shell UI.
- **Tool**: a self-contained feature with its own UI routes under `/apps/<id>`, API module, optional job handlers (Node or Python), optional database tables, and a manifest. Depends on the platform only. Never imports another tool.
- **Registry**: the static list of tool manifests that the shell reads to render navigation, dashboard cards and settings sections.

Naming: the repository's deployables live in `apps/*`; inside each deployable, tools live in `src/tools/*` (web, api) or `worker/tools/*` (Python); in the browser, tools are mounted at `/apps/<id>`. The word "apps" is used for the URL and for deployables, "tools" for source directories, so the two levels never collide.

Dependency rule, enforced by lint and by NestJS module imports:

```
web:     src/tools/* → src/platform/*, components/ui/*     (never tools → tools)
api:     src/tools/* → src/platform/*                       (never platform → tools)
workers: worker/tools/* → worker/platform/*                 (never platform → tools)
```

### 2.3 Application shell (web)

Responsibilities: layout, sidebar and app switcher, dashboard, settings hub, auth pages, offline/PWA chrome, theme, toasts, error boundary.

- `src/platform/shell/registry.ts` exports `TOOLS: ToolManifest[]`, statically imported from each tool's `manifest.ts`. It starts with one entry. Build the shell against the interface anyway, because the second tool is already planned.
- `ToolManifest`, kept deliberately small:

  ```ts
  interface ToolManifest {
    id: string;                 // "reader"; also the URL segment under /apps/
    name: string;               // "Reader"
    description: string;        // dashboard card text
    icon: LucideIcon;
    nav: NavItem[];             // sidebar entries while inside the tool (hrefs relative to /apps/<id>)
    actionButton?: ActionButton;
    settings?: { title: string; href: string }[];   // sections contributed to /settings
    enabled?: boolean;          // env-driven feature flag; default true
  }
  ```

- The shell derives from the registry: app switcher items, dashboard cards, `/settings` sections, protected prefixes in `middleware.ts` (`/apps`, `/settings`), and the current tool (`pathname.startsWith('/apps/' + id)`).
- One shell layout at `app/(shell)/layout.tsx` replaces the four copies of the sidebar layout. Full-screen surfaces (the PDF/EPUB viewer, the summary reader) opt out with a nested layout inside the tool's own route segment, replacing the regex check in today's `app/reader/layout.tsx`.
- Global providers shrink to Theme, Offline, Motion, Toaster and (optionally) a query client. `UploadProvider`/`UploadWidget` and `BookCoverProvider` move into the reader tool and mount under `/apps/reader`.

### 2.4 Tool architecture (web)

Each tool lives in `src/tools/<id>/` with a fixed internal layout:

```
src/tools/reader/
  manifest.ts          # ToolManifest
  api.ts               # typed functions over platform/api/http (no global registry)
  types.ts             # request/response types (generated or hand-written)
  documents/           # library grid, upload queue, document detail, covers
  reading/             # PDF/EPUB viewers, gestures, highlights, notes, reading session
  summaries/           # generate dialog, processing view, summary reader
  pages/               # page components imported by thin route files
```

Route files under `app/(shell)/apps/reader/**/page.tsx` are one-liners that import from `src/tools/reader/pages`. Proposed routes:

| Route | Page |
|---|---|
| `/apps/reader` | library (was `/reader/library`) |
| `/apps/reader/upload` | upload (was `/reader/ingest/upload`) |
| `/apps/reader/book/[id]` | document profile (was `/reader/book/[id]/profile`) |
| `/apps/reader/book/[id]/read` | viewer, full screen (was `/reader/book/[id]/reader`) |
| `/apps/reader/book/[id]/summary` | summary reader, full screen (was `/reader/book/[id]/summary`) |
| `/apps/reader/book/[id]/summary/[summaryId]` | a specific summary once several exist |

Adding a tool: create `src/tools/<id>` with a manifest, add one line to `registry.ts`, add route files under `app/(shell)/apps/<id>/`. Removing a tool: delete the directory, remove the line, delete the route files.

### 2.5 Shared services (platform, all three deployables)

| Service | web | api | workers |
|---|---|---|---|
| Auth | cookie routes (`/api/auth/*`), `useSession`, middleware | `platform/auth` (JWT, refresh tokens), `platform/users` | n/a (job envelope carries `userId`) |
| Storage | n/a | `platform/storage`: one `StorageService` with a bucket registry from env (`documents`, `covers`, `extractions`, `summaries`, `checkpoints`) and optional presigned URLs | `platform/storage` (boto3 wrapper, same bucket names from the same env) |
| Jobs | `useJob(jobId)` hook, `JobStatus` component, `/settings/jobs` list | `platform/jobs`: `Job` table, `enqueue`, status API, event consumer, Node runner, stale-job sweep | `platform/jobs`: consumer loop, handler registry, `emit_started/progress/waiting/succeeded/failed` |
| Queue | n/a | `platform/queue`: topic exchange publish/consume, DLX setup | `platform/queue` |
| LLM access | n/a | `platform/ai` (added when the first Node tool needs it): thin client for Ollama's OpenAI-compatible endpoint, provider switchable by env | `platform/llm`: the existing `AsyncLLMClient`, moved up from the summarizer |
| Config | typed env (`src/platform/config.ts`) | env schemas per concern merged into one validated object | pydantic settings per concern |
| Logging/errors | Sentry, error boundary | pino as the Nest logger, request id, Sentry | JSON logging with `jobId`, Sentry optional |

Documents (upload, metadata, extraction) are deliberately not in this table: they belong to the reader tool until a second tool needs them (§1.10).

### 2.6 Backend architecture (api)

```
src/
  main.ts                  APP_MODE=api | worker | all (same image, see 2.9)
  app.module.ts            imports PlatformModule + TOOL_MODULES
  tool-registry.ts         TOOL_MODULES = [ReaderModule]
  platform/
    config/                env schemas (db, storage, queue, auth, server, jobs)
    db/                    PrismaModule (global)
    storage/               StorageService, bucket registry
    queue/                 QueueModule: publish(routingKey, msg), consume(queue, bindings, handler), DLX
    jobs/                  JobsModule: JobsService (enqueue, claim, heartbeat, complete, fail, sweep),
                           JobsController (GET /jobs/:id, GET /jobs?subjectType=&subjectId=&status=),
                           JobEventsConsumer (Python results), NodeJobRunner (in-process handlers)
    auth/, users/, health/, common/
  tools/
    reader/
      reader.module.ts            imports StorageModule, JobsModule, QueueModule
      documents/                  controller (/reader/documents...), service, files service, extraction trigger
      reading/                    highlights, notes, reading progress
      summaries/                  controller (/reader/documents/:id/summaries...), service, Summary repository,
                                  job-event hooks for reader.extract and reader.summarize
```

Rules:

- A tool module may import platform modules. Platform modules never import tool modules. `app.module.ts` is the only file that knows the tool list.
- A tool owns its tables and only writes to its tables. Inside the reader, `summaries` reads documents through `DocumentsService`, not raw Prisma on `Book`.
- Every tool controller is mounted under `/<toolId>/...` (`/reader/documents`, `/reader/documents/:id/summaries`). Platform controllers keep short paths (`/auth`, `/jobs`).
- Responses are DTO classes with Swagger decorators (already the convention), so the OpenAPI document stays complete and can drive the typed client.

### 2.7 Data architecture

One PostgreSQL database, one Prisma schema split into files, one migrations directory, one codebase that writes.

- **Schema files.** Prisma's schema folder (`apps/api/prisma/schema/*.prisma`, generally available since Prisma 6.7; the gateway is on 6.13). One file per owner: `platform.prisma` (User, RefreshToken, Job), `reader.prisma` (Book, Note, Highlight, Summary, and the tag tables if kept). This removes `sync-prisma.sh` and both generated copies.
- **Naming.** Tool tables carry a prefix via `@@map` (`reader_book`, `reader_note`, `reader_highlight`, `reader_summary`). Because the data is disposable **[survey]**, this is a free rename done in the initial migration; nothing needs to stay named `Book`. Platform tables keep plain names (`User`, `RefreshToken`, `Job`).
- **Isolation.** Ownership by convention, lint and review; one Postgres schema. Tool tables may reference platform tables (`reader_book.userId → User.id ON DELETE CASCADE`). Platform tables never reference tool tables. Prisma's multi-schema support is still a preview feature in 6.x **[assumption]** and separate databases buy nothing here.
- **Migrations.** `prisma migrate` with a single fresh `0001_init` generated from the cleaned schema in Phase 1 (old migrations and `db push` deleted; database reset once). Every later change is a committed migration applied by a one-shot `migrate` Compose service before `api` starts. Python never runs Prisma again after Phase 4.
- **`Book` slimming.** Summarizer columns (`summaryStorageKey`, `summaryType`, `summarizationStrategy`) move to `reader_summary`. `extractionStorageKey` stays on the book. Reading-progress columns stay on the book because the same tool owns both; moving them to a separate table is optional hygiene. `Book.status` shrinks to file state (`ready | error`); pipeline state lives in `Job`.

Proposed `Job` and `Summary` models:

```prisma
model Job {
  id            String    @id @default(cuid())
  type          String    // "reader.extract" | "reader.summarize" | ...
  toolId        String    // "reader"
  userId        String
  subjectType   String?   // "book"
  subjectId     String?
  status        JobStatus @default(queued)  // queued | running | waiting | succeeded | failed | cancelled
  stage         String?   // free text shown in the UI, e.g. "segmenting", "section 3/12"
  progress      Int       @default(0)
  payload       Json
  result        Json?
  error         String?
  attempts      Int       @default(0)
  maxAttempts   Int       @default(3)
  workerId      String?
  heartbeatAt   DateTime?
  parentJobId   String?
  correlationId String?
  createdAt     DateTime  @default(now())
  startedAt     DateTime?
  finishedAt    DateTime?
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, status, createdAt])
  @@index([subjectType, subjectId])
  @@index([status, heartbeatAt])
}

model Summary {
  id          String   @id @default(cuid())
  bookId      String
  userId      String
  type        SummaryType
  strategy    SummarizationStrategy
  percent     Float
  storageKey  String?            // null until the job succeeds
  jobId       String?
  createdAt   DateTime @default(now())
  book        Book     @relation(fields: [bookId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([bookId, createdAt])
  @@map("reader_summary")
}
```

### 2.8 Frontend architecture details

- **Routing.** `app/(auth)/*`, `app/(shell)/page.tsx` (dashboard), `app/(shell)/settings/**`, `app/(shell)/apps/<toolId>/**`. `next.config.ts` adds `redirects()` from the old `/reader/...` URLs.
- **Data layer.** `src/platform/api/http.ts` exposes `apiFetch<T>(path, init)` that calls the generic proxy and handles 401 → refresh → retry. Each tool's `api.ts` builds typed functions on it. The global `ApiRegistry` in `lib/fetcher.ts` is deleted. Types come from the API's OpenAPI document generated into `packages/api-types` with `openapi-typescript`, or are hand-written per tool if generation proves noisy.
- **Server state.** TanStack Query is recommended for fetching, caching, invalidation and job polling, replacing the `fetchedRef` pattern. Optional; the hand-rolled hooks keep working if you skip it.
- **UI state.** Local component state and small contexts inside the owning tool. No global store.
- **Lazy loading.** Route segments are already split. Keep heavy viewers behind `dynamic(..., { ssr: false })`.
- **Shared components.** `components/ui/*` (shadcn) and `src/platform/ui/*` (sidebar, page header, empty state, confirm dialog, job status).

### 2.9 Job infrastructure and the AI pipeline

Goal: keep the Python pipeline byte-for-byte, change only how work arrives, how progress is tracked, and how results are reported. Design constraints from the survey: jobs can run 12 hours, the LLM host is started by hand, and the next tool's handlers will be Node.

**Envelope and topology.**

- A tool's API service creates a `Job` row, then publishes `{ v:1, jobId, type, toolId, userId, correlationId, payload }` to the topic exchange `workbench.jobs` with routing key `jobs.<toolId>.<type>`.
- Queues: `q.py.reader` (Python, bound to `jobs.reader.extract` and `jobs.reader.summarize`); `q.node.default` (Node runner, bound to whatever routing keys its registered handlers declare). Each queue has a dead-letter exchange and a `.dlq` queue.
- Events: workers publish `job.started`, `job.progress`, `job.waiting`, `job.succeeded`, `job.failed` to `workbench.job-events`; the API consumes `q.api.job-events`, updates the `Job` row, and calls the owning tool's `onJobEvent` hook (registered by the tool module at startup) to persist tool-specific results, for example `Summary.storageKey`.
- Node handlers run inside the API codebase and call `JobsService` directly for the same transitions, so both runtimes share one state machine and one set of hooks.

**Long-running jobs: lease instead of unacknowledged delivery.**

- The Python consumer receives a message, emits `job.started` (which records `workerId`, `startedAt`, `heartbeatAt`), and **acknowledges immediately**. The database row is now the source of truth; the broker's `consumer_timeout` no longer matters.
- While working, the handler emits `job.progress` at least every few minutes (the `SummarizationProgress` callbacks already fire per chunk); each event refreshes `heartbeatAt`.
- `JobsService.sweep()` runs on a timer in the API: `running` jobs whose `heartbeatAt` is older than the lease (15 minutes) are re-published if `attempts < maxAttempts`, otherwise marked `failed` with "worker lost". Handlers are idempotent and checkpointed, so re-execution resumes from the last completed section.
- The old `extract_request` → `summary_request` chain stays, formalized: the summaries service creates both Job rows up front (`reader.summarize` with `parentJobId` = the extract job) and publishes the extract job; the documents hook stores `extractionStorageKey` on `job.succeeded` and publishes the child. The UI shows real stages ("extracting", "segmenting", "section 3/12") from `Job.stage` and `progress` instead of the simulated bar in `Processing.tsx`.

**LLM host started by hand.**

- Before starting and whenever an LLM call fails with a connection error, the summarize handler probes Ollama (`GET /api/tags`). If unreachable, it emits `job.waiting` with the reason, sleeps with backoff (30 s up to 5 min), keeps heartbeating, and retries. The job shows as "Waiting for LLM host" in the UI rather than failing. With `prefetch=1` and a single user, blocking the worker on this job is acceptable.
- A `waiting` job can be cancelled from the UI (`POST /jobs/:id/cancel`); the handler checks for cancellation between sections.

**Timing data (the only overlap with the separate speed track).** The API stores `startedAt`/`finishedAt` per job and `job.progress` events carry `stage`; with extract and summarize as separate jobs this yields per-stage durations without extra work. Nothing in this plan tunes the pipeline; that is tracked in `docs/pipeline-speed-backlog.md`.

**Idempotency and resume.** Unchanged: the summarization handler keeps the S3 checkpoint keyed by `bookId + type` (or `summaryId` once summaries are rows), and the API refuses to enqueue a second active summarize job for the same book and options.

**Message contract.** JSON Schema files in `packages/contracts/jobs/` for the job envelope and the event envelope, with shared fixtures tested by a pydantic model on the Python side and a zod schema on the TypeScript side. Not published anywhere.

**Worker packaging.** One Python package (`pyproject.toml`), one Dockerfile, `python -m worker --queues reader`. `main.py`'s subprocess spawning goes away; the two handlers run in one consumer loop. `AsyncLLMClient` and its settings move to `worker/platform/llm` so a future Python tool can call Ollama without importing the reader.

**Node runner.** `platform/jobs/node-runner` discovers handlers registered by tool modules (`@JobHandler('tool.type')` or an explicit `registerHandler` call), binds their routing keys to `q.node.default`, and dispatches. It runs inside the API process when `APP_MODE=all` (default on the single host). If a Node job ever hogs the event loop, start a second container from the same image with `APP_MODE=worker`; no code changes.

### 2.10 Extensibility: adding, configuring and removing a tool

Adding "tool X":

1. `apps/web/src/tools/x/` with `manifest.ts`, `api.ts`, `pages/`; one line in `registry.ts`; route files under `app/(shell)/apps/x/`.
2. `apps/api/src/tools/x/` with a NestJS module; one line in `tool-registry.ts`; `prisma/schema/x.prisma` with `@@map("x_*")` tables; one migration.
3. Optional Node jobs: register handlers in the module; they run in the API's runner. Optional Python jobs: `apps/workers/worker/tools/x/handlers.py` and a queue binding.
4. Optional `settings` entries in the manifest.

Configuring: a tool reads its own env keys via the platform config helpers (`READER_*`, `X_*`). Per-user preferences live in a tool-owned table or in a generic `UserPreference(userId, toolId, key, value)` platform table, added only when a second tool needs it.

Removing: delete the three directories, remove the two registry lines, add a migration that drops the tool's tables. Platform code does not change.

### 2.11 Deployment and operations (single Hetzner host)

- **Topology.** One root `docker-compose.yml`: `db`, `minio`, `rabbitmq`, `migrate` (one-shot), `api`, `workers`, `web`, `caddy` (TLS, routes `/api/*` to `api`, everything else to `web`), `backup` (optional given disposable data, but cheap). One named network; the workers' `network_mode: host` goes away.
- **Environment.** One `.env.example` per service; the API and workers read `DATABASE_URL`, `AMQP_URL`, `S3_ENDPOINT`, bucket names and `OLLAMA_BASE_URL` from the same Compose `env_file`.
- **Migrations.** `migrate` runs `prisma migrate deploy`; `api` and `workers` depend on it with `condition: service_completed_successfully`. No `db push` anywhere.
- **Observability.** pino JSON logs as the Nest logger with `requestId`/`jobId`/`toolId`; Python JSON logs with the same fields; Sentry stays; `docker compose logs` is sufficient. Real readiness checks. RabbitMQ management UI for queue depth and DLQ size. A jobs list in the UI (`/settings/jobs` or on the dashboard) showing running, waiting and failed jobs with retry and cancel.
- **CI.** Root GitHub Actions on push to `main`: `npm ci`, `turbo run lint typecheck test build`, `pytest`, `prisma validate`, `prisma migrate diff --from-migrations --to-schema-datamodel` to catch drift, Docker builds. Deploy by `git pull && docker compose up -d --build` on the host; tag each finished phase (`phase-1`, `phase-2`, ...) so rollback is a checkout.
- **Security hardening** (independent of the restructure): multer `limits.fileSize`, `helmet`, Swagger disabled or behind basic auth in production, JWT config via `ConfigService`, delete the `vercel.json` install command and rotate the token it used.

### 2.12 Is anything worth separating into its own service?

No. The Python workers are already a separate deployable because of runtime, and the Node runner shares the API image. The Ollama host is already external. Every other concern belongs in the single NestJS process. If a future tool needs yet another runtime, it joins as another consumer of `workbench.jobs`; the job system is the only extension seam that crosses process boundaries, deliberately.

---

## 3. Before-and-after structure

### 3.1 Current structure (condensed, confirmed)

```
readvise/
├── readwise-client/                      Next.js ("day-to-day")
│   ├── app/
│   │   ├── (components)/ (providers)/ (consts)/routes.ts
│   │   ├── api/{auth,books,highlights,notes,summarizer,learning,dictionary}/**/route.ts   ~70 files
│   │   ├── auth/{login,register}
│   │   ├── reader/{layout,library,ingest/upload,book/[id]/{profile,reader,summary}}
│   │   ├── learning/{study,notes,stats,settings}       ← remove
│   │   ├── dictionary/{[id],new,groups,synonyms}       ← remove
│   │   └── settings/{appearance,reader,learning,account}
│   ├── components/{AppSwitcher,MobileSidebar,ui/*}
│   ├── hooks/{useBookMutations,useReadingSession,useHighlights,useNotes,useCoverGradient,use-mobile,useLearning*,useDictionary*}
│   ├── lib/{api/client.ts, api/endpoints/*, fetcher.ts, types/*, bookParser.ts, utils.ts}
│   └── middleware.ts, public/sw.js, public/manifest.json, vercel.json*
├── readwise-gateway/                     NestJS
│   ├── src/modules/{auth,users,books,summarizer,highlights,notes,health,learning*,dictionary*}
│   ├── src/infrastructure/{prisma,s3,rabbitmq}
│   ├── src/common/, src/config/env.validation.ts
│   ├── prisma/{schema.prisma (generated), migrations/ (3, auth only)}
│   ├── scripts/{generate-openapi.ts, release-sdk.sh*, merge-and-migrate.js*}
│   ├── Dockerfile, docker-compose.yml, docker-entrypoint.sh (db push)
├── readwise-workers/                     Python
│   ├── main.py (spawns 2 subprocesses), entrypoint.sh (db push), Dockerfile, requirements.txt
│   ├── shared/{database.py (Prisma), messaging.py, s3_storage.py}
│   ├── workers/extraction-worker/{main.py, pdf_extractor.py, epub_extractor.py, Dockerfile*, requirements.txt*}
│   ├── workers/summarization-worker/{main.py, text_summarizer.py*, llm_client.py*, progress.py,
│   │     checkpoint/ chunking/ compression/ config/ context/ core/ formatting/ llm/
│   │     orchestration/ segmentation/ summarization/ validation/, Dockerfile*, requirements.txt*}
│   └── schema.prisma (generated)
├── readwise-shared/prisma/schema.base.prisma
├── readwise-contracts/                   ← delete
├── readwise-infra/{docker-compose.yml (db, minio, rabbitmq), .env}
├── sync-prisma.sh                        ← delete
└── package.json, turbo.json              (* = vestigial / duplicate / dead)
```

### 3.2 Proposed structure

```
workbench/                                 (repository; renamed from readvise)
├── package.json, turbo.json, .nvmrc, .editorconfig, .prettierrc (root)
├── docker-compose.yml                    db, minio, rabbitmq, migrate, api, workers, web, caddy, backup
├── docker-compose.dev.yml                dev overrides (bind mounts, exposed ports)
├── .github/workflows/ci.yml              lint, typecheck, test, pytest, migrate diff, docker build
├── docs/                                 this plan, runbooks (deploy, add-a-tool, restore)
│
├── apps/
│   ├── web/                              Next.js (was readwise-client)
│   │   ├── Dockerfile                    next build with output: 'standalone'
│   │   ├── app/
│   │   │   ├── (auth)/login, register
│   │   │   ├── (shell)/layout.tsx        sidebar + switcher from registry
│   │   │   ├── (shell)/page.tsx          dashboard: tool cards, continue reading, recent/failed jobs
│   │   │   ├── (shell)/settings/**       hub + per-tool sections from registry + jobs list
│   │   │   ├── (shell)/apps/reader/**    thin route files → src/tools/reader/pages
│   │   │   ├── api/auth/{login,register,logout,refresh}/route.ts   cookie-setting routes (kept)
│   │   │   └── api/gw/[...path]/route.ts                           generic authenticated proxy
│   │   ├── src/platform/
│   │   │   ├── shell/        registry.ts, ToolManifest.ts, AppSidebar, AppSwitcher, Dashboard, SettingsHub
│   │   │   ├── api/          http.ts (apiFetch + refresh), auth.ts, cookies.ts
│   │   │   ├── jobs/         useJob, useJobs, JobStatus, JobsList
│   │   │   ├── ui/           PageHeader, EmptyState, ConfirmDialog, MobileSidebar
│   │   │   └── config.ts, routes.ts (platform routes only)
│   │   ├── src/tools/reader/
│   │   │   ├── manifest.ts, api.ts, types.ts, routes.ts
│   │   │   ├── documents/    library grid, filters, upload provider + queue, document profile, covers, bookParser
│   │   │   ├── reading/      PDFReader, EPUBReader, menus, gestures, HighlightPopover, NotesPanel, hooks
│   │   │   ├── summaries/    GenerateSummary, JobProgress, SummaryReader, SummaryPage
│   │   │   └── pages/
│   │   ├── components/ui/    shadcn primitives (unchanged)
│   │   ├── middleware.ts     protected prefixes: /apps, /settings
│   │   ├── public/           manifest.json, sw.js (renamed cache), icons
│   │   └── eslint.config.mjs boundaries rules
│   │
│   ├── api/                              NestJS (was readwise-gateway)
│   │   ├── Dockerfile                    built from repo root; APP_MODE=api|worker|all
│   │   ├── src/main.ts, app.module.ts, tool-registry.ts
│   │   ├── src/platform/{config,db,storage,queue,jobs,auth,users,health,common}
│   │   ├── src/tools/reader/{reader.module.ts, documents/, reading/, summaries/}
│   │   ├── prisma/schema/{platform,reader}.prisma
│   │   ├── prisma/migrations/0001_init/  fresh history
│   │   └── test/                         e2e per tool + platform
│   │
│   └── workers/                          Python (was readwise-workers)
│       ├── Dockerfile
│       ├── pyproject.toml                single dependency set, entry point `worker`
│       ├── worker/
│       │   ├── __main__.py               `python -m worker --queues reader`
│       │   ├── platform/{settings.py, logging.py, queue.py, storage.py, jobs.py (envelope, events, handler registry, heartbeat), llm/ (AsyncLLMClient, rate limiter, ollama health probe)}
│       │   └── tools/reader/
│       │       ├── extract/{handler.py, pdf_extractor.py, epub_extractor.py}
│       │       └── summarize/{handler.py, segmentation/, chunking/, compression/, context/, core/, formatting/, orchestration/, summarization/, validation/, checkpoint/, config/, progress.py}
│       └── tests/                        handler tests with fake queue/storage/LLM
│
├── packages/
│   ├── contracts/                        JSON Schema + fixtures for job and event envelopes; zod + pydantic mirrors with tests
│   └── api-types/                        generated from the API's OpenAPI (openapi-typescript); consumed by web
│
└── infra/
    ├── caddy/Caddyfile
    ├── rabbitmq/rabbitmq.conf            (only if consumer_timeout must be raised before Phase 4)
    ├── backup/{backup.sh, restore.md}
    └── env/{api.env.example, workers.env.example, web.env.example, infra.env.example}
```

### 3.3 Responsibilities and dependency flow

| Directory | Owns | May depend on | Must not depend on |
|---|---|---|---|
| `apps/web/src/platform` | shell, auth client, jobs UI, http client, shared UI | `components/ui`, `packages/api-types` | `src/tools/*` |
| `apps/web/src/tools/reader` | library, viewers, highlights, notes, summaries UI; typed API functions | `src/platform/*`, `components/ui` | other tools, `app/api/*` internals |
| `apps/web/app` | route files and layouts only | `src/platform`, `src/tools` | business logic |
| `apps/api/src/platform` | auth, users, storage, queue, jobs (incl. Node runner), config, health | Prisma, infra SDKs | `src/tools/*` |
| `apps/api/src/tools/reader` | documents, reading, summaries controllers/services; reader tables | `src/platform/*` | other tools |
| `apps/api/src/tools/reader/summaries` | summaries and their jobs | `../documents` (via its service), platform | `../reading` |
| `apps/workers/worker/platform` | consumer loop, envelope, storage, LLM client, settings | boto3, pika, httpx | `worker/tools/*`, any database |
| `apps/workers/worker/tools/reader` | extract and summarize handlers | `worker/platform/*` | other tools, any database |
| `packages/contracts` | envelope schemas and fixtures | nothing | application code |
| `packages/api-types` | generated TS types | the API's OpenAPI output | hand edits |

Data flow for a summary: `web/tools/reader` → `/api/gw/reader/documents/:id/summaries` (proxy) → `api/tools/reader/summaries` → `platform/jobs.enqueue` (extract + summarize rows) → RabbitMQ `jobs.reader.extract` → `workers/tools/reader/extract` → `job.succeeded` → `api/platform/jobs` consumer → reader `onJobEvent` stores `extractionStorageKey`, publishes `jobs.reader.summarize` → `workers/tools/reader/summarize` (checkpointed, heartbeating, waits if Ollama is down) → `job.succeeded` → reader hook stores `Summary.storageKey` → `web/platform/jobs/useJob` polling → summary reader.

---

## 4. Infrastructure recommendations

### 4.1 Database

| Item | Today | Change | Essential? |
|---|---|---|---|
| Schema management | `db push` from gateway and workers at boot | Delete old migrations; generate `0001_init` from the cleaned schema; `prisma migrate reset` once on the host; `migrate deploy` from a one-shot service thereafter | **Yes** |
| Schema source | `schema.base.prisma` + `sync-prisma.sh` + two generated copies | `apps/api/prisma/schema/*.prisma`, one file per owner; no copies | Yes (after workers drop Prisma) |
| Workers' DB access | prisma-client-py, 4 queries | None; results via job events | Yes (Phase 4) |
| Connection config | `POSTGRES_*` assembled in code, port hard-coded | `DATABASE_URL` only | Yes (small) |
| Pipeline state | `Book.status` | `Job` table with lease/heartbeat | Yes |
| Summary metadata | columns on `Book` | `reader_summary` table | Yes |
| Table names | `Book`, `Note`, `Highlight` | `reader_book`, `reader_note`, `reader_highlight` via `@@map` in the init migration | Yes (free now, costly later) |
| Reading progress | columns on `Book` | keep (same tool) | n/a |
| Tags | 4 tables, no API | drop in the init migration unless you want tagging; re-add as a reader feature later | Recommended drop |
| Backups | none | nightly `pg_dump` + `mc mirror` container | Optional (data is disposable); cheap, so still suggested |

### 4.2 Queue (RabbitMQ)

| Item | Today | Change | Essential? |
|---|---|---|---|
| Topology | two default-exchange queues | topic exchange `workbench.jobs`; `q.py.reader`, `q.node.default`; events exchange `workbench.job-events` with `q.api.job-events` | Yes (Phase 4) |
| Long deliveries | message held unacked for hours; broker `consumer_timeout` likely interrupting every 30 min | ack on claim; DB lease + heartbeat + sweep (§2.9). Until Phase 4, optionally set `consumer_timeout = 86400000` in `infra/rabbitmq/rabbitmq.conf` | Yes (Phase 4); the interim config is optional |
| Failure handling | `nack(requeue=False)`, message lost | DLX per queue → `.dlq`; `attempts`/`maxAttempts` on `Job`; retry button in the UI re-publishes | Yes |
| Message contract | informal, strategy dropped in transit | versioned envelope validated on both sides from `packages/contracts` | Yes |
| Heartbeat | 0 on Python side | can stay 0; with ack-on-claim the connection is idle during work and reconnects are harmless | Optional |
| Back-pressure | prefetch 1 | keep | n/a |

### 4.3 Object storage (MinIO)

| Item | Today | Change | Essential? |
|---|---|---|---|
| Bucket names | hard-coded in Python, env in gateway, extraction bucket unknown to gateway | one bucket registry in env consumed by both runtimes: `documents`, `covers`, `extractions`, `summaries`, `checkpoints` | Yes |
| Key scheme | `${userId}-${timestamp}-${filename}` flat keys | `documents/${userId}/${bookId}/original.ext`, `extractions/${bookId}.md`, `summaries/${summaryId}.json`, `checkpoints/${summaryId}.json`; since data is disposable, no compatibility shim | Yes (cheap now) |
| Deletion | wrong bucket for extractions; checkpoints never deleted | `DocumentsService.delete` deletes from every bucket by registry and cascades to summaries | Yes |
| Transfer path | S3 → API stream → BFF buffer → browser; browser → BFF formData → API memory → S3 | stream through the generic proxy; multer `limits`; `Content-Length` passthrough. Presigned URLs are optional on a single host | Streaming + limits: yes. Presigned: optional |
| Lifecycle | none | MinIO lifecycle rule expiring `checkpoints/*` after 7 days | Optional |

### 4.4 Docker and deployment

- One root `docker-compose.yml` with all services and one named network; delete the three per-package compose files; remove `network_mode: host`.
- Build images from the repository root so the single lockfile and workspace links are honored (`turbo prune --scope=api --docker` or a root-context Dockerfile that copies root + `apps/api` manifests first).
- Add `apps/web/Dockerfile` (`output: 'standalone'`) and a `web` service; delete `vercel.json`.
- `migrate` service: api image, command `npx prisma migrate deploy`, `restart: "no"`; `api` and `workers` depend on it.
- `api` image supports `APP_MODE=api|worker|all`; run `all` on the single host.
- Health checks: API `GET /api/health/ready` with real checks; workers write a heartbeat file touched by the consumer loop and checked by `HEALTHCHECK`.
- Caddy in front of `web` and `api` with automatic TLS (or Tailscale-only exposure; either way one entry point).
- Pin base images and `minio/minio` to a tag instead of `latest`.

### 4.5 CI/CD

- Root workflow on push to `main`: `npm ci` → `turbo run lint typecheck test build` → `pip install -e apps/workers[dev]` + `pytest` → `prisma validate` + `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema --shadow-database-url ...` (fails on drift) → `docker build` for api, workers, web.
- Delete `readwise-contracts/.github/workflows/*`.
- Deploy: `git pull && docker compose up -d --build` on the host after CI is green; a git tag per finished phase.

### 4.6 Observability, logging, error handling

- API: `nestjs-pino` (or `app.useLogger(PinoLoggerService)`) so every log line is JSON with `requestId`, `userId`, `toolId`, `jobId`; `SentryExceptionFilter` stays; consistent error envelope `{ statusCode, message, code, requestId }`.
- Workers: JSON logging with `jobId`, `correlationId`, `toolId`; `tqdm` output replaced by `job.progress` events carrying the same numbers.
- Web: Sentry stays; error toasts show `jobId` so failures can be found in logs; a jobs list with status, stage, duration, retry and cancel.
- Dashboards: RabbitMQ management UI for queues; `GET /jobs?status=failed` on the dashboard. Defer Prometheus/Grafana.

### 4.7 Security

| Item | Change | Essential? |
|---|---|---|
| Upload size | multer `limits: { fileSize }` from config; the proxy enforces the same cap | Yes |
| Headers | `helmet()` in `main.ts` | Yes |
| Swagger | disabled in production or behind basic auth | Yes |
| JWT config | via `ConfigService`; `RefreshToken.expiresAt` derived from `JWT_REFRESH_TTL` | Yes (small) |
| Secrets | delete the `vercel.json` install command; rotate the GitHub token | Yes |
| Proxy hygiene | forward only to `API_URL`; strip hop-by-hop and cookie headers; no path escapes | Yes (Phase 5) |
| Refresh rotation, multi-session, user-keyed throttling | | Optional (single user) |
| MinIO exposure | keep MinIO internal to the Docker network; only `caddy` is exposed | Yes (if not already the case) |

---

## 5. Refactoring roadmap

Guiding rules: the summarizer must work at the end of every phase; every phase ends with green CI and the smoke script; each phase is a sequence of commits on `main` closed by a git tag (`phase-0` … `phase-5`) so rollback is a checkout. Effort figures are rough, for one developer; re-estimate after Phase 0.

| Phase | Goal | Essential? | Rough effort |
|---|---|---|---|
| 0 | Tripwires: characterization tests, smoke script, fix the summarizer defects, two security one-liners | Yes | 1–2 days |
| 1 | Remove learning and dictionary; fresh migration history; database reset | Yes | 1–2 days |
| 2 | Repository and deployment hygiene: renames, single lockfile, root Compose with web + Caddy, CI, delete dead code | Yes | 2–3 days |
| 3 | Front-end shell and tool registry; reader moves under `/apps/reader` | Yes | 3–4 days |
| 4 | Backend platform/tools split; `Job` and `Summary`; DB-free Python workers; Node runner skeleton | Yes | 4–6 days |
| 5 | API layer: generic proxy, per-tool typed client, delete BFF and global registry | Yes | 2–4 days |
| 6 | Optional: TanStack Query, presigned transfers, SSE, AI facade for Node tools | No | as desired |

Total for the essential path: roughly 13–21 days. Phases 3 and 4 are independent and can be interleaved.

### Phase 0: Tripwires (do first)

1. **Characterization tests for the summarizer path:**
   - API e2e (`test/e2e/summarizer.e2e-spec.ts`): with `RabbitMQService` mocked, `POST /summarizer/request` publishes a message containing `bookId`, `summarizationType`, `summarizationStrategy`; a second request on a book with `summaryStorageKey` returns "already exists"; `GET /summarizer/status/:id` maps `status` + `summaryStorageKey` to `isReady`.
   - Worker unit tests (`pytest`): the extraction handler forwards every summary option; the summarization handler skips when a matching summary exists; `Checkpoint` resume logic; `PipelineBuilder` presets. Use fakes for S3, the queue and the LLM client; `core/protocols.py` makes this straightforward.
   - A smoke script (`scripts/smoke-summary.sh`) that logs in, uploads a 2-page PDF, requests a summary with `strategy=two_pass`, polls status, and asserts the stored JSON has sections. Needs Ollama running; run it at the end of every phase.
2. **Fix the defects that affect the summarizer today**, as isolated commits:
   - Forward `summarizationStrategy` and `userId` in `shared/messaging.py` `send_summary_request`.
   - Stop hiding errored books: `getAllBooks` excludes only `pending`; the library card shows an error badge with retry/delete.
3. `helmet()` and multer `limits.fileSize`.
4. Optional, ten minutes: `pg_dump` and `mc mirror` once, so that "disposable" is a choice rather than a surprise.
5. Confirm the name Workbench (§1.12) or replace it everywhere before the Phase 2 renames.

Exit criteria: CI-equivalent commands green locally; smoke script passes; the chosen strategy appears in the summary metadata stored in S3. Tag `phase-0`.

**Outcome (2026-10-24, tag `phase-0`).** Everything except the optional backup landed on `main` as eight commits:

- Tests: `rabbitmq.service.spec.ts` and `summarizer.service.spec.ts` (gateway unit, 16 cases), `test/e2e/summarizer.e2e-spec.ts` (11 cases with Prisma, RabbitMQ, S3 and the JWT guard mocked; run with `npx jest --config ./test/jest-e2e.json test/e2e/summarizer`), and `readwise-workers/tests` (32 cases; run with `scripts/test-workers.sh`, which uses the python:3.11 image and the pinned requirements because this Mac has neither 3.11 nor 3.12). Gateway lint and typecheck are unchanged from before; the three pre-existing errors in `auth.service.ts` remain.
- Fixes: the extraction worker forwards `summarizationStrategy` and `userId`; the summarization worker parses requests through `summary_requests.py` and records the strategy on `Book.summarizationStrategy` and in the S3 object metadata; `GET /summarizer/status/:bookId` returns `summaryType`, `summarizationStrategy` and `errorMessage`; `GET /books` lists `error` books and `BookResponse` carries `errorMessage`; the library card shows a "Summary failed" badge and the book profile shows the error with a "Retry Summary" button; `helmet()` is on with CSP off for Swagger UI; multer enforces `UPLOAD_MAX_FILE_BYTES` (default 1 GB).
- Smoke: `scripts/smoke-summary.sh` with `scripts/fixtures/sample-2p.pdf`. Exercised locally against a gateway started on a throwaway database: registration, upload, request and status polling all behaved, and the new status fields serialized correctly. The summary step needs the workers and the Ollama host, so the first full pass happens on the Hetzner stack.
- Observed on the way: the local development database on the Mac has drifted from the committed schema in both directions (it lacks `Book.errorMessage` and still has `CardType.grammar` and `UserLearningSettings.generateGrammar`). It was left untouched; the Phase 1 reset replaces it.

### Phase 1: Remove Anki (learning) and dictionary; fresh migrations

Removal inventory (confirmed by file listing):

- Gateway: `src/modules/learning/**` (18 routes, 3 specs), `src/modules/dictionary/**` (28 routes), their imports in `app.module.ts`, `test/e2e/learning.e2e-spec.ts`.
- Client: `app/learning/**`, `app/dictionary/**`, `app/settings/learning/**`, `app/api/learning/**` (14 route files), `app/api/dictionary/**` (13 route files), `hooks/useLearning.ts`, `hooks/useDictionary.ts` and their re-exports in `hooks/index.ts`, `lib/api/endpoints/{learning,dictionary}.ts`, `lib/types/{learning,dictionary}.ts` and their re-exports in `lib/types/index.ts` and `lib/api/index.ts`, the learning/dictionary entries in `lib/fetcher.ts`, `components/AppSwitcher.tsx` entries, `app/page.tsx` buttons, `middleware.ts` patterns, `app/settings/{page,layout}.tsx` "Learning" entries, `ROUTES.learning` and `ROUTES.dictionary`.
- Schema: twelve models and four enums (§1.5) plus the relation fields on `User`, `Book`, `Highlight`. Also drop `Tag`, `BookTag`, `NoteTag`, `HighlightTag` and the `tags` field in `BookResponse` and the two components that render it, unless you want tagging.

Migration strategy (data is disposable):

1. Delete `prisma/migrations/2025081*` and remove the models from `schema.base.prisma`.
2. `prisma migrate dev --name init` against a local database produces `0001_init` from the cleaned schema. Review it: it should create exactly `User`, `RefreshToken`, `Book`, `Note`, `Highlight` and their indexes.
3. On the host: stop `api` and `workers`, `prisma migrate reset --force` (drops and recreates), start again. Re-upload a test book.
4. Remove `prisma db push` from both entrypoints; the gateway entrypoint runs `prisma migrate deploy` until the `migrate` service exists in Phase 2. Workers still run `prisma generate` (no database contact) until Phase 4.
5. Re-run `sync-prisma.sh` so the workers' schema copy matches.

Tests: delete learning specs; add a boot e2e for `AppModule` with mocked infrastructure; run Phase 0 tests and the smoke script. Prune npm packages that became unused (`npm ls` + grep; `react-hook-form`, `zod`, sliders and switches are also used elsewhere, verify before removing).

Exit criteria: no file references `learning` or `dictionary` outside git history; `prisma migrate status` is clean with one migration; smoke script passes. Tag `phase-1`.

**Outcome (2026-10-24, tag `phase-1`).** Landed on `main` as six commits.

- Removed: gateway `modules/learning` and `modules/dictionary` (46 routes) and the learning e2e; on the client the `/learning`, `/dictionary` and `/settings/learning` routes, 27 BFF route files, both hooks, the endpoint wrappers and type files, the registry entries in `lib/fetcher.ts`, the switcher, home, middleware, settings and routes entries, and the `slider` and `switch` UI wrappers with their Radix packages. Tag rendering and the `tags` field left `BookResponse`.
- Schema: `schema.base.prisma` now holds `User`, `RefreshToken`, `Book`, `Note`, `Highlight` and three enums; twelve learning and dictionary models, four enums and the four tag tables are gone. The three 2025 migrations were deleted and replaced by `20261024000000_init`, generated from the datamodel. Verified on a throwaway database: `migrate deploy` applies it, `migrate status` is clean, and `migrate diff --from-migrations` against the datamodel reports no difference.
- Entrypoints: the gateway container runs `prisma migrate deploy`; the workers container no longer touches the schema. `prisma` moved from devDependencies to dependencies so the production image carries the CLI.
- Tests: gateway unit 16, e2e 14 (summarizer 11 plus a new `AppModule` boot spec with mocked infrastructure, fed by `test/setup-env.ts`), worker pytest 32, client typecheck, lint and jest green. Gateway lint dropped from 7 to 5 pre-existing problems; the three pre-existing typecheck errors in `auth.service.ts` remain.
- Smoke: exercised on a throwaway database migrated with `migrate deploy`: registration, upload, request and status polling pass, the book payload no longer carries `tags`, and the removed APIs answer 404. The summary step still needs the workers and the Ollama host.
- Not done here: the database reset on the Hetzner host and on the local Mac. Both databases still hold the old tables without a `_prisma_migrations` row for `init`, so `migrate deploy` will refuse them (error P3005). Reset once, with the api and workers containers stopped, before starting the new images:

  ```bash
  docker exec summarizer-db psql -U "$POSTGRES_USER" -d postgres \
    -c "DROP DATABASE \"$POSTGRES_DB\";" -c "CREATE DATABASE \"$POSTGRES_DB\";"
  # start the api container next; its entrypoint applies 20261024000000_init
  ```

  Objects left in MinIO belong to books that no longer exist; clear the buckets or leave them, nothing reads them.

### Phase 2: Repository and deployment hygiene

1. Rename directories: `readwise-client → apps/web`, `readwise-gateway → apps/api`, `readwise-workers → apps/workers`, `readwise-infra → infra`, `readwise-shared/prisma → apps/api/prisma` (the schema folder arrives in Phase 4; until then keep one `schema.prisma` here and the generated worker copy). Update workspaces, `turbo.json`, Docker contexts, package names (`@workbench/web`, `@workbench/api`), README.
2. Single root `package-lock.json`; delete per-package lockfiles.
3. Root `docker-compose.yml` and `docker-compose.dev.yml`: db, minio, rabbitmq, migrate, api, workers, web, caddy, backup; one network; delete the three old compose files; `apps/web/Dockerfile`; Dockerfiles built from repo root; pin image tags. Optional interim `infra/rabbitmq/rabbitmq.conf` with a 24-hour `consumer_timeout`.
4. `.env.example` per service; de-duplicate credentials; `PrismaService` uses `DATABASE_URL`.
5. Root CI workflow (§4.5).
6. Delete: `readwise-contracts/` (re-create `packages/contracts` empty, to be filled in Phase 4), `scripts/release-sdk.sh`, `scripts/merge-and-migrate.js`, `vercel.json` (rotate the token), the legacy pipeline (`text_summarizer.py`, `llm_client.py`, `USE_NEW_PIPELINE`, the `openai` dependency) after moving `save_summary_to_s3` into `shared/s3_storage.py`, per-worker Dockerfiles and requirements.
7. Python: one `pyproject.toml` with the union of the remaining requirements; `pip install -e .`; `pytest` configured.
8. Prune `jose`, `crypto-js`, `jszip`, `@aws-sdk/s3-request-presigner` (unless Phase 6 presigned URLs are planned), `@openapitools/openapi-generator-cli`, `openapi-typescript-codegen`, `passport-local`, `cookie-parser` after grep; move `@types/amqplib` to devDependencies.
9. Rename user-facing strings, the Swagger title, container names, the network and the service-worker cache to Workbench (§1.12); bump the cache version.

Exit criteria: `docker compose up -d --build` from a clean checkout on the host brings up the whole stack behind Caddy and the smoke script passes against it; CI green on `main`. Tag `phase-2`.

**Outcome (2026-10-24, tag `phase-2`).** Landed on `main` as seven commits.

- Layout: `apps/web`, `apps/api`, `apps/workers`, `infra/`, `packages/contracts` (placeholder), one root `package-lock.json`; packages are `@workbench/web` and `@workbench/api`; `readwise-contracts`, the SDK publishing scripts, `vercel.json`, the three per-package Compose files and the per-worker Dockerfiles are gone. The base Prisma schema lives at `apps/api/prisma/schema.base.prisma`.
- Images are built from the repository root (`apps/*/Dockerfile`, root `.dockerignore`). The api image keeps the Prisma CLI and applies migrations; its build output root was fixed (`tsconfig.build.json` builds only `src`, so `dist/main.js` exists regardless of the `scripts/` folder). The web image uses Next's standalone output traced from the repository root.
- Root `docker-compose.yml`: db, minio, minio-init (creates the five buckets), rabbitmq (with `infra/rabbitmq/rabbitmq.conf`), migrate (one-shot), api (loopback-only port for host tools), workers, web, caddy, and an opt-in backup profile; one network `workbench_net`; `docker-compose.dev.yml` publishes ports with `DEV_*_PORT` overrides. One root `.env` feeds every container; per-app `.env.example` files cover running on the host.
- Code: the three pre-existing type errors in `auth.service.ts` and the lint errors in `health.controller.ts` are fixed, so `npm run lint && npm run typecheck && npm test` pass across both workspaces; `PrismaService` reads `DATABASE_URL`; readiness checks RabbitMQ for real; the legacy Python pipeline is deleted and `save_summary_to_s3` became `S3Storage.upload_summary`; the workers use one `pyproject.toml` (`openai` dropped, `httpx` made explicit). Pruned: `jose`, `crypto-js`, `jszip`, `@aws-sdk/s3-request-presigner`, `passport-local`, `cookie-parser`, both OpenAPI generators.
- Naming: page titles, PWA manifest, service-worker cache (`workbench-v1`), Swagger title and container names say Workbench.
- Verified locally: full stack via Compose on shifted ports: all services healthy, migration applied, buckets created, Caddy serves the web app, and the smoke script drove a real extraction through RabbitMQ into the summarization worker, which failed at the Ollama call because the borrowed env pointed at `localhost`; the error surfaced in `GET /summarizer/status` and the book stayed visible. Worker pytest 34, api e2e 14, unit 16 + 7.
- Caveats: **MinIO withdrew its images from Docker Hub and quay.io**, so the Compose file references `minio/minio:latest` with `pull_policy: missing`, which works wherever the image is already cached (your host, this Mac). A fresh host needs `docker save minio/minio:latest | ssh <host> docker load`, or a move to another S3-compatible server (see risks). CI has not run yet because nothing is pushed. Rotate the GitHub token that `vercel.json` used. For Docker, `OLLAMA_BASE_URL` must be reachable from containers (a Tailscale or LAN address, not `localhost`).

### Phase 3: Front-end shell and tool registry

Work against the existing BFF and API; no backend changes.

1. `src/platform/shell/{ToolManifest.ts, registry.ts}` and `src/tools/reader/manifest.ts`; register it.
2. `app/(shell)/layout.tsx` from the registry; delete the per-area layouts; nested full-screen layouts for `read` and `summary` segments.
3. Dashboard at `app/(shell)/page.tsx`: tool cards, continue reading, recent jobs placeholder (fed by `GET /summarizer/status` until Phase 4). Replace `app/page.tsx`.
4. `/settings` hub reads `manifest.settings`; Appearance and Account stay platform sections; the cover-style preference becomes a reader setting.
5. Move `app/reader/**` into `src/tools/reader/{documents,reading,summaries,pages}` and mount routes under `app/(shell)/apps/reader/**` per the table in §2.4. Move `UploadProvider`, `UploadWidget`, `FileUpload`, `BookCoverProvider`, `bookParser.ts` and the reader hooks into the tool. Delete `app/(consts)/routes.ts` in favor of `src/platform/routes.ts` + `src/tools/reader/routes.ts`.
6. `middleware.ts` protects `/apps` and `/settings`; `next.config.ts` redirects `/reader/library → /apps/reader`, `/reader/ingest/upload → /apps/reader/upload`, `/reader/book/:id/profile → /apps/reader/book/:id`, `/reader/book/:id/reader → /apps/reader/book/:id/read`, `/reader/book/:id/summary → /apps/reader/book/:id/summary`.
7. Global providers reduced to Theme, Offline, Motion, Toaster.
8. ESLint boundaries: `src/tools/*` may import `src/platform/**` and `components/ui/**` only; inside the reader, `summaries/**` may not import `reading/**`.
9. Tests: registry test (unique `id`, route directory exists); middleware test; keep the offline tests.

Exit criteria: the app opens on a dashboard with the reader tool; every previous page is reachable at its new URL; old URLs redirect; summary generation and reading work through the unchanged BFF. Tag `phase-3`.

**Outcome (2026-10-24, tag `phase-3`).** Landed on `main` as three commits.

- Structure: `apps/web/src/platform/{shell,providers,pwa,ui,auth,routes.ts}` and `apps/web/src/tools/reader/{documents,reading,summaries,pages,manifest.ts,routes.ts,types.ts,ReaderToolLayout.tsx}`. Route files under `app/(shell)/...` are one-line re-exports of page components; the viewer and the summary reader sit in an `app/(fullscreen)` route group, so they render without the sidebar instead of relying on a pathname regex. Aliases `@platform/*` and `@tools/*` in tsconfig and jest. 64 files moved with history.
- Registry: `ToolManifest` (id, name, description, icon, nav, actionButton, settings, enabled) and `shell/registry.ts`, the one file that lists tools. The shell layout, app switcher, dashboard, settings hub and mobile sidebar all read from it. Middleware protects `/`, `/apps/*` and `/settings*` through `auth/route-guard.ts`; signed-in users land on the dashboard.
- Reader: `/apps/reader`, `/apps/reader/upload`, `/apps/reader/book/[id]`, `/apps/reader/book/[id]/read`, `/apps/reader/book/[id]/summary`; six `redirects()` in `next.config.ts` keep old URLs working. `READER_ROUTES` and `PLATFORM_ROUTES` replace the single route table. The upload provider and widget are mounted only inside the reader; the cover-style preference is a provider-less `useBookCoverStyle` hook so the platform settings route can render the tool's settings page. The summary JSON types moved to `summaries/types.ts`.
- Boundaries: ESLint `no-restricted-imports` rules: a tool never imports another tool or route files, the platform never imports a tool (registry excepted), `summaries` never imports `reading`. The rules caught one real violation on first run (the reader's types file importing a BFF schema file), fixed.
- Housekeeping: the unused shadcn ModeToggle, the unused ThemeProvider wrapper and providers index, `app/types/books.ts` and `hooks/index.ts` are gone. `<Toaster />` is now mounted in the root layout; it never was, so every `toast()` call in the app was invisible.
- Verified: typecheck clean, lint 0 errors, jest 24 (two new suites: registry, route guard), `next build` route table as designed, api unaffected (16 unit, 14 e2e). Standalone-server smoke: anonymous requests to `/`, `/apps/*` and `/settings*` redirect to login with `next`; the six old URLs return 308 to their replacements; with a session cookie every page returns 200 and `/auth/login` bounces to `/`; the dashboard links to `/apps/reader` and the settings hub lists the reader section.
- Not done, by design: the dashboard shows tool cards only; "continue reading" and recent jobs arrive with the job system (Phase 4). The upload queue no longer survives navigating out of the reader. End-to-end reading and summarizing through the BFF were not re-run in a browser; the BFF and API are untouched by this phase.

### Phase 4: Backend platform/tools split and jobs

Step 4a (pure move, no behavior change):

1. `src/infrastructure/*` → `src/platform/{db,storage,queue}`; `src/modules/{auth,users,health}` → `src/platform/*`; `src/modules/books` → `src/tools/reader/documents`; `src/modules/{highlights,notes}` → `src/tools/reader/reading`; `src/modules/summarizer` → `src/tools/reader/summaries`; `tool-registry.ts`; path aliases `@platform/*`, `@tools/*`; boundaries lint. Routes become `/reader/documents...`, `/reader/documents/:id/summaries...`; keep the old paths as aliases until Phase 5.
2. Slim `BookResponse`: remove `notes`, `highlights` (and `tags`) from `BOOK_WITH_RELATIONS`; the reading sub-module already fetches them via its own endpoints. `SummaryResponse` stops extending `BookResponse`.
3. `StorageService` with the bucket registry from env including `extractions` and `checkpoints`; fix deletion buckets; cascade cleanup of summaries and checkpoints on document delete.
4. pino as the Nest logger; real readiness checks.

Step 4b (jobs):

5. Switch to the schema folder: `prisma/schema/platform.prisma` (User, RefreshToken, Job) and `prisma/schema/reader.prisma` (Book → `reader_book`, Note → `reader_note`, Highlight → `reader_highlight`, Summary → `reader_summary`). Drop the summary columns from the book. Because data is disposable, regenerate `0001_init` from this schema and reset again rather than writing an alter migration; from here on, alter migrations only.
6. `JobsModule`: `JobsService` (enqueue, claim, heartbeat, progress, complete, fail, cancel, sweep), `JobsController`, `JobEventsConsumer`, `NodeJobRunner`, per-tool `onJobEvent` registration; `QueueModule` with topic exchanges, bindings and DLX; `APP_MODE` handling in `main.ts`.
7. `SummariesService.create` creates a `Summary` row and the extract + summarize `Job` rows, publishes the extract job, returns `{ summaryId, jobId }`; the documents hook stores `extractionStorageKey` and publishes the child; the summaries hook stores `storageKey`. `GET /summarizer/status/:bookId` stays as a compatibility shim over `Job` until Phase 5.
8. Workers: `worker/platform/{queue,jobs,storage,settings,llm}`; wrap extraction and summarization as handlers that read only the payload, emit `started/progress/waiting/succeeded/failed`, ack on claim, heartbeat, probe Ollama and wait; delete `shared/database.py`, `schema.prisma`, `prisma` from dependencies, `main.py`'s subprocess launcher and the entrypoint's push. For one release also bind the old `extract_request` queue to an adapter that converts the old message into the new envelope; remove it afterwards.
9. `packages/contracts/jobs`: envelope and event schemas with fixtures; zod and pydantic tests on both sides.
10. Delete `sync-prisma.sh` and the workers' schema copy.

Tests: API e2e for summary creation (job rows, published envelope), the event consumer (succeeded sets `Summary.storageKey`; failed sets `Job.error`; progress refreshes `heartbeatAt`), the sweep (stale running job re-published, then failed after `maxAttempts`), deletion cleanup; worker handler tests with the fake queue asserting emitted events, the Ollama-down wait path, and checkpoint resume; smoke script asserts a `succeeded` job and real stages.

Deployment: coordinated `docker compose up -d --build`; `migrate` resets and applies; the adapter covers any in-flight old messages (there should be none after a planned stop).

Exit criteria: a summary request produces jobs that move through `running` to `succeeded`, a summary row with a storage key, no worker database access; stopping Ollama mid-run shows `waiting` and resumes when it is started; a forced failure lands in the DLQ and as `failed` in `GET /jobs`. Tag `phase-4`.

**Outcome (2026-10-25, tag `phase-4`).** Landed on `main` as six commits (contracts, api, workers, web, build, docs).

- API layout: `src/platform/{auth,common,config,db,health,jobs,queue,storage,users}` and `src/tools/reader/{documents,reading,summaries}` with `reader.module.ts`; `tool-registry.ts` is the only file that lists tools; aliases `@platform/*`, `@tools/*`; ESLint boundaries (platform never imports a tool, a tool never imports another tool or the app wiring, `summaries` never imports `reading`). Controllers answer at the reader's prefix (`/reader/documents...`, `/reader/documents/:id/summaries`, `/reader/summaries/:id[/content]`) and, until Phase 5, at the old paths (`/books`, `/highlights`, `/notes`, `/summarizer/*`) through array routes. The hello-world controller is gone.
- Data: the schema is a folder, `prisma/schema/{schema,platform,reader}.prisma`, and Prisma keeps a schema folder's migrations inside it, so the regenerated initial migration is `prisma/schema/migrations/20261025000000_init`. Tables `User`, `RefreshToken`, `Job` and `reader_book`, `reader_summary`, `reader_note`, `reader_highlight`; the reader's enums are prefixed too. The book lost its summary columns and the `pending`/`processing` states; `reader_summary` holds type, strategy, percent, `storageKey` and `jobId` (no foreign key into the platform table). `Job` is the planned model plus `waitReason` and `updatedAt`. Verified on a throwaway database: deploy, clean status, no drift between migrations and datamodel. `sync-prisma.sh` and both generated copies are deleted. `package.json#prisma.schema` points at the folder; Prisma 6.19 flags that key as deprecated in favour of `prisma.config.ts`, which is the Prisma 7 upgrade's job.
- Jobs (`platform/jobs`, `platform/queue`): topology `workbench.jobs` (topic), `workbench.job-events` (topic), `workbench.job-control` (fanout, cancels), `workbench.dlx`; queues `q.py.reader`, `q.node.default`, `q.api.job-events`, each with a `.dlq`; the pre-Phase-4 queues are deleted on connect. `JobsService` owns the state machine (create, publish, enqueue, cancel, retry, cancel children and subject, `applyEvent`, `sweep`) and the per-tool hook registry; `JobEventsConsumer` validates events with zod and dead-letters garbage; `NodeJobRunner` runs in-process handlers with the same ack-on-claim semantics (no production handler yet, exercised by its spec); `APP_MODE` api | worker | all decides whether consumers and the sweep run. `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/cancel`, `POST /jobs/:id/retry`.
- Reader summaries: `SummariesService.create` writes the summary row and the `reader.extract` + `reader.summarize` jobs (the extract step is skipped when the book is already extracted), publishes the first, and is idempotent per book, type and strategy (a running or finished equal summary is returned, not re-queued). `ReaderJobHooks` stores the extraction key on the book and publishes the child with it, cancels the child when extraction fails for good, and stores the summary's storage key; the summary state falls back to the job result if the hook missed the key. The compat endpoints the web still calls derive `status`, `summaryKey` and `errorMessage` from the latest summary job and expose `jobId`, `jobStatus`, `stage`, `progress`, `waitReason`.
- Storage and operations: `StorageService` with a five-bucket registry (`extractions` and `checkpoints` configurable), book deletion removes the extraction from the right bucket and the summaries sub-module removes summary objects, checkpoints and active jobs first; pino is the Nest logger, the request id is honoured and returned; readiness probes Postgres, S3 (`HeadBucket`) and the AMQP connection.
- Contracts: `packages/contracts/jobs/{job-envelope,job-event,job-control}.schema.json` with ten valid and ten invalid fixtures; the zod mirror is tested against the fixtures and the JSON Schema (ajv), the pydantic mirror against the same fixtures. The envelope carries `publishedAt` because the live trial showed a worker refusing a retried job it remembered as cancelled; a cancel older than the envelope is now ignored.
- Workers: one package, `python -m worker --queues reader`. `worker/platform` holds settings, JSON logging, the contracts, the consumer (declares its queue with the same arguments as the API, acknowledges on claim, reconnects forever), the event publisher thread (all AMQP publishing, a heartbeat per active job every `WORKER_HEARTBEAT_SECONDS`, the control queue for cancels), the runner, S3 and the Ollama probe. `worker/tools/reader/extract` and `worker/tools/reader/summarize` are the two handlers; the pipeline packages moved under `summarize/` with only their import prefixes changed. The summarize handler waits for the LLM host with backoff (30 s to 5 min) before starting and whenever a connection error appears mid-run, then restarts the stage and resumes from the checkpoint; a cancel is honoured between sections and keeps the checkpoint; summaries are stored at `summary/<bookId>/<summaryId>.json`. Deleted: `main.py` launcher, `entrypoint.sh`, `shared/*`, `schema.prisma`, prisma-client-py. `AsyncLLMClient` stays inside the reader's pipeline for now (only the probe lives in `platform/llm.py`); moving it is a follow-up for a second Python tool.
- Web: `BookResponse` carries `noteCount`/`highlightCount` instead of the relations (profile fetches notes, reader hooks fetch on mount), the summary page is driven by the book's compat state, and the progress screen shows the real stage, the wait reason and the real progress. The summary types mirror the API.
- Build: Compose passes bucket names, `APP_MODE`, `JOBS_LEASE_SECONDS`, `WORKER_QUEUES`, `WORKER_HEARTBEAT_SECONDS`; the RabbitMQ `consumer_timeout` override is gone; CI checks drift against the schema folder; `scripts/test-workers.sh` mounts the repository root; `scripts/smoke-summary.sh` prints the job states while it waits and asserts that the extract and summarize jobs succeeded.
- Verified: api 73 unit tests in 8 suites and 15 e2e tests in 2 suites (in-memory Prisma double, recording queue); web 24; workers 62 under python:3.11-slim; lint clean, typecheck clean, all three images build. Full Compose trial on shifted ports without an LLM host: migration applied, topology asserted, upload, request, extract `succeeded` in under a second, summarize `waiting` with the reason, heartbeat advancing every 15 s, cancel reaching the worker in 15 s, malformed job and event messages dead-lettered with `x-death: rejected`, old queues absent, retry → `waiting`, worker stopped → sweep re-queued the job 136 s later (lease 120 s) → restarted worker claimed attempt 2, delete removed the file and extraction objects and left no active job, smoke script printed the state lines and timed out as expected.
- Not done, by design: no old-queue adapter (planned stop, disposable data); no real LLM run from this machine (run `npm run smoke` on the host once Ollama is up); the web keeps calling the compat endpoints until Phase 5. Deploying this phase needs one database reset (`docker compose down -v`, or `migrate reset`) because the init migration was regenerated.

### Phase 5: API layer collapse

1. `app/api/gw/[...path]/route.ts`: forwards method, path, query, headers (minus cookies and hop-by-hop), and body (streamed) to `API_URL/api/<path>`; injects `Authorization` from the `access_token` cookie; on 401 refreshes once via the cookie flow and retries; streams the response back. Keep `app/api/auth/*`.
2. `src/platform/api/http.ts` with `apiFetch<T>()`; delete `lib/fetcher.ts`, `lib/api/*`, and every `app/api/**` route except auth and the proxy. Cookie helpers move to `platform/api/cookies.ts`.
3. `src/tools/reader/api.ts` with typed functions; `packages/api-types` generated from OpenAPI in CI (`openapi-typescript`), or hand-written types.
4. Summaries UI on `Summary`/`Job` endpoints: real stages and progress, the `waiting` state with "start the LLM host" hint, cancel and retry, a working strategy picker, a list of previous summaries per document.
5. Remove the compatibility shims (`/books`, `/summarizer/*` aliases, `GET /summarizer/status`).

Tests: proxy unit tests (auth injection, 401 refresh-then-retry, binary streaming, error pass-through, header hygiene); one e2e through the proxy against a mocked API.

Exit criteria: the client has three route handlers; no `ApiRegistry`; every page works; adding an endpoint touches two files (API controller, tool `api.ts`). Tag `phase-5`.

**Outcome (2026-10-25, tag `phase-5`).** Landed on `main` as three commits (api, web, docs).

- Web data path: `app/api` holds five server-side routes, the four auth routes (`login`, `register`, `refresh`, `logout`, which set and clear the httpOnly cookies) and the generic proxy `app/api/gw/[...path]`. The proxy logic lives in `src/platform/api/proxy.ts`, pure with respect to Next.js: it validates the path (no empty or `..` segments), forwards method, query and body, drops cookie, host, authorization and hop-by-hop headers on the way in and `set-cookie` plus hop-by-hop headers on the way out, injects the bearer token from the cookie, refreshes it 30 s before the JWT's `exp` or after a 401 (one retry, for bodies up to 1 MiB; larger bodies stream once with half duplex), and streams the response back. `src/platform/api/http.ts` is the browser client (`apiFetch` with a JSON helper, `ApiError` carrying the API's message, 204 handling and a login redirect when the session is gone; `apiUrl`; `sendBeaconJson` for the unload beacons); `src/platform/api/auth.ts` calls the auth routes. `lib/fetcher.ts` with its `ApiRegistry`, `lib/api/*`, `lib/types/*`, nineteen per-endpoint route and schema files and the axios dependency are gone.
- Typed clients: `src/tools/reader/api.ts` (documents, reading, summaries, with `withBrowserUrls` prefixing the API's file paths) over hand-written types in `src/tools/reader/types.ts`; `src/platform/jobs/api.ts` and `types.ts` for jobs. OpenAPI generation was not adopted: the DTOs are decorated classes and the generated types were noisier than the few interfaces needed, which 2.8 allows. Adding an endpoint touches the API controller and the tool's `api.ts`.
- Summaries UI on jobs: `useJob` polls a job until it ends; `JobProgress` shows the real stage, the progress bar, the waiting hint ("start the LLM host, the job continues by itself") and cancel/retry; the summary page opens the newest ready summary in the reader, shows live progress of an active job (including the extract stage while the summarize job is queued behind it), offers a retry after a failure, starts a new summary with the strategy picker, and lists previous summaries with view, cancel and retry; the profile's buttons and the library badges (failed, summarizing, waiting) come from the summaries endpoints; the dashboard lists recent jobs with cancel and retry.
- API: the compatibility routes (`/books`, `/highlights`, `/notes`, `/summarizer/*`) and the derived book fields (`summaryKey`, "processing" status, job error) are removed; `fileUrl` and `coverUrl` are `/reader/documents/:id/download` and `/cover`, `hasExtraction` is new, covers are cacheable; `GET /reader/summaries?latestPerBook=true` serves the library in one request. The smoke script walks the reader and jobs endpoints.
- Verified: web 47 tests (the proxy suite covers forwarding, header hygiene, refresh-then-retry, proactive refresh, 401 pass-through with cookie clearing, large bodies streamed once, binary and error pass-through, bad paths; plus the HTTP client, the reader client and the progress component), api 73 unit and 15 e2e, workers 62, lint and typecheck clean, `next build` lists exactly the five server routes. Full Compose trial through the web app on shifted ports without an LLM host: register set the two cookies, documents listed, a multipart upload streamed through the proxy, the download came back byte-identical with content-disposition and request id, a missing cover gave 404 and a traversal attempt 400, a summary request produced the jobs and the summarize job reached `waiting` with its reason, the summary list and the per-book list answered, the summary page and the dashboard rendered, removing the access cookie made the proxy refresh and set a new one, cancel, delete and logout worked and the old BFF paths answered 404 with no server errors logged.
- Notes: the exit criterion said "three route handlers"; the web has five route files (four auth plus the proxy), the per-endpoint layer is what disappeared. "One e2e through the proxy against a mocked API" is the proxy suite's fake API plus the live trial. The essential path of the plan (Phases 0 to 5) is complete; Phase 6 items stay optional.

### Phase 6: Optional improvements and future optimizations

- **Pipeline speed is not part of this plan.** It is a separate track with its own backlog in `docs/pipeline-speed-backlog.md`, to be started after the refactor. The only overlap is that the `Job` table records `startedAt`, `finishedAt` and `stage`, which that track uses as its baseline.
- TanStack Query per tool.
- `platform/ai` in the API when the first Node tool needs LLM calls; share env with the Python client.
- Presigned PUT/GET for documents (removes the double hop; optional on a single host).
- Server-sent events for job progress instead of polling (`GET /jobs/:id/stream`).
- Refresh-token rotation; per-token logout; multi-session; user-keyed throttling.
- Document tagging as a reader feature; `UserPreference` table when a second tool needs settings.
- Observability upgrades (Loki, metrics) when log volume justifies them.

---

## 6. Decision log

| # | Decision | Why | Alternatives considered | Trade-offs | Reversibility |
|---|---|---|---|---|---|
| D1 | Modular monolith: three deployables (web, api, workers), three infra services, one host; no new services | Single developer, personal scale; all painful coupling is in-process; Python is the only runtime that needs separation | Microservices per tool; single Node process with no Python | Tools share one deploy and one failure domain | Easy to split later along the job seam |
| D2 | `platform` / `tools` split inside each deployable, enforced by lint and module imports | Makes the boundary a directory, reviewable and lintable | Internal workspace packages per tool | Packages give stronger isolation but add build config; not worth it below about five tools | Directories can be promoted to packages if path aliases are used |
| D3 | Static tool registry (manifest array), no runtime plugin loading | Compile-time safety; Next.js needs static routes; one developer adds tools by editing code | Dynamic discovery, module federation, a database table of apps | A new tool requires a deploy, which is the normal workflow | Trivial to replace later |
| D4 | Reader and summarizer are one tool, `reader`, which owns the library, extraction, viewers, highlights, notes and summaries **[survey]** | Your product decision; avoids a speculative platform "documents" layer with one consumer | Library as platform + reader and summarizer as separate tools (revision 1) | If a second tool needs documents, `documents` must be promoted to platform; the sub-module layout keeps that to a directory move | Cheap, by design |
| D5 | `Job` (platform) and `reader_summary` (tool) tables; `Book.status` means file state only; tool tables prefixed; `Book` renamed `reader_book` in the init migration | Fixes the three confirmed status defects; enables several summaries per book; ownership visible in `psql`; data is disposable so renames are free **[survey]** | Keep columns on `Book`; keep legacy table names via `@@map` | None of note now; later it would cost a data migration | Columns can be re-added |
| D6 | One Postgres database, Prisma schema folder with one file per owner, foreign keys to platform allowed | Joins to `User`, one backup, one migration history | Postgres schema per tool (Prisma multiSchema, still preview), database per tool | Weaker isolation; relies on convention and lint | Tables can move to a schema later |
| D7 | Replace `db push` with `prisma migrate`; fresh `0001_init` and a reset instead of a baseline **[survey]** | No data to preserve; a baseline would add ceremony for nothing | Baseline from the live database (revision 1) | One planned reset of the host database | n/a |
| D8 | Only the API codebase touches the database. Python workers are database-free and report through job events; Node job handlers live in the API codebase and run in its runner | Removes prisma-client-py, the schema sync and the dual push; a Node tool gets jobs without a second ORM; both runtimes share one state machine | Python keeps Prisma and writes `Job`/tool tables; a separate Node worker service | About 300 lines of consumer, hooks and sweep in the API; results are eventually consistent by seconds | Python could regain DB access without changing the envelope |
| D9 | Keep RabbitMQ; topic exchange, per-runtime queues, DLX; versioned JSON envelope validated on both sides | Existing Python code is pika-based; a broker change buys nothing | Postgres-backed queue, Redis + BullMQ | One more infra service than a Postgres queue; already running | Envelope is broker-agnostic |
| D10 | Keep the Next.js BFF but collapse it to one generic authenticated proxy plus the cookie-setting auth routes | Keeps tokens in httpOnly cookies and the API origin private; deletes about 70 files and the global type registry | Browser calls the API directly with cookies; per-endpoint BFF (today) | Two hops per request; streaming must be done right once | `apiFetch` can be pointed at the API origin later |
| D11 | Client types generated from the API's OpenAPI (or hand-written per tool); no published SDK | The OpenAPI pipeline already exists; the SDK repo has no consumer | Keep `release-sdk.sh`; keep `readwise-contracts` | Generated types can be noisy for decorated DTOs | Swappable per tool |
| D12 | Job and event contracts as JSON Schema + fixtures in `packages/contracts`, mirrored by zod and pydantic, not published | Two languages need one contract; fixtures catch drift like the dropped strategy field | Publish to npm/PyPI (today, unused) | Manual mirror in two languages, kept honest by a test | Could move to code generation later |
| D13 | Single Hetzner host, Docker Compose, Caddy for TLS, `web` containerized **[survey]** | Matches where everything already runs; removes the Vercel questions; one place to operate | Vercel + public API; Kubernetes | You run TLS and updates; no CDN | Compose files are small |
| D14 | Tools at `/apps/<id>`; platform at `/`, `/settings`, `/auth`, `/api` **[survey]** | Your preference; a clear namespace that can never collide with platform routes | `/<id>` at the top level (revision 1) | Slightly longer URLs | Redirects make renames cheap |
| D15 | TanStack Query, presigned URLs, SSE and the AI facade are outside the essential path; pipeline speed is outside the plan entirely | None of them unblocks the toolbox; a short essential path lowers risk | Do everything at once | Some hand-rolled code survives into Phase 6 | n/a |
| D16 | Long-running jobs: acknowledge on claim, track with a database lease and heartbeats, sweep stale jobs, `waiting` state while the LLM host is down **[survey]** | Twelve-hour jobs cannot ride on unacknowledged deliveries (broker `consumer_timeout`); a hand-started Ollama must make jobs wait, not fail; handlers are already idempotent and checkpointed | Raise `consumer_timeout` to a day and keep hold-until-done; nack with requeue and delay queues | A crash between claim and first checkpoint re-runs from the start (bounded by checkpoint granularity); a sweep timer in the API | The lease fields are harmless if unused |
| D17 | Delete the legacy pipeline in Phase 2 **[survey]** | `USE_NEW_PIPELINE` defaults to true and is never set; dead code that still owns `save_summary_to_s3` | Keep behind the flag until Phase 6 | Must move one helper function first | Git history |
| D18 | Commits to `main`, CI on push, a git tag per phase **[survey]** | Solo developer; branches add ceremony without review | PR per phase | A broken push breaks `main`; CI catches it before deploy | n/a |

Decisions that would be expensive to reverse after a few tools exist: D5/D6 (table ownership and names), D8 (who may touch the database), D12 (envelope field names and versioning), D14 (URL scheme), D16 (job state machine).

---

## 7. Risks and trade-offs

### Overengineering risks

- Turning the manifest into a plugin framework. Keep `ToolManifest` under ten fields; add a field only when a second tool needs it.
- Building a platform "documents" service now for one consumer. Keep it a sub-module of the reader until a second tool asks.
- Per-tool databases, per-tool services, or an event bus beyond the job queue.
- Replacing working hand-rolled hooks with TanStack Query during the essential phases.
- Over-designing the job system: no priorities, no scheduling, no retries beyond `maxAttempts`, no workflow engine. Two job types and a parent link cover the summarizer.

### Tight coupling and hidden dependencies (all confirmed)

- `Book.status` written by three actors; `getAllBooks` hides `error` rows.
- `SummaryResponse extends BookResponse`, which embeds notes, highlights and tags.
- `lib/fetcher.ts` `ApiRegistry` and `lib/types/index.ts` aggregate every feature.
- Upload and cover providers in the global shell.
- Bucket names duplicated across runtimes; extraction and checkpoint buckets unknown to the gateway.
- The message between extraction and summarization drops fields.
- Two Prisma schema copies and two `db push` runners.
- Hard-coded tool lists in `AppSwitcher`, `page.tsx`, `middleware.ts`, four layouts and `routes.ts`.

### Data and migration problems

- The database and buckets are disposable **[survey]**, so the main risk is forgetting that a reset also wipes your own test library. Keep the one-off dump from Phase 0 if you want to restore books quickly.
- Two resets are planned (Phase 1 and Phase 4b). After Phase 4b, alter migrations only; the CI drift check guards against editing the schema without a migration.
- MinIO keys are referenced by value in the database; the new key scheme applies after the reset, so no shim is needed, but do not mix old and new objects in one bucket without a reset.
- Checkpoints are keyed by `bookId + type` today and by `summaryId` after Phase 4; the summarize handler must use the new key from the first job after the switch.

### Long-running jobs and the LLM host

- Until Phase 4, a 12-hour job depends on redelivery plus checkpoints to survive the broker's consumer timeout **[assumption]**. If you see "channel closed" or repeated "Resuming from checkpoint" in worker logs, that is the cause; the interim `rabbitmq.conf` in Phase 2 removes it.
- After Phase 4, a worker crash between claim and the first checkpoint re-runs the segmentation step. Acceptable; segmentation is a small fraction of total time.
- The `waiting` state blocks the single Python consumer. If a second Python tool appears, give it its own queue and process so a waiting summary does not block it.
- The sweep must never re-publish a job whose worker is alive but slow; the heartbeat interval (minutes) must be well below the lease (15 minutes), and the summarize handler must heartbeat during long single LLM calls (a background task in the handler, not only per chunk).

### Performance and scalability bottlenecks

- In-memory multer and buffered BFF downloads: fixed by limits and streaming through the generic proxy.
- One worker process, prefetch 1, `asyncio.run` per message: fine for one user; more containers bound to the same queue scale it without code changes.
- Polling every 3 s per open summary page: acceptable; SSE in Phase 6 if it bothers you.
- Pipeline speed (up to 12 hours per book) is a pipeline and model problem, not an architecture problem, and is deliberately kept out of this plan; see `docs/pipeline-speed-backlog.md`.

### Infrastructure availability

- MinIO no longer publishes container images on Docker Hub or quay.io (checked 2026-10-24: both registries answer 404/401 for `minio/minio`). The stack runs from the image cached on the host. When that stops being acceptable: mirror the cached image into a private registry, or replace MinIO with a maintained S3-compatible server (Garage, SeaweedFS, RustFS) behind the same `S3_*` settings; the API and workers only use the S3 API.

### Security concerns

- No upload size limit; Swagger public; no `helmet`; secrets read outside `ConfigService`; a GitHub token written to git credentials in `vercel.json`; MinIO reachable over plain HTTP from the API. Addressed in §4.7; the first four are Phase 0/2 items.
- Workers currently hold full database credentials; D8 removes that.
- The generic proxy must forward only to `API_URL`, strip hop-by-hop and cookie headers, and reject path traversal.

---

## 8. Implementation checklist (ordered by priority)

Legend: **E** essential, **O** optional.

### Phase 0: tripwires
- [x] E API e2e for `POST /summarizer/request`, "already exists", `GET status`
- [x] E pytest for extraction forwarding, summarization idempotency, checkpoint resume, builder presets
- [x] E `scripts/smoke-summary.sh` against the dev stack (script in place and exercised up to polling; first full pass needs the workers and Ollama)
- [x] E Forward `summarizationStrategy` and `userId` in `shared/messaging.py`
- [x] E Stop excluding `error` books from `getAllBooks`; error badge with retry/delete
- [x] E `helmet()` and multer `limits.fileSize`
- [ ] O One-off `pg_dump` + `mc mirror` (skipped: data is disposable)
- [x] E Confirm the name Workbench or replace it everywhere before Phase 2
- [x] E Tag `phase-0`

### Phase 1: remove Anki and dictionary, fresh migrations
- [x] E Delete gateway `modules/learning`, `modules/dictionary`, their `AppModule` imports and the learning e2e
- [x] E Delete client learning/dictionary routes, BFF routes, hooks, endpoints, types, registry entries, switcher/home/middleware/settings/routes entries
- [x] E Remove twelve models, four enums, relation fields; drop tag tables and `tags` rendering (unless tagging is wanted) (tag tables dropped)
- [x] E Delete old migrations; generate `0001_init`; `prisma migrate reset` on the host (migration is `20261024000000_init`; the host and local resets are deploy steps, commands in the outcome note)
- [x] E Remove `prisma db push` from both entrypoints; gateway runs `migrate deploy` for now
- [x] E Re-sync the workers' schema copy; boot e2e for `AppModule`
- [x] E Prune npm packages that became unused (`@radix-ui/react-slider`, `@radix-ui/react-switch`)
- [x] E Smoke script passes; tag `phase-1` (exercised through polling on a migrated throwaway database; full pass on Hetzner)

### Phase 2: hygiene
- [x] E Rename to `apps/web`, `apps/api`, `apps/workers`, `infra/`; update workspaces, turbo, Docker contexts, package names
- [x] E Single root lockfile
- [x] E Root `docker-compose.yml` + dev override; one network; delete old compose files; remove `network_mode: host`
- [x] E `apps/web/Dockerfile`; Dockerfiles from repo root; `migrate` one-shot service; Caddy; pinned image tags (MinIO cannot be pinned, see outcome)
- [x] O `infra/rabbitmq/rabbitmq.conf` with a 24 h `consumer_timeout` (interim)
- [x] E `.env.example` per service; `DATABASE_URL`/`AMQP_URL`/`S3_*`/`OLLAMA_*` de-duplicated; `PrismaService` uses `DATABASE_URL` (one root `.env` feeds Compose; `AMQP_URL` not introduced, RabbitMQ keeps its three variables)
- [x] E Root CI: lint, typecheck, test, pytest, `prisma validate`, migrate drift check, docker build (written; first run happens on push)
- [x] E Delete `readwise-contracts`, `release-sdk.sh`, `merge-and-migrate.js`, `vercel.json`; rotate the token (token rotation is yours)
- [x] E Delete the legacy pipeline and `openai` after moving `save_summary_to_s3`; one `pyproject.toml`; delete per-worker Dockerfiles and requirements
- [x] E Prune `jose`, `crypto-js`, `jszip`, presigner (unless planned), OpenAPI generator CLIs, `passport-local`, `cookie-parser` after grep
- [x] E Rename user-facing strings and the SW cache; backup container; tag `phase-2`

### Phase 3: shell and registry (front end)
- [x] E `ToolManifest`, `registry.ts`, `src/tools/reader/manifest.ts`
- [x] E `app/(shell)/layout.tsx` from registry; delete per-area layouts; full-screen nested layouts for `read` and `summary` (full-screen pages live in an `app/(fullscreen)` route group)
- [x] E Dashboard page; settings hub from manifests
- [x] E Move `app/reader/**` into `src/tools/reader/{documents,reading,summaries,pages}`; routes under `/apps/reader/**`
- [x] E Move upload/cover providers, `FileUpload`, `bookParser.ts`, reader hooks into the tool; replace `(consts)/routes.ts` (cover style became the provider-less `useBookCoverStyle`)
- [x] E Middleware prefixes `/apps`, `/settings`; redirects for the five old URL families (plus `/`; six redirects incl. `/reader`)
- [x] E Global providers reduced; ESLint boundaries incl. `summaries` ↛ `reading`; registry and middleware tests
- [x] E Tag `phase-3`

### Phase 4: backend split and jobs
- [x] E Move infrastructure and modules into `src/platform/*` and `src/tools/reader/{documents,reading,summaries}`; `tool-registry.ts`; aliases; boundaries lint; route aliases
- [x] E Slim `BookResponse`; `SummaryResponse` no longer extends it (counts replace the relations; compat fields `summaryKey`/`status`/`errorMessage` derived from the latest summary job)
- [x] E `StorageService` bucket registry incl. `extractions`, `checkpoints`; deletion fix; cascade cleanup
- [x] E pino as Nest logger with request id; real readiness checks
- [x] E Schema folder; `Job`, `Summary`; prefixed reader tables; regenerate `0001_init`; reset (`prisma/schema/migrations/20261025000000_init`)
- [x] E `JobsModule` (enqueue, claim, heartbeat, progress, complete, fail, cancel, sweep; controller; events consumer; Node runner; per-tool hooks); `QueueModule` exchanges + DLX; `APP_MODE`
- [x] E `SummariesService` creates summary + jobs; documents hook publishes the child; status shim kept temporarily
- [x] E Workers: `worker/platform/*`; handlers ack-on-claim, heartbeat, Ollama probe + `waiting`, events; delete Prisma, schema copy, `main.py` launcher, `db push`; old-queue adapter for one release (adapter skipped: the API deletes the old queues on connect, nothing is in flight after a planned stop)
- [x] E `packages/contracts/jobs` schemas + fixtures; zod and pydantic tests
- [x] E Delete `sync-prisma.sh` and the workers' schema copy
- [x] E API e2e (job creation, events, sweep, deletion cleanup); worker handler tests (events, waiting, resume); smoke asserts `succeeded` and stages
- [x] E Coordinated deploy; remove adapter; tag `phase-4` (deploy is the user's step: `down -v`, then `up -d --build`)

### Phase 5: API layer collapse
- [x] E Generic proxy with auth injection, 401 refresh-retry, streaming, header hygiene; proxy tests
- [x] E `platform/api/http.ts`; delete `lib/fetcher.ts`, `lib/api/*`, all BFF routes except auth
- [x] E `src/tools/reader/api.ts`; `packages/api-types` from OpenAPI (or hand-written) (hand-written types in `src/tools/reader/types.ts` and `src/platform/jobs/types.ts`)
- [x] E Summaries UI on `Summary`/`Job`: stages, `waiting` hint, cancel, retry, working strategy picker, summary list
- [x] E Remove route aliases and the status shim; tag `phase-5`

### Phase 6: optional
- [ ] O TanStack Query
- [ ] O `platform/ai` facade in the API for the first Node tool
- [ ] O Presigned uploads/downloads
- [ ] O SSE job stream
- [ ] O Refresh rotation, multi-session, user-keyed throttling
- [ ] O Tagging; `UserPreference`; Loki/metrics

---

## Appendix A: Evidence index

| Finding | File(s) |
|---|---|
| Strategy dropped in transit | `readwise-workers/shared/messaging.py:60-68`, `readwise-workers/workers/extraction-worker/main.py:168`, `readwise-workers/workers/summarization-worker/main.py:362` |
| Error books hidden | `readwise-gateway/src/modules/books/books.service.ts:118-124` |
| Extraction deleted from wrong bucket | `readwise-gateway/src/modules/books/books.service.ts:271-276`; `readwise-workers/workers/extraction-worker/main.py:124` |
| Dual `db push` | `readwise-gateway/docker-entrypoint.sh`, `readwise-workers/entrypoint.sh` |
| Only auth migrations | `readwise-gateway/prisma/migrations/2025081011*`, `2025081014*` |
| Cross-module imports | `readwise-gateway/src/modules/dictionary/dictionary.{module,service,controller}.ts`; `src/modules/summarizer/summarizer.{service,models}.ts` |
| Ack after the whole job; heartbeat 0 | `readwise-workers/workers/summarization-worker/main.py` (`message_callback`), `readwise-workers/shared/messaging.py` (`build_amqp_url`, `setup_consumer`) |
| No `rabbitmq.conf` mounted | `readwise-infra/docker-compose.yml` |
| Legacy pipeline still instantiated | `readwise-workers/workers/summarization-worker/main.py` (`TextSummarizer(...)`, `_save_summary_to_s3`) |
| Hard-coded tool lists | `readwise-client/components/AppSwitcher.tsx`, `app/page.tsx`, `middleware.ts`, `app/{reader,learning,dictionary,settings}/layout.tsx`, `app/(consts)/routes.ts` |
| Global typed registry | `readwise-client/lib/fetcher.ts` |
| Feature providers in shell | `readwise-client/app/layout.tsx`, `app/(providers)/Providers.tsx` |
| Buffered download, unlimited upload | `readwise-client/app/api/books/[id]/download/route.ts`, `lib/api/endpoints/books.ts`; `readwise-gateway/src/modules/books/books.controller.ts` |
| Logger not wired | `readwise-gateway/src/main.ts`, `src/common/logger/*`, `src/common/middleware/request-logger.middleware.ts` |
| No-op readiness checks | `readwise-gateway/src/modules/health/health.controller.ts:96-126` |
| Dead contracts package | `readwise-contracts/schemas/events/summarize.request.v1.schema.json`, `.github/workflows/ci.yml` |
| Unused deps / env | grep results: `jose`, `crypto-js`, `jszip`, `s3-request-presigner`, `S3_PUBLIC_*`, `OPENAI_API_KEY` |
| Pipeline structure worth preserving | `readwise-workers/workers/summarization-worker/{core/protocols.py, core/models.py, config/settings.py, orchestration/pipeline_builder.py, orchestration/pipeline.py, checkpoint/manager.py}` |

## Appendix B: Lines of code by area (confirmed by `find | xargs wc -l`)

| Package / area | Lines |
|---|---:|
| readwise-client total | 24,911 |
| client `app/reader` (incl. summary 1,389) | 6,811 |
| client `app/dictionary` | 3,526 |
| client `app/learning` | 1,336 |
| client `app/api` (BFF) | 1,588 |
| client `app/(components)` | 2,374 |
| client `components` (incl. `ui` 2,230) | 2,461 |
| client `hooks` (useDictionary 726, useLearning 286) | 1,709 |
| client `lib` | 1,954 |
| readwise-gateway total | 9,729 |
| gateway learning | 3,974 |
| gateway dictionary | 2,158 |
| gateway books | 873 |
| gateway summarizer | 289 |
| gateway highlights + notes | 602 |
| gateway auth + users | 555 |
| readwise-workers total | 9,908 |
| readwise-contracts total | 990 |
