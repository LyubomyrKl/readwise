---
name: money-session
description: Start or continue a work session on the money tool the way docs/money/plan.md prescribes: find the next milestone in the Progress section, write the tests for its done-when line first (apps/api/test/db/money-m<N>.db-spec.ts through moneyHarness), then the code, run every check, update Progress, commit as feat(money). Use it whenever the user says "money", "next milestone", "M7", "ledger", "continue the money tool", "start a session", asks what is left in the money plan, or when a change touches apps/api/src/tools/money, apps/web/src/tools/money or prisma/schema/money.prisma, so the six money rules stay in view.
argument-hint: "[milestone or task]"
---

# Money session

Requirements: `docs/money/requirements.md`. Plan, milestones, working method and progress: `docs/money/plan.md`. Claude's access: `docs/money/claude-access.md`. One milestone per session, in order; tests first.

## Steps

0. Read `docs/money/plan.md` in full first; it is short, and the Milestones table and the Progress section decide everything that follows.
1. The next milestone is the first row of the Milestones table without a done entry in Progress. If every row is done (true since 2026-10-29), do not invent work: say the plan is exhausted and offer what it leaves to the user, the M2 review against bank screenshots, the M3 review against Investments.md, the open questions in `docs/money/requirements.md`, the untested "any view under 1 s with 20 years of data" target; or add an M7 row (builds, done-when) with what the user picks before building it. If the user named a task instead of a milestone, do that task under the same rules.
2. Tests first. `apps/api/test/db/money-m<N>.db-spec.ts`, built on `moneyHarness()` from `test/db/money-harness.ts` (the real `MoneyModule` on the Postgres at `DATABASE_URL`, a fresh user per spec). Encode the done-when line literally, a figure to the cent, a count of lots, not a smoke test; the existing specs show the voice. Run with `/checks db` and see it red before writing code.
3. Code until green. Every way into the ledger posts through `MovementsService` and takes `LedgerService.lock` first; amounts through `core/money.ts`, quantities through `core/quantity.ts`, `assertBalanced` from `core/ledger.ts` before any write. Schema changes go through `/migration`, because the ledger rules also live in SQL triggers. What runs on its own goes in `automation/`; `MoneyModule` must boot without a queue, which the DB specs rely on. Claude's access stays read-only except `propose_movement`, which makes drafts.
4. Web in `apps/web/src/tools/money` (`api.ts`, `queries.ts` with `moneyKeys`, `pages/`); writes go through `useMoneyMutation`, which invalidates everything, because balances and views depend on every movement.
5. `/checks full`. Then add the milestone to the Progress section: done, what was built, the test file and what it proves, in the voice of the entries already there.
6. Commit as `feat(money): M<N> <name>` (the history shows the form: `git log --oneline -- apps/api/src/tools/money`). Reviews that need the user's data (bank screenshots, Investments.md) happen with the user, outside the 06:30–10:00 block.

## The six rules, in full in CLAUDE.md

1. Amounts are integers in minor units (BigInt); quantities exact decimals; no floating point where money is stored or summed.
2. Double entry: every transaction's entries sum to zero per currency or asset; conversions and trades post against the conversion account.
3. One database transaction per write.
4. Posted transactions never change; a fix is a correcting transaction, a delete is a reversal.
5. Rates convert for display only.
6. Currencies come from the seeded table; the base currency is a setting.

## Report

Which milestone or task, the done-when line and the test that encodes it, what passed, what the Progress entry says, and what is left for the user (reviews, open questions).
