# Workbench — agent notes

Personal toolbox: `apps/web` (Next.js), `apps/api` (NestJS + Prisma, the only
code that touches the database), `apps/workers` (Python). Architecture:
`docs/toolbox-architecture-plan.md`. Tools live in `src/tools/<id>` on both
sides and own `prisma/schema/<id>.prisma` with `<id>_*` tables.

Checks before pushing: `npm run lint && npm run typecheck && npm test && npm run test:e2e`,
and for the money tool with a Postgres at `DATABASE_URL`: `npm run test:db --workspace apps/api`.

## Money tool

Requirements: `docs/money/requirements.md`. Plan and milestones: `docs/money/plan.md`.
Work one milestone per session, in order: tests for the milestone's done-when line
first, then the code, then run everything. Update the Progress section of the plan.

### Money rules the build may never break

1. Amounts are integers in the smallest unit of their currency (BigInt); asset quantities are exact decimals (28 digits, 10 after the point). No floating point anywhere money is stored or summed.
2. Double entry: every transaction's entries sum to zero per currency or asset. Income, expenses and opening balances post against system accounts; a currency conversion or a trade posts against a system "conversion" account per currency, so each side still sums to zero. Checked in code and in tests on every write.
3. One database transaction per write: all entries land or none do.
4. Posted transactions never change. A fix is a correcting transaction that points to the original; deleting means reversing.
5. Exchange rates convert for display only. Stored amounts are what actually moved.
6. Every supported currency comes from one seeded table (ISO 4217 code, decimal places), not from code; switching the base currency is a setting.

In code: parse and format through `apps/api/src/tools/money/core/money.ts`
(`Money`, minor units) and `quantity.ts` (units scaled by 10^10); check every
transaction with `assertBalanced` from `core/ledger.ts` before writing it. The
database backs rules 2 and 4 with triggers (see the `money_rules` migration).
Every way into the ledger (endpoints, drafts, imports, recurring rules) posts
through `MovementsService`. What runs on its own lives in `automation/` (jobs
`money.rates`, `money.prices`, `money.recurring`, `money.snapshot` on the platform
job runner); `MoneyModule` itself needs no queue, which is what `test/db` relies on.
