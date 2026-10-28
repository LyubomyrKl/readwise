import { Injectable } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import type { AmountJson } from '../common/amounts';
import { toDate } from '../common/parse';
import { CategoriesService } from '../categories/categories.service';
import { monthKey } from '../core/dates';
import { DraftsService } from '../drafts/drafts.service';
import { PositionsService } from '../investments/positions.service';
import { TransactionsService } from '../transactions/transactions.service';
import type { TransactionResponse } from '../transactions/transaction.models';
import { ViewsService } from '../views/views.service';
import type { ClaudeTransactionsQuery, ProposeMovementDto } from './claude.models';
import type { VerifiedToken } from './tokens.service';

/** "1234.50 PLN": one string per amount, exact, easy to quote. */
const money = (a: AmountJson | null | undefined): string | null => (a ? `${a.value} ${a.currency}` : null);

/**
 * What Claude reads, through the REST API and the MCP server alike: the views
 * of the money tool in a compact shape. Read-only, except proposing a draft,
 * which posts nothing until the user approves it in the app.
 */
@Injectable()
export class ClaudeService {
  constructor(
    private readonly views: ViewsService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
    private readonly transactions: TransactionsService,
    private readonly positions: PositionsService,
    private readonly drafts: DraftsService,
  ) {}

  /** The three answers at once: net worth, this month, allocation; and the drafts waiting. */
  async summary(userId: string, base?: string) {
    const home = await this.views.home(userId, base);
    const m = home.month;
    return {
      base: home.base,
      today: home.netWorth.asOf,
      netWorth: {
        total: money(home.netWorth.total),
        owned: money(home.netWorth.assets),
        owed: money(home.netWorth.liabilities),
        byType: home.netWorth.types.map((t) => ({ type: t.name, value: money(t.value) })),
      },
      thisMonth: {
        month: m.month,
        income: money(m.income),
        expenses: money(m.expenses),
        invested: money(m.invested),
        saved: money(m.savings),
        savingsRatePercent: m.savingsRate,
        topExpenses: m.expensesByCategory.slice(0, 5).map((c) => ({ category: c.name, amount: money(c.value), percent: c.percent })),
      },
      allocation: this.allocationRows(home.allocation.rows),
      draftsWaitingForApproval: home.drafts,
      missingRates: [...new Set([...home.netWorth.missingRates, ...m.missingRates, ...home.allocation.missingRates])],
    };
  }

  async netWorth(userId: string, q: { base?: string; asOf?: string }) {
    const nw = await this.views.netWorth(userId, { base: q.base, asOf: q.asOf ? toDate(q.asOf, 'asOf') : undefined });
    return {
      base: nw.base,
      asOf: nw.asOf,
      total: money(nw.total),
      owned: money(nw.assets),
      owed: money(nw.liabilities),
      byAccount: nw.accounts.map((a) => ({
        account: a.institution && a.institution !== a.name ? `${a.institution} · ${a.name}` : a.name,
        type: a.type,
        value: money(a.value),
        holdings: a.items.map((i) => ({ code: i.code, held: i.kind === 'asset' ? `${i.units} units` : money(i.native), value: money(i.value), valuedBy: i.valuedBy })),
      })),
      byCurrency: nw.currencies.map((c) => ({ currency: c.name, held: money(c.native), value: money(c.value) })),
      byClass: nw.classes.map((c) => ({ class: c.name, value: money(c.value) })),
      missingRates: nw.missingRates,
    };
  }

  /** One month (default: this one) with its categories. */
  async month(userId: string, month: string | undefined, base?: string) {
    const m = await this.views.month(userId, month ?? monthKey(this.views.today()), base);
    return {
      month: m.month,
      base: m.base,
      income: money(m.income),
      expenses: money(m.expenses),
      invested: money(m.invested),
      saved: money(m.savings),
      savingsRatePercent: m.savingsRate,
      expensesByCategory: m.expensesByCategory.map((c) => ({ category: c.name, amount: money(c.value), percent: c.percent })),
      incomeByCategory: m.incomeByCategory.map((c) => ({ category: c.name, amount: money(c.value), percent: c.percent })),
      missingRates: m.missingRates,
    };
  }

  async monthly(userId: string, q: { base?: string; from?: string; to?: string }) {
    const r = await this.views.monthly(userId, q);
    return {
      base: r.base,
      months: r.months.map((m) => ({
        month: m.month,
        income: money(m.income),
        expenses: money(m.expenses),
        invested: money(m.invested),
        saved: money(m.savings),
        savingsRatePercent: m.savingsRate,
      })),
      missingRates: r.missingRates,
    };
  }

  async allocation(userId: string, base?: string) {
    const a = await this.views.allocation(userId, { base });
    return { base: a.base, asOf: a.asOf, total: money(a.total), targetsAddUpTo: a.targetsTotal, classes: this.allocationRows(a.rows), missingRates: a.missingRates };
  }

  async accountList(userId: string) {
    const list = await this.accounts.list(userId);
    return list.map((a) => ({
      id: a.id,
      name: a.institution && a.institution.name !== a.name ? `${a.institution.name} · ${a.name}` : a.name,
      type: a.type,
      taxWrapper: a.taxWrapper,
      balances: a.balances.map((b) => (b.kind === 'asset' ? `${b.units} ${b.code}` : money(b.balance))),
    }));
  }

  async categoryList(userId: string) {
    const list = await this.categories.list(userId);
    const name = new Map(list.map((c) => [c.id, c.name]));
    return list.map((c) => ({ id: c.id, name: c.name, kind: c.kind, parent: c.parentId ? (name.get(c.parentId) ?? null) : null }));
  }

  async transactionList(userId: string, q: ClaudeTransactionsQuery) {
    const page = await this.transactions.list(userId, { ...q, limit: q.limit ?? '50' });
    return { items: page.items.map(compactTransaction), nextCursor: page.nextCursor };
  }

  async positionList(userId: string) {
    const list = await this.positions.positions(userId);
    return list.map((p) => ({
      account: p.accountName,
      asset: `${p.code} (${p.name})`,
      units: p.units,
      cost: p.cost.map((c) => money(c)).join(' + '),
      value: money(p.value),
      gain: money(p.gain),
      gainPercent: p.gainPercent,
      valuedBy: p.valuedBy,
      price: p.price ? `${p.price.price} ${p.price.currency} on ${p.price.date}` : null,
    }));
  }

  async draftList(userId: string) {
    const page = await this.drafts.list(userId);
    return page.items.map((d) => ({ id: d.id, date: d.date, kind: d.kind, note: d.note, proposedBy: d.proposedBy, proposal: d.draft }));
  }

  /** A movement proposed by Claude: a draft, posted only when the user approves it. */
  async propose(token: VerifiedToken, dto: ProposeMovementDto) {
    const draft = await this.drafts.create(
      token.userId,
      { kind: dto.kind, input: dto.input },
      { actor: `token:${token.id}`, date: typeof dto.input.date === 'string' ? toDate(dto.input.date) : undefined },
    );
    return {
      draftId: draft.id,
      status: 'draft',
      date: draft.date,
      message: 'Proposed. Nothing is posted until the user approves it in the money app (Drafts).',
    };
  }

  private allocationRows(rows: { name: string; value: AmountJson; percent: string | null; targetPercent: string | null; drift: string | null; driftAmount: AmountJson | null }[]) {
    return rows.map((r) => ({
      class: r.name,
      value: money(r.value),
      percent: r.percent,
      targetPercent: r.targetPercent,
      driftPoints: r.drift,
      toTarget: r.driftAmount ? money({ ...r.driftAmount, value: r.driftAmount.value.startsWith('-') ? r.driftAmount.value.slice(1) : `-${r.driftAmount.value}` }) : null,
    }));
  }
}

/** A transaction as the account statements show it: own accounts only, with the category of income and expenses. */
export function compactTransaction(tx: TransactionResponse) {
  const own = tx.entries.filter((e) => e.accountType !== 'system');
  return {
    id: tx.id,
    date: tx.date,
    kind: tx.kind,
    note: tx.note,
    category: tx.category?.name ?? null,
    asset: tx.asset?.name ?? null,
    legs: own.map((e) => ({ account: e.accountName, amount: e.amount ? money(e.amount) : `${e.units} ${e.code}` })),
    ...(tx.reversedBy ? { reversedBy: tx.reversedBy } : {}),
    ...(tx.impliedRate ? { impliedRate: tx.impliedRate } : {}),
  };
}

