# Money — Requirements

Oct 28, 2026 · Liubomyr

## Purpose and scope

One user tracks every account, every money movement and every investment in one
place, and Claude can read all of it. Version 1 must answer three questions:

1. **What do I own right now?** Net worth, by account and by currency.
2. **Where did the money go this month?** Income, expenses, amount invested, savings rate.
3. **How is it allocated against my target?** Emergency fund, core index fund, satellite.

Everything else is later.

## Functional requirements

Version 1 is accounts, money movements, history import and three views.

| Area | As a user I can… | Release |
|---|---|---|
| Accounts | Create institutions (bank, broker, bond registry, lender, cash) and accounts under them. Each account holds one sub-account per currency, e.g. mBank → PLN, USD; ZEN → PLN, EUR, USD. | v1 |
| Movements | Transfer money between any two sub-accounts. Same currency: one amount. Different currencies: amount out, amount in, the implied exchange rate and the fee. | v1 |
| Accounts | Mark an account as bank, investment, bonds or debt. Debt (e.g. Borrowed USD) counts as negative in net worth. | v1 |
| Accounts | Archive an account without losing its history. | v1 |
| Movements | Record income and expenses with a date, a category and a note. | v1 |
| Movements | Money sent to an investment account is a transfer at cost, never an expense. | v1 |
| Movements | Set recurring movements (rent, the monthly index-fund buy). | v1 |
| Investments | Record a buy or sell: asset, units, all-in cost, date. A buy opens a lot. | v1 |
| Investments | See positions per account at cost: units and total cost. | v1 |
| Investments | Get the cost basis in PLN per lot (central bank rate from the business day before) for the yearly tax return. | v1 |
| Investments | See market value from a price feed; take a quarterly snapshot. | v1 |
| Views | See net worth in a base currency I can switch at any time (all major currencies supported, not only mine), by account, currency and asset class. | v1 |
| Views | See allocation against my target, with the drift for each part. | v1 |
| Views | See each month's income, expenses, amount invested and savings rate. | v1 |
| Data | Import the full history from my current money-manager export. | v1 |
| Data | Give Claude read-only access to accounts, movements and positions. | v1 |
| Data | Import statements from each bank, with duplicates detected. | v1 |

## Non-functional requirements

Correctness, durability and security matter; scale and availability barely do.

| Requirement | Target | Why |
|---|---|---|
| Correctness of money | Amounts stored as integers in the smallest unit (grosz, cent) or exact decimals, never floating point. Balances reconcile to the bank to the cent. | 0.1 + 0.2 ≠ 0.3 in floating point; a tracker that drifts is useless. |
| Consistency | Strong consistency: one Postgres, both legs of a transfer commit together or not at all. | A half-written transfer creates or destroys money. |
| Durability | No data loss. Daily backup off the server. Movements are append-only: a mistake is fixed by a correcting entry, never by rewriting history. | The full history is the point of the app. |
| Security | One user, passkey or password + second factor, HTTPS only, database encrypted at rest. Never stores bank passwords. Claude gets its own read-only token you can revoke. | It is a complete map of your money. |
| Fault tolerance | Restore from backup in under an hour, tested once. | Backups nobody restored are a guess. |
| Availability | About 99% is enough (~15 minutes down a day). No redundancy. | Personal tool, nobody else depends on it. |
| Latency | Any view under 1 second with 20 years of data. | Comfort only. |
| Scalability | One user, a few thousand movements a year, about 100,000 rows in 20 years. No scaling work. | Postgres handles this without tuning. |
| Environment | TypeScript and Postgres on one small Hetzner server (or local). | Cost and zero new learning. |
| Compliance | Own data only, so GDPR is a non-issue. | Only matters if you file the yearly return from it. |

## Core entities

Every transfer, income, expense and trade becomes entries on currency
sub-accounts, so a balance, net worth and allocation are all sums of entries. A
transfer is one transaction with two legs that cancel out.

## Investments model

Flexible model, simple screens: no asset, country, tax rule or "never sell"
policy is hardcoded — each is data or a setting with the current choice as the
default.

| What | Stored as | Default today |
|---|---|---|
| Asset | Any instrument: name, ticker, unit, currency, class, how it is valued | VWCE (units, EUR, manual price) · EDO (bonds of 100 PLN, manual value) |
| Asset class + target | Own list of classes, each with a target %; one asset can be split across classes | Core equity · satellite · emergency fund, targets from the investment policy |
| Account | Any account can hold assets; taxable or tax-advantaged is a property of the account | IBKR taxable · XTB IKE tax-advantaged |
| Investment movements | Buy, sell, income (dividend, interest), fee, move units between accounts, split | Buy only, until the first sale |
| Cost basis method | A setting per account: first in first out, or average cost — changes with tax residence | First in, first out (the Polish rule) |
| Prices | One price table (asset, date, price); manual entry, file import and a price feed all write to it | Manual, at the quarterly checkpoint |

What you see: one Buy form (date, account, asset, units, total paid with fee,
paid from; optional: the amount the broker charged in the trade currency) and one
card per asset per account (units, cost, average cost, value, gain). Fields you
don't use stay hidden.

## Out of scope for v1, and open questions

Not in v1: live bank sync, more than one user, a mobile app, budgets.

- [ ] Base currency for net worth: PLN, USD or EUR? (Built as a switchable setting; default PLN.)
- [ ] Sub-accounts: currencies only, or also purpose pockets inside one currency?
- [ ] Target allocation to compare against: today's numbers from the investment policy, or new ones?
- [ ] Claude's access: a read-only API, an MCP server, or a nightly JSON export? (Plan: API + MCP server in M6.)
- [ ] History import: does the current money-manager export include transfers between accounts, or only income and expenses?

Scope decided 10-28: everything in this doc gets built, in the order of
[`plan.md`](plan.md).
