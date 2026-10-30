import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type MoneyAccount, type MoneyInstitution } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { BalancesService } from '../accounts/balances.service';
import { amountJson, unitsJson } from '../common/amounts';
import { toDate } from '../common/parse';
import { bondValue, parseBondConfig, unitsValue } from '../core/bonds';
import { addMonths, endOfMonth, formatDate, monthKey, monthsBetween, startOfMonth, todayIn } from '../core/dates';
import { divRound, formatScaled, pow10, toFraction } from '../core/decimal';
import { parseQuantity, quantityFromDb } from '../core/quantity';
import type { RateBook } from '../core/rates';
import { allocationRows, monthTotals, percentOf, splitByShares, type FlowEntry, type MonthTotals } from '../core/views';
import { PositionsService } from '../investments/positions.service';
import { ValuationService } from '../investments/valuation.service';
import { LedgerService } from '../ledger/ledger.service';
import { RatesService } from '../rates/rates.service';
import { CommoditiesService } from '../reference/commodities.service';
import {
  AllocationResponse,
  CategoryValue,
  HistoryPoint,
  HistoryResponse,
  HomeResponse,
  MonthDetail,
  PeriodDetail,
  MonthFlow,
  MonthlyResponse,
  NamedValue,
  NetWorthAccount,
  NetWorthItem,
  NetWorthResponse,
} from './view.models';

type AccountRow = MoneyAccount & { institution: MoneyInstitution | null };

/** One thing an account holds at a day, valued in its own currency. */
interface Item {
  account: AccountRow;
  kind: 'cash' | 'asset';
  code: string;
  /** the currency `native` is in */
  currency: string;
  native: bigint;
  units: bigint | null;
  valuedBy: 'balance' | 'price' | 'bond_formula' | 'cost' | 'none';
  shares: { classId: string; percent: string }[];
}

interface Converted extends Item {
  base: bigint | null;
}

const TYPE_NAMES: Record<string, string> = { bank: 'Bank and cash', investment: 'Investments', bonds: 'Bonds', debt: 'Debt' };

/**
 * The three answers: what you own (net worth by account, currency, type and
 * class), where the money went (income, expenses, invested, savings rate per
 * month) and how it is allocated against the targets. Totals in any base
 * currency; stored amounts never change (rule 5).
 */
@Injectable()
export class ViewsService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly balances: BalancesService,
    private readonly positions: PositionsService,
    private readonly valuation: ValuationService,
    private readonly rates: RatesService,
    private readonly commodities: CommoditiesService,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.timeZone = config.get('MONEY_TIMEZONE', { infer: true }) || 'Europe/Warsaw';
  }

  today(): Date {
    return todayIn(this.timeZone);
  }

  async baseOf(userId: string, requested?: string): Promise<string> {
    if (requested) return (await this.commodities.currency(requested)).id;
    await this.ledger.ensureSetup(userId);
    const settings = await this.prisma.moneySettings.findUniqueOrThrow({ where: { userId } });
    return settings.baseCurrencyId;
  }

  // ---- what you own ---------------------------------------------------------------------------

  private async collect(userId: string, at: Date): Promise<Item[]> {
    const accounts = await this.prisma.moneyAccount.findMany({
      where: { userId, type: { not: 'system' } },
      include: { institution: true },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const totals = await this.balances.subAccountTotals(userId, { asOf: at });
    const items: Item[] = [];
    for (const t of totals) {
      const account = byId.get(t.accountId);
      if (!account || t.minor === 0n || !(await this.commodities.isCurrency(t.commodityId))) continue;
      items.push({
        account,
        kind: 'cash',
        code: t.commodityId,
        currency: t.commodityId,
        native: t.minor,
        units: null,
        valuedBy: 'balance',
        shares: account.cashClassId ? [{ classId: account.cashClassId, percent: '100' }] : [],
      });
    }
    const holdings = await this.positions.holdings(userId, at);
    const splits = await this.prisma.moneyAssetClassSplit.findMany({
      where: { assetId: { in: [...new Set(holdings.map((h) => h.asset.commodityId))] } },
    });
    for (const h of holdings) {
      const account = byId.get(h.accountId)!;
      const shares = splits.filter((s) => s.assetId === h.asset.commodityId).map((s) => ({ classId: s.classId, percent: s.percent.toFixed() }));
      const v = await this.valuation.value(h.asset, h.units, h.lots, at);
      if (v.value !== null) {
        items.push({ account, kind: 'asset', code: h.asset.commodity.code, currency: v.currency, native: v.value, units: h.units, valuedBy: v.valuedBy === 'none' ? 'none' : v.valuedBy, shares });
      } else {
        // no price yet: at cost, in each currency it was paid in, with the units bought for it
        for (const [currency, cost] of h.cost) {
          const units = h.cost.size === 1 ? h.units : (h.costUnits.get(currency) ?? 0n);
          items.push({ account, kind: 'asset', code: h.asset.commodity.code, currency, native: cost, units, valuedBy: 'cost', shares });
        }
      }
    }
    return items;
  }

  private async convertAll(items: Item[], base: string, book: RateBook, at: Date): Promise<{ converted: Converted[]; missing: string[]; rateDate: string | null }> {
    const baseDecimals = await this.commodities.decimalsOf(base);
    const day = formatDate(at);
    const missing = new Set<string>();
    let rateDate: string | null = null;
    const converted: Converted[] = [];
    for (const item of items) {
      const decimals = await this.commodities.decimalsOf(item.currency);
      const value = book.convert(item.native, item.currency, decimals, base, baseDecimals, day);
      if (value === null) missing.add(item.currency);
      else if (item.currency !== base) {
        const used = book.rate(item.currency, base, day)?.date ?? null;
        if (used && (!rateDate || used < rateDate)) rateDate = used;
      }
      converted.push({ ...item, base: value });
    }
    return { converted, missing: [...missing].sort(), rateDate };
  }

  async netWorth(userId: string, q: { base?: string; asOf?: Date } = {}): Promise<NetWorthResponse> {
    const base = await this.baseOf(userId, q.base);
    const at = q.asOf ?? this.today();
    const items = await this.collect(userId, at);
    const book = await this.rates.latestBook([...items.map((i) => i.currency), base], at);
    const { converted, missing, rateDate } = await this.convertAll(items, base, book, at);
    const dec = await this.commodities.decimalsOf(base);
    const money = (minor: bigint) => amountJson(minor, base, dec);

    const accounts = new Map<string, { row: AccountRow; value: bigint; items: Converted[] }>();
    for (const c of converted) {
      const entry = accounts.get(c.account.id) ?? { row: c.account, value: 0n, items: [] };
      entry.value += c.base ?? 0n;
      entry.items.push(c);
      accounts.set(c.account.id, entry);
    }

    const currencies = new Map<string, { native: bigint; base: bigint }>();
    const types = new Map<string, bigint>();
    const classes = new Map<string | null, bigint>();
    let total = 0n;
    let liabilities = 0n;
    for (const c of converted) {
      if (c.base === null) continue;
      total += c.base;
      if (c.account.type === 'debt') liabilities += c.base;
      const cur = currencies.get(c.currency) ?? { native: 0n, base: 0n };
      cur.native += c.native;
      cur.base += c.base;
      currencies.set(c.currency, cur);
      types.set(c.account.type, (types.get(c.account.type) ?? 0n) + c.base);
      if (c.account.type !== 'debt') {
        for (const [classId, part] of splitByShares(c.base, c.shares)) classes.set(classId, (classes.get(classId) ?? 0n) + part);
      }
    }
    const classNames = new Map(
      (await this.prisma.moneyAssetClass.findMany({ where: { userId } })).map((k) => [k.id, k.name] as const),
    );

    const accountList: NetWorthAccount[] = [];
    for (const { row, value, items: list } of accounts.values()) {
      const out: NetWorthItem[] = [];
      for (const c of list) {
        out.push({
          code: c.code,
          kind: c.kind,
          native: amountJson(c.native, c.currency, await this.commodities.decimalsOf(c.currency)),
          units: c.units === null ? null : unitsJson(c.units),
          value: c.base === null ? null : money(c.base),
          valuedBy: c.valuedBy,
        });
      }
      accountList.push({ accountId: row.id, name: row.name, institution: row.institution?.name ?? null, type: row.type, value: money(value), items: out });
    }
    accountList.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

    const currencyList: NamedValue[] = [];
    for (const [currency, v] of [...currencies.entries()].sort((a, b) => (b[1].base > a[1].base ? 1 : b[1].base < a[1].base ? -1 : 0))) {
      currencyList.push({ key: currency, name: currency, value: money(v.base), native: amountJson(v.native, currency, await this.commodities.decimalsOf(currency)) });
    }

    return {
      base,
      asOf: formatDate(at),
      total: money(total),
      assets: money(total - liabilities),
      liabilities: money(liabilities),
      accounts: accountList,
      currencies: currencyList,
      types: [...types.entries()].map(([type, v]) => ({ key: type, name: TYPE_NAMES[type] ?? type, value: money(v), native: null })),
      classes: [...classes.entries()]
        .map(([classId, v]) => ({ key: classId, name: classId ? (classNames.get(classId) ?? 'Class') : 'Not in a class', value: money(v), native: null }))
        .sort((a, b) => (a.key === null ? 1 : b.key === null ? -1 : a.name.localeCompare(b.name))),
      missingRates: missing,
      rateDate,
    };
  }

  // ---- allocation --------------------------------------------------------------------------------

  async allocation(userId: string, q: { base?: string; asOf?: Date } = {}): Promise<AllocationResponse> {
    const base = await this.baseOf(userId, q.base);
    const at = q.asOf ?? this.today();
    const items = (await this.collect(userId, at)).filter((i) => i.account.type !== 'debt');
    const book = await this.rates.latestBook([...items.map((i) => i.currency), base], at);
    const { converted, missing } = await this.convertAll(items, base, book, at);
    const values = new Map<string | null, bigint>();
    for (const c of converted) {
      if (c.base === null) continue;
      for (const [classId, part] of splitByShares(c.base, c.shares)) values.set(classId, (values.get(classId) ?? 0n) + part);
    }
    const classes = await this.prisma.moneyAssetClass.findMany({
      where: { userId },
      include: { targets: { where: { validFrom: { lte: at } }, orderBy: { validFrom: 'desc' }, take: 1 } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const targets = new Map<string, string>();
    for (const k of classes) if (k.targets[0]) targets.set(k.id, k.targets[0].percent.toFixed());
    const { total, rows } = allocationRows(values, classes.map((k) => k.id), targets);
    const dec = await this.commodities.decimalsOf(base);
    const targetsTotal = [...targets.values()].reduce((sum, p) => {
      const [n, d] = toFraction(p);
      return sum + (n * 10_000n) / d;
    }, 0n);
    return {
      base,
      asOf: formatDate(at),
      total: amountJson(total, base, dec),
      rows: rows.map((r) => ({
        classId: r.classId,
        name: r.classId ? (classes.find((k) => k.id === r.classId)?.name ?? 'Class') : 'Not in a class',
        value: amountJson(r.value, base, dec),
        percent: r.percent,
        targetPercent: r.targetPercent,
        drift: r.drift,
        driftAmount: r.driftAmount === null ? null : amountJson(r.driftAmount, base, dec),
      })),
      targetsTotal: targets.size === 0 ? null : formatScaled(targetsTotal, 4).replace(/\.?0+$/, ''),
      missingRates: missing,
    };
  }

  // ---- where the money went ------------------------------------------------------------------------

  private async flows(userId: string, base: string, from: Date, to: Date): Promise<{ byMonth: Map<string, FlowEntry[]>; missing: string[] }> {
    const rows = await this.prisma.$queryRaw<
      {
        transactionId: string;
        kind: string;
        date: string;
        accountType: string;
        systemRole: string | null;
        commodityId: string;
        commodityKind: string;
        minor: string | null;
        categoryId: string | null;
      }[]
    >(Prisma.sql`
      SELECT e."transactionId", t.kind::text AS kind, to_char(t.date, 'YYYY-MM-DD') AS date, a.type::text AS "accountType",
             a."systemRole"::text AS "systemRole", s."commodityId", c.kind::text AS "commodityKind",
             e."amountMinor"::text AS minor, e."categoryId"
        FROM "money_entry" e
        JOIN "money_transaction" t ON t."id" = e."transactionId"
        JOIN "money_sub_account" s ON s."id" = e."subAccountId"
        JOIN "money_account" a ON a."id" = s."accountId"
        JOIN "money_commodity" c ON c."id" = s."commodityId"
       WHERE t."userId" = ${userId} AND t."status" = 'posted' AND t."kind" <> 'opening_balance'
         AND t."date" >= ${formatDate(from)}::date AND t."date" <= ${formatDate(to)}::date
    `);
    const currencies = new Set(rows.filter((r) => r.commodityKind === 'currency').map((r) => r.commodityId));
    const book = await this.rates.rangeBook([...currencies, base], from, to);
    const baseDecimals = await this.commodities.decimalsOf(base);
    const missing = new Set<string>();
    const byMonth = new Map<string, FlowEntry[]>();
    for (const r of rows) {
      let value: bigint | null = null;
      if (r.commodityKind === 'currency' && r.minor !== null) {
        value = book.convert(BigInt(r.minor), r.commodityId, await this.commodities.decimalsOf(r.commodityId), base, baseDecimals, r.date);
        if (value === null) {
          missing.add(r.commodityId);
          continue;
        }
      }
      const month = r.date.slice(0, 7);
      const list = byMonth.get(month) ?? [];
      list.push({
        transactionId: r.transactionId,
        kind: r.kind,
        accountType: r.accountType as FlowEntry['accountType'],
        systemRole: r.systemRole as FlowEntry['systemRole'],
        base: value,
        categoryId: r.categoryId,
      });
      byMonth.set(month, list);
    }
    return { byMonth, missing: [...missing].sort() };
  }

  /** `from: 'start'` begins at the month of the first posted transaction. */
  private async range(userId: string, q: { from?: string; to?: string }): Promise<{ months: Date[]; from: Date; to: Date }> {
    const today = this.today();
    const toMonth = q.to ? toDate(`${q.to}-01`, 'to') : startOfMonth(today);
    let fromMonth = q.from && q.from !== 'start' ? toDate(`${q.from}-01`, 'from') : addMonths(toMonth, -11, 1);
    if (q.from === 'start') {
      const first = await this.prisma.moneyTransaction.findFirst({ where: { userId, status: 'posted' }, orderBy: { date: 'asc' }, select: { date: true } });
      fromMonth = first && first.date < toMonth ? startOfMonth(first.date) : toMonth;
    }
    const months = monthsBetween(fromMonth, toMonth);
    const last = endOfMonth(toMonth);
    return { months, from: fromMonth, to: last > today && toMonth <= today ? today : last };
  }

  private flowJson(month: string, t: MonthTotals, base: string, dec: number): MonthFlow {
    return {
      month,
      income: amountJson(t.income, base, dec),
      expenses: amountJson(t.expenses, base, dec),
      invested: amountJson(t.invested, base, dec),
      savings: amountJson(t.savings, base, dec),
      savingsRate: t.savingsRate,
    };
  }

  async monthly(userId: string, q: { base?: string; from?: string; to?: string } = {}): Promise<MonthlyResponse> {
    const base = await this.baseOf(userId, q.base);
    const { months, from, to } = await this.range(userId, q);
    const { byMonth, missing } = await this.flows(userId, base, from, endOfMonth(months[months.length - 1] ?? to));
    const dec = await this.commodities.decimalsOf(base);
    return {
      base,
      months: months.map((m) => this.flowJson(monthKey(m), monthTotals(byMonth.get(monthKey(m)) ?? []), base, dec)),
      missingRates: missing,
    };
  }

  async month(userId: string, month: string, requestedBase?: string): Promise<MonthDetail> {
    const base = await this.baseOf(userId, requestedBase);
    const start = toDate(`${month}-01`, 'month');
    const { byMonth, missing } = await this.flows(userId, base, start, endOfMonth(start));
    const t = monthTotals(byMonth.get(month) ?? []);
    const dec = await this.commodities.decimalsOf(base);
    return { ...this.flowJson(month, t, base, dec), base, ...(await this.byCategory(userId, t, base, dec)), missingRates: missing };
  }

  /** Income, expenses and their categories summed over a whole range of months (same range rules as `monthly`). */
  async period(userId: string, q: { base?: string; from?: string; to?: string } = {}): Promise<PeriodDetail> {
    const base = await this.baseOf(userId, q.base);
    const { months, from, to } = await this.range(userId, q);
    const { byMonth, missing } = await this.flows(userId, base, from, endOfMonth(months[months.length - 1] ?? to));
    const t = monthTotals([...byMonth.values()].flat());
    const dec = await this.commodities.decimalsOf(base);
    const { month: _month, ...flow } = this.flowJson('', t, base, dec);
    return {
      from: monthKey(months[0] ?? from),
      to: monthKey(months[months.length - 1] ?? to),
      ...flow,
      base,
      ...(await this.byCategory(userId, t, base, dec)),
      missingRates: missing,
    };
  }

  private async byCategory(userId: string, t: MonthTotals, base: string, dec: number): Promise<{ expensesByCategory: CategoryValue[]; incomeByCategory: CategoryValue[] }> {
    const categories = await this.prisma.moneyCategory.findMany({ where: { userId } });
    const name = (id: string | null, fallback: string) => {
      const c = categories.find((k) => k.id === id);
      if (!c) return fallback;
      const parent = c.parentId ? categories.find((k) => k.id === c.parentId) : undefined;
      return parent ? `${parent.name} / ${c.name}` : c.name;
    };
    const list = (map: Map<string | null, bigint>, whole: bigint, fallback: string): CategoryValue[] =>
      [...map.entries()]
        .filter(([, v]) => v !== 0n)
        .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
        .map(([categoryId, v]) => ({ categoryId, name: name(categoryId, fallback), value: amountJson(v, base, dec), percent: percentOf(v, whole) }));
    return {
      expensesByCategory: list(t.expensesByCategory, t.expenses, 'Uncategorised'),
      incomeByCategory: list(t.incomeByCategory, t.income, 'Uncategorised'),
    };
  }

  // ---- net worth over time ------------------------------------------------------------------------

  async history(userId: string, q: { base?: string; from?: string; to?: string } = {}): Promise<HistoryResponse> {
    const base = await this.baseOf(userId, q.base);
    const today = this.today();
    const { months } = await this.range(userId, q);
    // month ends; the current month ends today
    const points = months.map((m) => {
      const end = endOfMonth(m);
      return m <= today && end > today ? today : end;
    });
    if (points.length === 0) return { base, points: [], missingRates: [] };
    const last = points[points.length - 1];

    // balances: monthly changes per sub-account, accumulated
    const deltas = await this.prisma.$queryRaw<{ m: string; accountId: string; commodityId: string; minor: string; qty: string }[]>(Prisma.sql`
      SELECT to_char(date_trunc('month', t."date"), 'YYYY-MM') AS m, s."accountId", s."commodityId",
             COALESCE(SUM(e."amountMinor"), 0)::text AS minor, COALESCE(SUM(e."quantity"), 0)::text AS qty
        FROM "money_entry" e
        JOIN "money_transaction" t ON t."id" = e."transactionId"
        JOIN "money_sub_account" s ON s."id" = e."subAccountId"
        JOIN "money_account" a ON a."id" = s."accountId"
       WHERE t."userId" = ${userId} AND t."status" = 'posted' AND a."type" <> 'system' AND t."date" <= ${formatDate(last)}::date
       GROUP BY 1, 2, 3
    `);
    const accounts = await this.prisma.moneyAccount.findMany({ where: { userId, type: { not: 'system' } } });
    const typeOf = new Map(accounts.map((a) => [a.id, a.type]));
    const assets = await this.prisma.moneyAsset.findMany({ where: { commodity: { userId } }, include: { commodity: true } });
    const assetById = new Map(assets.map((a) => [a.commodityId, a]));
    const priceRows = await this.prisma.moneyPrice.findMany({
      where: { assetId: { in: assets.map((a) => a.commodityId) }, date: { lte: last } },
      orderBy: [{ date: 'asc' }, { source: 'desc' }],
    });
    const prices = new Map<string, typeof priceRows>();
    for (const p of priceRows) prices.set(p.assetId, [...(prices.get(p.assetId) ?? []), p]);
    /** the last price on or before a day (binary search over the asset's prices) */
    const priceAt = (assetId: string, day: Date) => {
      const list = prices.get(assetId) ?? [];
      let lo = 0;
      let hi = list.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].date <= day) {
          found = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return found < 0 ? undefined : list[found];
    };
    const lots = await this.prisma.moneyLot.findMany({
      where: { account: { userId }, reversedAt: null },
      include: {
        transaction: { select: { date: true } },
        consumptions: { where: { reversedAt: null }, include: { transaction: { select: { date: true } } } },
      },
    });

    const currencies = new Set<string>([base]);
    for (const d of deltas) if (await this.commodities.isCurrency(d.commodityId)) currencies.add(d.commodityId);
    for (const a of assets) currencies.add(a.quoteCurrencyId);
    for (const l of lots) currencies.add(l.costCurrencyId);
    const book = await this.rates.monthlyBook(currencies, last);
    const baseDecimals = await this.commodities.decimalsOf(base);
    const missing = new Set<string>();

    const out: HistoryPoint[] = [];
    for (const point of points) {
      const pointMonth = monthKey(point);
      const day = formatDate(point);
      const cash = new Map<string, bigint>(); // accountId|currency -> minor
      const units = new Map<string, bigint>(); // accountId|assetId -> units
      for (const d of deltas) {
        if (d.m > pointMonth) continue;
        const key = `${d.accountId}|${d.commodityId}`;
        if (assetById.has(d.commodityId)) units.set(key, (units.get(key) ?? 0n) + parseQuantity(d.qty));
        else cash.set(key, (cash.get(key) ?? 0n) + BigInt(d.minor));
      }
      let total = 0n;
      let liabilities = 0n;
      const add = async (accountId: string, currency: string, minor: bigint) => {
        const v = book.convert(minor, currency, await this.commodities.decimalsOf(currency), base, baseDecimals, day);
        if (v === null) {
          missing.add(currency);
          return;
        }
        total += v;
        if (typeOf.get(accountId) === 'debt') liabilities += v;
      };
      for (const [key, minor] of cash) {
        if (minor === 0n) continue;
        const [accountId, currency] = key.split('|');
        await add(accountId, currency, minor);
      }
      for (const [key, held] of units) {
        if (held === 0n) continue;
        const [accountId, assetId] = key.split('|');
        const asset = assetById.get(assetId)!;
        const lotsHere = lots
          .filter((l) => l.accountId === accountId && l.assetId === assetId && l.transaction.date <= point)
          .map((l) => {
            let left = quantityFromDb(l.units);
            let cost = l.costMinor;
            for (const c of l.consumptions) {
              if (c.transaction.date <= point) {
                left -= quantityFromDb(c.units);
                cost -= c.costAllocatedMinor;
              }
            }
            return { lot: l, left, cost };
          })
          .filter((x) => x.left > 0n);
        if (asset.valuation === 'bond_formula' && asset.valuationConfig) {
          try {
            const config = parseBondConfig(asset.valuationConfig);
            const dec = await this.commodities.decimalsOf(asset.quoteCurrencyId);
            let value = 0n;
            for (const x of lotsHere) value += unitsValue(bondValue(config, x.lot.acquiredAt, point, dec).minor, x.left);
            await add(accountId, asset.quoteCurrencyId, value);
            continue;
          } catch {
            // fall through to prices
          }
        }
        const price = priceAt(assetId, point);
        if (price) {
          const [num, den] = toFraction(price.price.toFixed());
          const dec = await this.commodities.decimalsOf(price.quoteCurrencyId);
          await add(accountId, price.quoteCurrencyId, divRound(held * num * pow10(dec), den * pow10(10)));
        } else {
          for (const x of lotsHere) await add(accountId, x.lot.costCurrencyId, x.cost);
        }
      }
      out.push({
        date: day,
        total: amountJson(total, base, baseDecimals),
        assets: amountJson(total - liabilities, base, baseDecimals),
        liabilities: amountJson(liabilities, base, baseDecimals),
      });
    }
    return { base, points: out, missingRates: [...missing].sort() };
  }

  // ---- the home screen --------------------------------------------------------------------------

  async home(userId: string, requestedBase?: string): Promise<HomeResponse> {
    const base = await this.baseOf(userId, requestedBase);
    const [netWorth, month, allocation, drafts] = await Promise.all([
      this.netWorth(userId, { base }),
      this.month(userId, monthKey(this.today()), base),
      this.allocation(userId, { base }),
      this.prisma.moneyTransaction.count({ where: { userId, status: 'draft' } }),
    ]);
    return { base, netWorth, month, allocation, drafts };
  }
}

