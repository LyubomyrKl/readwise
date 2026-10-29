---
name: new-tool
description: Add a new tool (mini-app) to the Workbench toolbox on both sides. API: the NestJS module, the tool-registry line, prisma/schema/<id>.prisma with <id>_ tables and its migration, the lint boundary block. Web: manifest, routes, api.ts, queries.ts, pages, the registry line, route files under app/(shell)/apps/<id>, the lint boundary block. Background work through the platform job runner (Node) or a Python handler in apps/workers. Use it whenever the user wants a new tool, app, module, section, "something like money or reader for X", a feature that belongs to neither existing tool, or wants to check that a tool is fully wired (scripts/check_tool.sh). Not for a new endpoint inside an existing tool (that is /endpoint).
argument-hint: "<tool-id> [Display name]"
---

# New tool

The architecture is in `docs/toolbox-architecture-plan.md`; README "Adding a tool to the web app" is the short form. Two files are the only places that know which tools exist: `apps/api/src/tool-registry.ts` and `apps/web/src/platform/shell/registry.ts`. A tool imports the platform and shared UI, never another tool, and the platform never imports a tool. Lint enforces both with one boundary block per tool in each app, so a new tool without its block is unguarded; `scripts/check_tool.sh` reports a tool whose block is missing.

## 1. Decide the id and the shape

- The id is the URL segment (`/apps/<id>`), the table prefix (`<id>_`), the job type prefix (`<id>.`) and both folder names. Lowercase letters, digits, hyphens.
- Decide what it owns: tables, pages, background jobs, settings. Look at `money` for a tool with many sub-areas and automation, at `reader` for one with files and Python jobs.
- The user decided reader and summarizer are one tool and that there is no shared "documents" layer; do not propose either.

## 2. API

Templates for every file are in `references/templates.md`; read it before writing.

1. `apps/api/src/tools/<id>/<id>.module.ts` with controllers and services. Anything that needs the queue (job handlers, a scheduler) goes in a second module, `<id>-automation.module.ts`, composed by `<id>-tool.module.ts` as money does, so the core module boots in tests without RabbitMQ.
2. One import and one entry in `apps/api/src/tool-registry.ts`.
3. `apps/api/prisma/schema/<id>.prisma`: every model `@@map("<id>_name")`, and a `userId` on every row the user owns, because every query filters by `req.user.userId`. Then `/migration` for the migration.
4. A boundary block in `apps/api/eslint.config.mjs`: copy `moneyBoundaries`, replace the id, add it to the exported array.
5. Endpoints through `/endpoint`. `test/e2e/app.e2e-spec.ts` boots the whole AppModule with fakes, so a provider missing a dependency or a module not registered fails there without Postgres.

## 3. Web

1. `apps/web/src/tools/<id>/`: `manifest.ts` (the `ToolManifest`: id, name, one-sentence description, icon, nav, optional action button and settings sections), `routes.ts` (every URL the tool owns, built on `TOOLS_BASE_PATH`), `types.ts` (hand-written mirrors of the API types; there is no generator), `api.ts` (one function per endpoint over `apiFetch`), `queries.ts` (query keys and hooks; writes invalidate the tool's root key), `pages/`, and a `<Name>ToolLayout` when the pages share chrome.
2. One import and one entry in `apps/web/src/platform/shell/registry.ts`.
3. Route files: `apps/web/app/(shell)/apps/<id>/page.tsx` re-exporting the home page, one file per page, `layout.tsx` when there is a tool layout. A settings section declared in the manifest needs `app/(shell)/settings/<id>/page.tsx`. Route files hold one line; the pages live in the tool.
4. A boundary block in `apps/web/eslint.config.mjs`: copy the reader's, replace the id.
5. `__tests__/platform/registry.test.ts` already checks every registered tool for its route directory, nav under `/apps/<id>` and settings under `/settings/`; it fails until step 3 is done.

## 4. Background work, only when the tool has any

- Node: a service that takes `NodeJobRunner` and calls `registerHandler('<id>.<job>', async (ctx) => ...)` in `onModuleInit`; enqueue with `JobsService.enqueue`. Lives in the automation module. Example: `apps/api/src/tools/money/automation/money-jobs.ts`.
- Python: `apps/workers/worker/tools/<id>/handlers.py` with `TOOL_ID`, `BINDINGS` (`jobs.<id>.<job>`) and `build_handlers(settings, storage)`, one line in `apps/workers/worker/__main__.py`. Handlers get everything in the payload and report through events; they never touch the database. Example: `worker/tools/reader/handlers.py`. Then `npm run test:workers`.
- LLM calls from Node go through `AiService` (`apps/api/src/platform/ai`), which shares the `OLLAMA_*` settings with the workers.

## 5. Verify

```
.claude/skills/new-tool/scripts/check_tool.sh <id>
```

lists what is wired and what is missing on both sides, including the lint blocks and the table prefix. Then `/checks full`.

## Report

The id, the files created on each side, what `check_tool.sh` says, and what was deliberately left out (no settings page, no jobs, no tables) so the user knows it is a choice and not an omission.
