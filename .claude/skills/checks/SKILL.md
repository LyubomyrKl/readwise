---
name: checks
description: Run this repository's pre-push checks in the right order and report what is green and what failed, with the failing output: lint, typecheck, unit tests, API e2e, then the money ledger specs plus the migration drift check against a throwaway Postgres (never the running stack), and the Python worker tests when apps/workers or packages/contracts changed. Use it whenever the user says "run the checks", "run the tests", "is it green", "ready to push", "verify", "run CI locally", "test:db", or before declaring any change in this repo finished, even if they name only one check.
argument-hint: "[fast|full|db|workers]"
allowed-tools: Bash(npm run lint:*), Bash(npm run typecheck:*), Bash(npm test:*), Bash(npm run test:e2e:*), Bash(npm run test:workers:*), Bash(.claude/skills/checks/scripts/db-check.sh:*)
---

# Checks

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, e2e, a migration drift check, the money DB specs, pytest and three Docker builds. Running the same before a push is the project rule (CLAUDE.md). This skill is that sequence, with the awkward part, a migrated Postgres for the money specs, scripted.

## Modes

| Argument | Runs | When |
|---|---|---|
| `fast` | lint, typecheck, unit tests | between edits |
| `full` (default) | fast, then e2e, then `db` | before a commit or push |
| `db` | the throwaway-database part only | after a schema, migration or ledger change |
| `workers` | `npm run test:workers` (pytest in `python:3.11-slim`; the Mac has no 3.11); `/workers-test` reads a failure | after a change under `apps/workers` or `packages/contracts` |

`workers` is not part of `full` because it needs Docker and takes a minute; add it yourself when the diff touches those paths.

## Steps

1. After a pull or a branch switch, run `npm install` at the root and `npx prisma generate` in `apps/api` first. Without them lint reports about two thousand "could not be resolved" errors and the DB specs fail on missing modules; neither is a real failure.
2. From the repository root, in this order, stopping at the first failure:
   ```
   npm run lint
   npm run typecheck
   npm test
   npm run test:e2e
   .claude/skills/checks/scripts/db-check.sh
   ```
   Lint and typecheck go first because they are the fastest and a type error makes every later failure noisy.
3. `db-check.sh` recreates the database `money_session_check` in the legacy `summarizer-db` container (role `money_check`), applies every migration, checks that the migration files and the Prisma datamodel agree (as CI does), then runs `apps/api/test/db/*.db-spec.ts`. It refuses the running stack (`workbench-db`, port 45432) and the legacy dev database (`appdb`), because the specs write. Options: `--reuse` keeps the database (faster when only specs changed), `--no-drift`, `--no-specs`, and `--print-url`, which prints the migrated database's URL for `prisma migrate dev` (see `/migration`). Another Postgres: set `DATABASE_URL` (and `SHADOW_DATABASE_URL` for the drift check).
4. On a failure, read the output before doing anything else and decide: the change under test, a stale environment (step 1), or the environment itself (Docker down, a port taken, the container missing). Rerun only when you have a reason to expect a different result; a flaky test is a finding, not a reason to run until green.

## Report

Lead with green or red. Then one line per check with its result; for a failure, the failing test names or the first error, verbatim, in a code block. Say which checks were not run and why. Never report a check as passed that was skipped.
