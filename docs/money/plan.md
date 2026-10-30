# Money — Implementation plan

Built milestone by milestone; every milestone ends deployable with its tests
passing. Requirements: [`requirements.md`](requirements.md).

## Where it lives: a Workbench tool

The original plan was a standalone Next.js app with pg-boss and Vitest. The
Workbench toolbox already provides the shell, auth, Postgres, Compose, Caddy,
backups and a job system, and was built for a second, Node-side tool
([`../toolbox-architecture-plan.md`](../toolbox-architecture-plan.md) §2.10). So
money is the tool `money`, and the stack choices map like this:

| Plan said | Built as | Why |
|---|---|---|
| Next.js server actions + API routes | `apps/api/src/tools/money` (NestJS module, REST under `/api/money/*`) and `apps/web/src/tools/money` (pages, mounted at `/apps/money`) | Only the API touches the database (Workbench rule) |
| PostgreSQL 16 + Prisma | Same; `prisma/schema/money.prisma`, tables `money_*` | One database, one migration history |
| Zod on every input | Zod for money parsing; DTOs follow the API's class-validator convention | Match the surrounding code |
| pg-boss | The platform job system (Node runner inside the API) | No second queue |
| Passkey + one-time-code app | Platform login today; passkey + TOTP is a platform task (open, see M0) | Auth belongs to the platform, not the tool |
| Hetzner + Docker Compose + Caddy | Same stack, already running | Nothing new to run |
| Nightly dump off-server; restore tested | Platform `backup` service + `scripts/money-backup-restore-check.sh` | Restore proven per milestone |
| Vitest + Playwright | Jest (repo convention) for logic; DB-backed specs under `apps/api/test/db`; Playwright for main flows from M1 | Match the surrounding code |
| European Central Bank + NBP rates | Same, as Node jobs in M5 | Free, official |

## Money rules the build may never break

Copied into [`/CLAUDE.md`](../../CLAUDE.md).

1. Amounts are integers in the smallest unit of their currency (BigInt); asset quantities are exact decimals (28 digits, 10 after the point). No floating point anywhere money is stored or summed.
2. Double entry: every transaction's entries sum to zero per currency or asset. Income, expenses and opening balances post against system accounts; a currency conversion or a trade posts against a system "conversion" account per currency, so each side still sums to zero. Checked in code and in tests on every write.
3. One database transaction per write: all entries land or none do.
4. Posted transactions never change. A fix is a correcting transaction that points to the original; deleting means reversing.
5. Exchange rates convert for display only. Stored amounts are what actually moved.
6. Every supported currency comes from one seeded table (ISO 4217 code, decimal places), not from code; switching the base currency is a setting.

## Data model

Currencies and assets share one table (`money_commodity`), so a sub-account can
hold euros or VWCE units the same way, and every balance is a sum of entries.

| Table | Key fields | Notes |
|---|---|---|
| Settings | base currency, default cost-basis method, tax residence | One row per user; base currency switchable |
| Commodity | code, kind (currency or asset), decimal places, name | Seeded with ISO 4217 currencies (id = code); assets added by you |
| Asset | commodity, ticker, quote currency, valuation (manual, price feed, bond formula) | VWCE, EDO, anything later |
| Asset class | name | Own list; targets live in Allocation target |
| Asset class split | asset, class, % | One asset can sit in several classes |
| Institution | name, kind (bank, broker, bond registry, lender, cash) | |
| Account | institution, type (bank, investment, bonds, debt, system), tax wrapper, cost-basis method override, archived at | System accounts: income, expense, opening balance, conversion |
| Sub-account | account, commodity | One per currency or asset held |
| Category | name, kind (income, expense), parent | Nested |
| Transaction | date, kind, note, category, status (posted, draft, template), corrects, recurring rule, import row | Kinds: income, expense, transfer, buy, sell, investment income, fee, unit move, split, correction, opening balance |
| Entry | transaction, sub-account, amount minor (BigInt) or quantity (decimal) | The only place money lives |
| Lot | buy entry, asset, account, units, remaining units, cost amount + currency, cost in PLN, acquired at | Opened by every buy |
| Lot consumption | sell transaction, lot, units, cost allocated | Written by the cost-basis method on a sale |
| Price | asset, date, price, quote currency, source | Manual, import and feed all write here |
| Exchange rate | date, from, to, rate, source (ECB, NBP) | |
| Allocation target | class, target %, valid from | History of targets kept; current = latest valid from |
| Recurring rule | template (a transaction), schedule, next run, auto-post or draft | |
| Import batch / import row | source profile, file hash / raw row, mapped transaction, dedupe hash, status | Money-manager, bank and IBKR imports |
| API token | name, scope (read, draft), hash, revoked at | Claude's access |
| Audit log | who, what, when | Every write |

The database enforces rules 2 and 4 as well as the code: a deferred constraint
trigger rejects a commit whose entries don't sum to zero per commodity, and
entries of posted transactions cannot be updated or deleted.

## Milestones

| # | Builds | Done when |
|---|---|---|
| M0 Foundation | Docs, CLAUDE.md, Prisma schema for every table above, money helpers (integer amounts, decimal units, rounding, allocation), ledger balance check, currency seed, tool registered in API and web, backup restore check | Money-helper and DB-rule tests pass; a backup restores into an empty database. Open: passkey + TOTP login (platform) |
| M1 Accounts and movements | Institutions, accounts, sub-accounts, archive; income, expense, transfer (same and cross-currency, with fee); categories; corrections; balances | A cross-currency transfer with a fee balances to zero per currency; balances match the banks to the cent |
| M2 History import | Money-manager CSV import: column mapping screen, preview, duplicate detection, opening balances | Full history is in; every account's balance equals today's screenshot |
| M3 Investments | Assets, classes, targets, splits; Buy form; positions cards; sell with FIFO or average cost; investment income, fees, unit moves, splits; manual prices; EDO value | VWCE shows 71 units on IBKR with the right cost; a test sale consumes the oldest lots first |
| M4 Views | Net worth in any base currency; by account, currency, class; allocation vs target with drift; monthly income, expenses, invested, savings rate; net worth over time | Switching USD → EUR → PLN changes every total; savings rate matches a hand calculation for one month |
| M5 Automation | Daily ECB and NBP rates; price feed adapter; recurring movements; bank CSV profiles (mBank, PKO, ZEN); IBKR import; yearly tax report with PLN cost basis per lot | Rates arrive unattended; last month's IBKR trades import with no duplicates; the tax report matches the lots in Investments.md |
| M6 Claude access and polish | Read-only API and an MCP server; draft scope (Claude proposes, you approve); home screen with the three answers; phone home-screen app | Claude answers "what's my savings rate this month" from live data; a Claude draft posts only after approval |

## Working method

1. One milestone per agent session, in order. Each session starts by writing the
   tests for that milestone's done-when line, then the code, then runs everything.
2. Reviews: after M0 (schema), after M2 (balances match screenshots), after M3
   (positions match Investments.md). Other milestones: skim the test output.
3. Reviews happen outside the 06:30–10:00 block.

## Progress

- **M0** — done: schema for every milestone with the rules enforced in Postgres (`money_rules`
  migration), money helpers, currency seed, passkeys and the authenticator-app second factor,
  nightly dump with an off-server copy (`backup-offsite`) and a restore check.
- **M1** — done: institutions, accounts with currency sub-accounts and opening balances,
  archive; income, expense, fee, transfer (same and cross-currency, fee as an expense, implied
  rate); categories; reversal and correction; drafts with approval. Tests:
  `test/db/money-m1.db-spec.ts` (a cross-currency transfer with a fee nets to zero per
  currency; balances add up to the cent through every kind of movement).
- **M2** — done: upload (UTF-8 or Windows-1250, delimiter detected), column mapping screen with
  guesses from the header (English and Polish), type values, account mapping or creation, review
  with duplicate (same fingerprint imported before) and match (same account, amount, ±3 days)
  detection, today's balances turned into opening balances, one-transaction commit. Tests:
  `test/db/money-m2.db-spec.ts` (every balance equals the bank's figure to the cent; a re-import
  is recognised; a hand-typed movement is not doubled).
- **M3** — done: assets (any instrument; manual price, price feed or bond formula), asset classes
  with target history and per-asset shares, cash of an account counted in a class; buy (all-in
  cost, paid from any account, or held before tracking), sell (FIFO or average cost per
  account, never back-dated past a later sale), investment income with tax withheld, unit moves
  that keep cost and dates, splits; lots with cost in PLN at the NBP rate of the business day
  before; positions with value and gain; the EDO formula (annual capitalisation, margin plus
  inflation, floored at the margin). Tests: `test/db/money-m3.db-spec.ts` (71 VWCE at the exact
  cost of three buys; a sale takes the oldest lots first; reversals restore lots).
- **M4** — done: net worth in any base currency (by account, currency, type and class; assets
  priced, bonds by formula, unpriced at cost; missing rates named, never guessed), allocation
  against the target with drift in points and amount, monthly income, expenses, amount invested
  (money moved from bank and debt accounts into investments, at cost) and savings rate, net
  worth at each month end, snapshots. Web: the overview answers the three questions; Reports
  has net worth over time, monthly bars and savings rate, month categories, allocation and
  snapshots, each chart with a table view. Tests: `test/db/money-m4.db-spec.ts` (USD, EUR and PLN
  totals each match a hand calculation; March savings rate 63.1% by hand).
- **M5** — done: the daily jobs on the platform job runner (`money.recurring` 06:00,
  `money.rates` 17:15, `money.prices` 18:30, `money.snapshot` after each quarter end; a missed
  day runs at once), ECB and NBP table A fetched from the first movement on and stored once,
  lots waiting for their NBP rate filled in (a tax rate older than a week counts as missing),
  rates typed in by hand; Stooq end-of-day prices (month-end history the first time);
  recurring movements (RRULE subset, a draft each time or posted on the day, caught up after a
  pause in the server, one database transaction per occurrence); mBank, PKO BP and ZEN statement
  profiles (transfers between own accounts recognised by account number) and the IBKR activity
  statement (trades, currency conversions, dividends with the tax withheld, interest, fees;
  deposits only matched); the yearly PIT-38 report from the lots, with CSV. Tests:
  `test/db/money-m5.db-spec.ts` (rates arrive from the schedule and fill a lot's PLN cost; July's
  IBKR statement and then July plus August import with no duplicates; the tax report's costs
  are the shares of the lots' PLN cost).
- **M6** — done: Claude's access with tokens the user creates and revokes (only the SHA-256 is
  stored; scopes read, and read-and-propose); a read API and an MCP server (Streamable HTTP,
  stateless) at `/api/money/claude/*`, the only API path Caddy routes past the web app; tools for
  the summary, months, net worth, allocation, accounts, categories, transactions, positions and
  drafts, and `propose_movement` for draft tokens, whose proposals wait under Drafts marked
  "From Claude". The overview answers the three questions (since M4); phone home-screen
  shortcuts to Money and a new movement. Rates: the freshest rate wins, a rate typed in on ties.
  Tests: `test/db/money-m6.db-spec.ts` (over HTTP with the MCP client: the savings rate this
  month, live; no token, an unknown or a revoked one get 401; a read token cannot propose; a
  Claude draft moves no money until it is approved). Connecting Claude:
  [`claude-access.md`](claude-access.md).
- **Review** — fixes from a review of the whole app: the posting database transaction is recorded
  on the row (`money_rules_hardening`), so no later one can add entries, not even after updating
  the row; zero entries are refused; a transaction can be reversed once (unique index). Every
  ledger write takes the user's lock first (`LedgerService.lock`), so sales of the same units,
  two reversals or two approvals at once cannot both pass their checks. An approved split draft
  posts itself; a split cannot be dated before later trades, undone under them, or skipped by
  reversing an older buy or sale. A posted draft keeps what was approved; opening balances go
  through `MovementsService`; targets over 100% (now or from a later day) are not saved; a run by
  hand does not stand in for the scheduled one; today is the money time zone's; prices need an
  asset; PLN places come from the currency table. Passkeys and the authenticator app need the
  password again (and the code when it is on). Tests: `test/db/money-concurrency.db-spec.ts` and
  additions to the ledger and milestone specs.
- **Check, Oct 29** — nothing in the table above is left to build. Every milestone's checks were
  run again on the current main: lint, typecheck, unit and e2e tests, and the nine DB specs
  (68 tests) against a freshly migrated database, all passing. Two platform faults found by
  running the stack on this code were fixed: the web container's health check (`localhost`
  resolved to IPv6 inside the image, so the container was reported unhealthy for ever), and the
  API's RabbitMQ setup, where the Node runner's bindings for the money jobs raced the topology
  on a fresh broker (404, channel closed, again on every reconnect: no job of any tool ran).
  Binds and consumes now wait for the topology of their channel. What is left needs you: the M2 review (balances against
  today's screenshots), the M3 review (positions against Investments.md), the open questions
  in [`requirements.md`](requirements.md), and the latency target (any view under 1 second
  with 20 years of data), which has no test yet.
- **Real data, Oct 29** — the history from the old money app went in through the importer, and
  EDO and VWCE as buys (one-off scripts, outside the repo). What using it showed got fixed: units
  are held only in investment or bonds accounts (buy, sell and both sides of a unit move; the
  money may still come from any account), test `test/db/money-holding-accounts.db-spec.ts`. The
  price feed moved from Stooq, which closed its CSV address, to the Yahoo Finance chart API
  (`MONEY_PRICE_FEED_BASE_URL`); closes are read from the text and rounded to the exchange's
  precision, so none passes through a float (`core/feeds.spec.ts`, the M5 spec). On the web:
  accounts as a compact table by institution, investments in two columns, a currency picked in
  the account form is added at once, the institution kind left the form (it was never used),
  institutions with only archived accounts are not offered, the Fee and Opening balance tabs
  left New movement (a fee is an expense in Fees; an opening balance is set per currency on the
  account's page), and the trade forms offer only investment and bonds accounts to hold units.
  Second round: an account number belongs to each currency (`money_sub_account.number`,
  migration `sub_account_number` copies the old ones over), set per currency on the account's
  page; an account's group (institution) is optional, "Other" in the lists; an expense takes a
  fee on top, booked under Fees; dividends and interest only into investment or bonds accounts.
  Test: `test/db/money-accounts-fees.db-spec.ts`. On the web: "Group" instead of
  "Institution", whole rows open the account, the currencies of an account as rows with a menu,
  tax and cost basis only for investment accounts (cost basis under Advanced), a fee on buy,
  sell, transfer and expense, Split last.
  Third round: a whole range of months by category (`views/period`, test in the same spec),
  shown under Reports for the chosen range, a clicked month in its place. The Tax page and the
  tax and cost-basis fields left the web (EDO is taxed at source, IBKR is filed by hand; the API
  and its defaults, taxable and first in first out, stay); "Split" reads "Unit count change";
  percent fields accept "80%".
  Snapshots list every account and currency they hold. Drafts and recurring movements left the
  web (the API keeps them); Claude's new tokens are read only.
  Accounts merge (`POST accounts/:id/merge`): the source's currencies move to the other account
  with their entries, nothing posted changes; refused across types, for a shared currency and
  for units (`test/db/money-merge-accounts.db-spec.ts`). Accounts as cards, an account's
  currencies as tiles, snapshots export to CSV.
  Claude's custom connector: OAuth 2.1 with PKCE (`claude/oauth.*`, table `money_oauth_code`),
  metadata and token public through Funnel, approval on the private `/apps/money/connect`; it
  mints an ordinary read token (`test/db/money-oauth.db-spec.ts`). Hardened: the public paths
  answer only Anthropic's outbound range and the tailnet (Caddy, strict client address),
  connector tokens live a day and renew by a rotating refresh token, the last address is kept.
