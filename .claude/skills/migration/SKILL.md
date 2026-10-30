---
name: migration
description: Change the database schema the way this repo requires: edit the owner's file in apps/api/prisma/schema (platform, reader, money or the tool's own), generate the migration with prisma migrate dev against the throwaway database (never db push, never the running stack or the legacy appdb), keep the money ledger triggers in step, then run the drift check and the DB specs. Use it whenever the user wants a new table, column, index, enum or relation, says "migration", "schema change", "add a field to the model", "prisma", or when editing a Prisma model is part of a larger task.
argument-hint: "<change-name>"
---

# Migration

Schema changes reach every database through the files in `apps/api/prisma/schema/migrations`: the Docker `migrate` service applies them before the API starts, and CI checks that the files and the Prisma datamodel agree. `prisma db push` would leave a change with no history, so it is never used here. The header of `apps/api/prisma/schema/schema.prisma` and README "Database and migrations" state the rules.

## Steps

1. Edit the owner's file: `platform.prisma` (User, RefreshToken, Job), `reader.prisma`, `money.prisma`, or the tool's own file. New tables are `@@map("<tool>_name")` and carry a `userId`.
2. Generate against a migrated throwaway database:
   ```
   cd apps/api
   DATABASE_URL=$(../../.claude/skills/checks/scripts/db-check.sh --print-url) && export DATABASE_URL && npx prisma migrate dev --name <change>
   ```
   One chained line on purpose: the assignment carries the script's exit status, so when the script fails (container down, a refused URL) nothing runs against an empty `DATABASE_URL`, and its message on stderr says why. `migrate dev` needs a database at the current migration state and the right to create a shadow database; the throwaway (`money_session_check` in the `summarizer-db` container, role `money_check` with CREATEDB) has both. The dev `.env` points at `appdb`, which has no migration history, so `migrate dev` there would offer to reset it: do not accept. `unset DATABASE_URL` afterwards.
3. Read the generated SQL. Prisma writes what the datamodel implies; what it cannot know goes into the same file by hand: triggers and constraints (the `money_rules` and `money_rules_hardening` migrations are the pattern), backfills, partial indexes, column renames (Prisma generates drop and add, which loses data; write `ALTER TABLE ... RENAME COLUMN`). A change to a `money_*` table that the triggers watch needs the trigger updated and a `test/db/*.db-spec.ts` case proving the rule still holds.
4. House style for the folder name is `YYYYMMDD000000_<change>`; rename what `migrate dev` produced if you want it to match, keeping it later than the last one.
5. `migrate dev` regenerated the Prisma client, so typecheck sees the new fields. Run `/checks db` (drift check and DB specs), then `/checks full` before the commit.
6. Commit the migration folder with the schema and the code that uses it. Deploying needs nothing more: the `migrate` service applies it on the next `docker compose up`.

## Pitfalls

- A schema edit without a migration passes typecheck and the unit tests and fails only in the drift check and in Docker. That is what `/checks db` is for.
- Posted money transactions never change (rule 4). A migration that rewrites `money_entry` rows is a correcting transaction's job, not SQL's.
- A relation to `User` needs its back-relation field on `User` in `platform.prisma`, or `prisma validate` fails.

## Report

The migration folder name, what the SQL does beyond what Prisma generated, and the result of the drift check and the DB specs.
