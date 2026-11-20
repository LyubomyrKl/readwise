# Workbench — agent notes

Personal toolbox: `apps/web` (Next.js), `apps/api` (NestJS + Prisma, the only
code that touches the database), `apps/workers` (Python). Architecture:
`docs/toolbox-architecture-plan.md`. Tools live in `src/tools/<id>` on both
sides and own `prisma/schema/<id>.prisma` with `<id>_*` tables.

Deploying or updating the server: `docs/deploy.md`. Its Rules come first (the host is
shared with a Telegram bot that must stay untouched).

Checks before pushing: `npm run lint && npm run typecheck && npm test && npm run test:e2e`,
and for the money tool with a Postgres at `DATABASE_URL`: `npm run test:db --workspace apps/api`;
for reader changes also the browser tests (Readers, below).

Skills for the recurring work live in `.claude/skills/` (`/checks`, `/new-tool`, `/endpoint`,
`/migration`, `/money-session`); `/new-skill` makes or revises one.

A page's back arrow is `BackLink` (or `useBack`) from `apps/web/src/platform/ui/BackLink.tsx`: back
to the page the user came from when it is the app's, up to a fallback route otherwise. A form that
saves goes back the same way; a page whose own object is deleted or merged away moves on with
`router.replace`, so going back never lands on a spent form or a page that is gone.

## Readers

Architecture, decisions, measurements and how to test: `docs/document-architecture.md` (the
evidence behind it: `docs/readers-investigation.md`). One shell, two engines
(`apps/web/src/tools/reader/reading/`): PDFs through PDF.js, pinned at 6.4.299 and its legacy build
(Safari); reflowable books through foliate-js, vendored in `apps/web/src/vendor/foliate-js` (its
local changes are listed in VENDORED.md there). Keep to these:

1. Positions, highlights and notes are Locator v2 (`reading/locator/`). The quote is the record;
   CFIs, quads and offsets are caches, found again by the quote. A change to text normalization or
   quote matching goes into both twins (`locator/*.ts` and `apps/workers/worker/tools/reader/locator.py`)
   and the shared cases in `packages/contracts/locator/`.
2. Book content never runs: keep the reader page's CSP (`apps/web/src/platform/security/csp.ts`)
   and the sanitizer hooks in `ReflowEngine.guard`; the CSP browser test proves it.
3. Books are read in ranges of the original file: no whole-file fetch for PDFs or for EPUBs over
   4 MB; the download endpoint keeps Range/206, the ETag and identity encoding; the user's own files
   skip the throttler.
4. IR additions are optional fields; raise `IR_VERSION` only when the edition engine must see the
   change, because it is part of the editions' cache key.
5. Reader changes are proven in real browsers: `npm run test:browser --workspace apps/web` (Chrome
   and WebKit) against the isolated stack of `scripts/reader-test-stack.sh`, never the `workbench`
   stack; real books live outside the repo (`READER_BOOKS`).

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
database backs rules 2 and 4 with triggers (see the `money_rules` and
`money_rules_hardening` migrations). Every way into the ledger (endpoints, drafts,
imports, recurring rules, opening balances) posts through `MovementsService`, and
every write takes the user's lock first (`LedgerService.lock`). A merged category (`mergedIntoId`) stays for the
posted rows that point at it: every read shows and counts it as the one it went into, and `ledger.post` books it
there. What runs on its own lives in `automation/` (jobs
`money.rates`, `money.prices`, `money.recurring`, `money.snapshot` on the platform
job runner); `MoneyModule` itself needs no queue, which is what `test/db` relies on.
Claude's access (`claude/`: tokens, the read API and the MCP server at
`/api/money/claude/mcp`) is read-only except `propose_movement`, which only makes
drafts; keep it that way. See `docs/money/claude-access.md`.
