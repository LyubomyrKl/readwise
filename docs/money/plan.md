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
