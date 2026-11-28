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
- **Tidy books, Nov 19** — what using it showed, fixed without rewriting the books: the history
  lists what stands (a corrected movement once, as its replacement; a reversed one and the
  reversals not at all; the whole trail on request, `all=true`, "Show corrections and
  reversals"); accounts are dragged into an order that stays (`money_account.position`,
  `PUT accounts/order` with every account in use once; cards sort by a handle with the mouse,
  by touch or with the keyboard); categories merge (`POST categories/:id/merge`): a merged
  category leaves every list, its history shows and counts under the other one (transactions,
  filters, month and period views, tax report), and a movement or an import given it books there.
  Nothing posted changes: the category stays, pointing at the other (`mergedIntoId`), so rule 4
  holds in the database as before. Migration `money_tidy` merged the duplicates the first import
  left (Transportation into Transport, Housing into Home, Shopping into "Clothing, shopping",
  Other into Other expenses, Other into Other income; `money_merge_import_duplicates()`). The
  movement and trade forms show the picked account's balance, the currency in use first. Tests:
  `test/db/money-tidy.db-spec.ts` (a correction listed once and a deletion not at all, page by
  page; the saved order and its refusals; a merge relabels the history and the month to the cent
  while every posted row stays equal; the migration's merges, once); in the browser
  `apps/web/e2e/money.spec.ts`.
- **Overview on real money, Nov 20** — what the owner's overview showed wrong, fixed in the
  requirements as well: an account's class now covers everything it holds, cash and units
  (`money_account.classId`, renamed from `cashClassId`, kept: the allocation counted only an
  account's cash, so the broker's ETF and the bond account's bonds sat under "Not in a class",
  54.8% of it); an asset with classes of its own still counts there. Money lent out is an account
  type of its own (`lent`): a line of what you own, outside the allocation like debt. A class can be
  removed (`DELETE asset-classes/:id`). A category can be left out of the month's income, expenses
  and savings rate (`leftOutOfTotals`; "Sold belongings" comes with it, for every user), and the
  month lists it apart: selling a car made November's income 88.7k and the savings rate 91.4%.
  Migration `money_overview`. Web: "Accounts in the allocation", an asset's own classes as the
  exception, "Leave out" on a category, the left-out amounts under each month, Claude's month
  lists them as `notCounted`. Tests: `test/db/money-allocation.db-spec.ts` (an account's class
  counts its units at their value; an asset's own classes win; lent money in its own line and
  out of the classes; a removed class leaves its accounts in none; a car sold kept out of the
  income and the savings rate, and back in when the category counts again); browser tests in
  `apps/web/e2e/money.spec.ts`.
- **Assets and accounts, Nov 20** — the owner could not see how to create an asset and get it
  into an account: the asset was made on one page, the buy on another, and nothing said that
  buying is what puts an asset in an account. Now (web only): "Add a holding" everywhere a holding
  can start (the Investments page, every investment or bonds account, each asset), one form for
  buying now or already owning (the old "held before tracking" box, now a choice on top), "+ New
  asset…" in the asset picker that creates the asset with the holding (short name, full name,
  price currency, a daily price by Yahoo symbol or prices entered), the Investments page account by
  account with the empty accounts showing how to start, holdings on an account's own page with buy
  more and sell for that asset, and each asset saying where it is held. The asset form speaks plainly
  (short name, price currency, its price; ISIN and exchange ticker under More details) and, for a new
  asset, offers to add a holding of it. Tests: helpers in `money-accounts.test.ts`; in the browser,
  an investment account adds a holding of a new asset already owned, in one form, and no money moves.
- **No Investments tab, Nov 20** — with the holdings on each investment account's page, the
  Investments page only repeated them. It is gone from the navigation; what was only there moved:
  Update prices to the Holdings of an account (for what it holds) and to Assets and classes (every
  asset), and Assets and classes, now at `/apps/money/accounts/assets`, is a button on Accounts
  (the Overview's allocation links to it as before). The old addresses redirect. The sidebar now
  lights only the most specific link (Overview stayed lit on every money page, Library on the
  reader's Upload). Tests: `activeNavHref` in `registry.test.ts`; in the browser, a holding is
  priced from its account's page and the old address opens Accounts.
- **Back arrows go back, Nov 20** — every back arrow (money, reader, settings) went to a fixed page
  (an account's to Accounts even when it was opened from the Overview). Now one `BackLink` goes
  back to where you came from when that page is the app's (the browser's Navigation API says so),
  and up to the old fixed page otherwise: a page opened directly, right after signing in, or a
  browser without the API. The reader's own back did `router.back()` alone and could leave the app;
  it uses the same rule. Saving a movement, merging an account, deleting an import or a book now
  replace the page in the history, so back skips the spent form or the page that is gone. Tests:
  `back.test.ts`; in the browser, an account's movement and back, a movement saved from an account
  and back, and a movement opened in a new tab going up to the list.
- **A movement's own page, Nov 20** — it showed what the list row already says (a transfer: two
  accounts, two amounts) plus the bookkeeping side, and changing anything took another page. Now
  opening a movement opens its form, filled in: Save changes posts the correction (as Correct
  did), Delete posts the reversal (as Reverse did), and both go back where you came from; saved
  unchanged, nothing is posted (the form compares with what it first built). What the history
  keeps but no longer counts (a changed or deleted version, a reversal) opens read-only with the
  way to what took its place; the double entry is folded under the small print. A new movement,
  saved, goes back where the form was opened instead of to its page. Tests: in the browser, a
  movement saved unchanged posts nothing, changed it shows once with the new amount, deleted it
  leaves the list, and its first version opens read-only.
- **Logging made quick, Nov 20** — logging took a page of its own: two rows of tabs, an empty
  account, a currency, a category list sorted by name, a fee and the note last, nothing
  remembered. Now quick entry opens over any money page (the + button, N, a page's New button):
  the amount first with the cursor in it, "What for" suggesting the notes used before with what
  they were last time (picking one brings back its category and account; typing one exactly does
  too unless chosen by hand), the categories and accounts used most as chips with the last
  account picked, Today / Yesterday, the fee folded, Enter to save, Save and add another, and an
  Undo on every save (a reversal, rule 4). It learns from `GET /money/movements/habits?kind=`
  (read-only, only what stands; merged categories count as the one they went into, archived
  accounts are never offered). The sidebar's own New movement went: it opened the old page. Also:
  several movements at once from Transactions (Select, All shown; one category for all, each its
  own correction; or delete them, each reversed); the filters fold behind a button on a phone; an
  expense with a fee opens in its form with the fee apart (it was folded into the amount, so a
  correction moved it into the category). Tests: `money-habits.db-spec.ts`; `money-quick.test.ts`,
  `money-bulk.test.ts`, the fee in `money-lib.test.ts`; in the browser, N then a note bringing back
  Groceries and the wallet, Save and add another with Undo, and a category for two movements then
  deleting them.
- **Insights, Nov 28** — where the money is heading, on a page of its own (Insights, beside
  Transactions) and under the Overview's expenses. This month on pace: spending and income projected
  as what is in so far plus what usually followed after its last recorded day in the months before (the
  median of up to twelve; the likely range their quartiles; under three months of history, a
  straight line from the pace so far), against a usual month, and as running totals day by day
  against the usual month's (a dashed median over a shaded middle half). Each expense category
  the same way, the furthest from usual first. The year: so far, the rest of this month as
  projected and a usual month for each month left, against last year. Net worth: the month ends
  behind, and twelve ahead at the last year's average monthly change, widening by half the spread
  of the middle months' changes. The months of usual spending that bank and cash cover, and the
  recurring movements still due this month. `GET /money/views/forecast` (read-only; `ForecastService`
  over the views' dated flows, `core/forecast.ts` all integers; one-offs out, merged categories as
  the one they went into); Claude reads it too (`get_forecast`, `GET /money/claude/forecast`).
  Then, the same day: net worth's pace leaves one-offs out too (a car sold is in today's net worth,
  not in the monthly change: it had counted as a month's saving and steepened the whole line); the
  month is read at its last recorded day (`recordedThrough`), so a statement imported up to the
  12th projects from the 12th and a month with nothing in it yet is a usual month, not one far
  below usual; the pace moved from a line of its own on the Overview to under its Expenses.
  Tests: `core/forecast.spec.ts`; `money-forecast.db-spec.ts` (a known half year: the projection,
  the day by day, the categories, the year, net worth with a sale out of its pace, the safety net,
  a late import, an empty month, a straight line for a first month); `get_forecast` in
  `money-m6.db-spec.ts`; `money-insights.test.ts`; in the browser, the pace under the Overview's
  expenses to Insights, showing what the forecast says.
- **Insights: saving and lumps, Nov 28** — net worth ahead from what is saved, not from how net
  worth moved: on the owner's data last year's +7 567 a month was about 6 600 saved and 950 of
  markets and exchange rates that swung from -4 700 to +5 800, and the 93 000 just invested makes
  that part bigger, not steadier. Ahead is now today, the rest of this month as projected, the
  average month saved (income less expenses, one-offs out) for every month, and what is invested
  growing at a return the owner chooses on the card (a setting, `expectedReturn`, 0% unless set;
  migration `money_expected_return`), the range half the spread of the months saved, adding up.
  Each month's change is told apart: saved, markets and exchange rates (the rest), one-offs, and
  accounts added (what came from the opening balances account: an account's opening balance, a
  holding held before), drawn as signed stacked bars with the net as a dot. Totals over many months
  take the average month instead of the usual (median) one: the owner's median month was 8 272 and
  the average 8 927, the median leaving out travel (3 months of 12), taxes (2) and the spikes of
  health; so the year's months left and the safety net use the average, and a category spent in at
  most half the months comes "now and then": its month is not called unusual and its tick is the
  average (one spent every month with spikes, like transport, keeps its usual month: a first rule,
  the average half again the usual month, called 14 of the owner's categories "now and then"). Tests: `core/forecast.spec.ts` (the average, lumps, a month
  told apart, the outlook with the rest of the month and a return); `money-forecast.db-spec.ts` (a
  second history: a buy whose price moves, cash tracked from March, a sale, a holiday, 6% a year:
  each month apart to the cent, the projection, the year and the safety net on the average month,
  a lumpy category); `money-insights.test.ts`; in the browser, the breakdown's table and the
  return chosen on the card kept in the settings.
- **Insights: learn from, Nov 28** — the owner's months change (a tax begins, a new job), and twelve
  months behind a change keep projecting the old life. **Learn from** on Insights picks the months
  every figure learns from: the last month, 3, 6 or 12 months (rolling; the last twelve by default),
  this year, or a custom range of months (from a month to another, or to now). Settings
  `forecastRange`, `forecastSince`, `forecastUntil` (migrations `money_forecast_since`,
  `money_forecast_range`; a start set before the ranges became a custom range). It moves the usual
  month and its range, the categories, the year's months left, the safety net and what an average
  month saves; never before the first movement. A range the owner chose counts from one month (last
  month alone: this month like last month); the default still needs three, a straight line below.
  No week: every projection works in whole months (rent, salary and taxes come once a month), so a
  week cannot say what a usual month costs. Net worth's months show the year behind, the months not
  learned from faded. The texts name the months ("your 5 months since June 2026"); Claude's
  `get_forecast` says them (`learningFrom`). Tests: `core/forecast.spec.ts` (one chosen month);
  `money-forecast.db-spec.ts` (a tax from April: over the half year it comes now and then; the last
  3 months, since April, make it the usual month, 2500 a month and 3500 saved; last month alone;
  this year; the first quarter before the tax; never before the first movement; a custom range
  without its start or ending before it refused); `money-insights.test.ts` (the words, the options,
  the months); in the browser, a common range, a custom one, kept, named, and back.
  Then, at the owner's word (a picker where a range could not be picked again whole, a custom range
  that rebuilt the row, net worth following the range, and a page to make more inspiring): Learn
  from is one button and a panel (`@radix-ui/react-popover` 1.1.20, the release of the installed
  dialog, so the Radix internals are shared): the common ranges, and the months a year a row, this
  year first, where two clicks pick a custom range with a preview and the panel opens again for
  another; nothing below it moves. Net worth ahead learns from the last twelve months whatever the
  range (`savingMonths`), and what moved it is a card of its own. The page opens with four answers
  (this month's spending, kept this year, net worth in a year, the safety net), each the way to its
  section; how a figure is worked out sits behind its card's note instead of under its title; the
  year says what it is on track to keep, the safety net has a meter with the 3 and 6 months often
  advised, net worth its next round figure and about when.
- **Insights: finish lines, Nov 28** — the owner found the month card broken on a custom range
  from December 2022 (likely from 0.00, the usual line under its band): the months with nothing
  recorded (before tracking began, holdings written down on their old dates) counted as months of
  nothing spent. A month is now learned from only with income or spending recorded in it (31 of 47
  on the owner's data), for the range and for net worth alike. And "inspiring" meant potential, not
  bigger figures: finish lines (`money_goal`, migration `money_goals`, a CHECK above zero;
  `GET/POST/DELETE /money/goals`), net worths to reach in their own currency, come with the
  forecast in the base currency. Insights opens with where net worth is heading: in a sentence how
  much it grew (`grown`) and the next line the pace crosses; 1, 5 or 10 years ahead (the projection
  is 120 month ends now, investments compounded each year), the lines across the chart; each line's
  progress, when the pace gets there and how much sooner spending a tenth less would (`lever`, a
  tenth of the average month, whole units); with none set, the next round figure is offered. The
  range is half the spread of the months saved times √(k + k²/n) instead of k: each month varies,
  and the average itself is a little unsure, which is what matters years ahead (12 months ahead
  ±1 597 instead of ±3 000 in the spec's history). Learn from moved beside "This month and the
  year", the sections it changes; the four tiles went. Tests: `core/forecast.spec.ts` (the
  square root, the range, compounding); `money-forecast.db-spec.ts` (ten years ahead, grown, the
  lever, a gap and a holding-only month skipped); `money-goals.db-spec.ts` (set, smallest first,
  refused at zero, removed by its owner only, in the forecast); `money-insights.test.ts` (when a
  line is reached, how much sooner, the horizon); in the browser, a finish line set and removed.
