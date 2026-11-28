import { Injectable } from '@nestjs/common';
import { PrismaService } from '@platform/db/prisma.service';
import { amountJson } from '../common/amounts';
import { addDays, addMonths, endOfMonth, formatDate, monthKey, monthsBetween, startOfMonth } from '../core/dates';
import {
  changePercent,
  median,
  MIN_HISTORY,
  monthsCovered,
  netWorthOutlook,
  pace,
  runningTotals,
  usualCurve,
  yearProjection,
  type Pace,
  type Totals,
} from '../core/forecast';
import { parseMinor } from '../core/money';
import { occurrences, parseSchedule } from '../core/schedule';
import { monthTotals, percentOf, type FlowEntry } from '../core/views';
import { CommoditiesService } from '../reference/commodities.service';
import type { ForecastResponse, PaceResponse, UpcomingMovement, YearFigures } from './view.models';
import { ViewsService } from './views.service';

/** The months before this one that it is compared with. */
const LOOKBACK = 12;
/** Month ends of net worth behind, and ahead. */
const NET_WORTH_BEHIND = 24;
const NET_WORTH_AHEAD = 12;

interface Day {
  income: bigint;
  expenses: bigint;
  byCategory: Map<string | null, bigint>;
}

/**
 * Where the money is heading: this month on pace against the months before (expenses, income, each
 * category), the year so far and as projected, net worth at last year's pace, the months of usual
 * spending the bank and cash cover, and what is still scheduled this month. Read-only; figures in
 * the base currency at each day's rate, like the other views; one-offs left out, like the totals.
 */
@Injectable()
export class ForecastService {
  constructor(
    private readonly views: ViewsService,
    private readonly prisma: PrismaService,
    private readonly commodities: CommoditiesService,
  ) {}

  async forecast(userId: string, q: { base?: string; asOf?: Date } = {}): Promise<ForecastResponse> {
    const base = await this.views.baseOf(userId, q.base);
    const dec = await this.commodities.decimalsOf(base);
    const money = (v: bigint) => amountJson(v, base, dec);
    const maybe = (v: bigint | null) => (v === null ? null : money(v));

    const today = q.asOf ?? this.views.today();
    const thisMonth = startOfMonth(today);
    const day = today.getUTCDate();
    const days = endOfMonth(today).getUTCDate();

    // the history: up to twelve months before this one, never before the first movement
    const first = await this.prisma.moneyTransaction.findFirst({
      where: { userId, status: 'posted', kind: { not: 'opening_balance' } },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    const firstMonth = first ? startOfMonth(first.date) : thisMonth;
    const lookback = addMonths(thisMonth, -LOOKBACK, 1);
    const previous = addMonths(thisMonth, -1, 1);
    const past = monthsBetween(lookback > firstMonth ? lookback : firstMonth, previous).filter((m) => m <= previous);
    // and last year whole, for the year's comparison
    const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const lastYearStart = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1));
    const { entries, missing } = await this.views.flowEntries(userId, base, lookback < lastYearStart ? lookback : lastYearStart, today);

    // day by day, as the month's totals count it (transfers aside, one-offs apart)
    const byDate = new Map<string, FlowEntry[]>();
    for (const e of entries) {
      const list = byDate.get(e.date!);
      if (list) list.push(e);
      else byDate.set(e.date!, [e]);
    }
    const daily = new Map<string, Day>();
    for (const [date, list] of byDate) {
      const t = monthTotals(list);
      daily.set(date, { income: t.income, expenses: t.expenses, byCategory: t.expensesByCategory });
    }
    /** a month's running total of one figure, up to `upTo` days */
    const running = (month: Date, pick: (d: Day) => bigint, upTo = endOfMonth(month).getUTCDate()) =>
      runningTotals(
        Array.from({ length: upTo }, (_, i) => {
          const d = daily.get(formatDate(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i + 1))));
          return d ? pick(d) : 0n;
        }),
      );
    const onPace = (pick: (d: Day) => bigint): Pace =>
      pace(
        running(thisMonth, pick, day),
        day,
        days,
        past.map((m) => running(m, pick)),
      );
    const paceJson = (p: Pace): PaceResponse => ({
      soFar: money(p.soFar),
      typicalByNow: maybe(p.typicalByNow),
      projected: money(p.projected),
      low: money(p.low),
      high: money(p.high),
      typicalMonth: maybe(p.typicalMonth),
      change: changePercent(p.projected, p.typicalMonth),
    });

    const expenses = onPace((d) => d.expenses);
    const income = onPace((d) => d.income);
    const savings = income.projected - expenses.projected;
    const usual = usualCurve(
      past.map((m) => running(m, (d) => d.expenses)),
      days,
    );
    const spent = running(thisMonth, (d) => d.expenses, day);

    // each expense category on pace, the furthest from its usual month first
    const names = await this.categoryNames(userId);
    const keys = new Set<string | null>();
    const since = formatDate(past[0] ?? thisMonth);
    for (const [date, d] of daily) if (date >= since) for (const key of d.byCategory.keys()) keys.add(key);
    const categories = [...keys]
      .map((key) => ({ key, p: onPace((d) => d.byCategory.get(key) ?? 0n) }))
      .filter(({ p }) => p.soFar !== 0n || p.projected !== 0n || (p.typicalMonth ?? 0n) !== 0n)
      .map(({ key, p }) => ({ key, p, gap: abs(p.projected - (p.typicalMonth ?? 0n)) }))
      .sort((a, b) => (b.gap > a.gap ? 1 : b.gap < a.gap ? -1 : 0))
      .map(({ key, p }) => ({
        categoryId: key,
        name: names.get(key ?? '') ?? 'Uncategorised',
        ...paceJson(p),
      }));

    // the year: so far, the rest of this month as projected, a usual month (or this one) for each month left
    const sum = (from: Date, to: Date): Totals & { months: Set<string> } => {
      const out = { income: 0n, expenses: 0n, months: new Set<string>() };
      const [a, b] = [formatDate(from), formatDate(to)];
      for (const [date, d] of daily) {
        if (date < a || date > b) continue;
        out.income += d.income;
        out.expenses += d.expenses;
        if (d.income !== 0n || d.expenses !== 0n) out.months.add(date.slice(0, 7));
      }
      return out;
    };
    const figures = (t: Totals): YearFigures => ({
      income: money(t.income),
      expenses: money(t.expenses),
      savings: money(t.income - t.expenses),
      savingsRate: t.income > 0n ? percentOf(t.income - t.expenses, t.income) : null,
    });
    const usualMonth =
      past.length >= MIN_HISTORY
        ? {
            income: median(past.map((m) => sumMonth(running(m, (d) => d.income))))!,
            expenses: median(past.map((m) => sumMonth(running(m, (d) => d.expenses))))!,
          }
        : { income: income.projected, expenses: expenses.projected };
    const ytd = sum(yearStart, today);
    const lastYear = sum(lastYearStart, new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 31)));
    const projectedYear = yearProjection(
      ytd,
      { income: income.projected - income.soFar, expenses: expenses.projected - expenses.soFar },
      11 - today.getUTCMonth(),
      usualMonth,
    );

    // net worth at last year's pace, from the month ends behind
    const anyFirst = await this.prisma.moneyTransaction.findFirst({ where: { userId, status: 'posted' }, orderBy: { date: 'asc' }, select: { date: true } });
    const behind = addMonths(thisMonth, -(NET_WORTH_BEHIND - 1), 1);
    const nwFrom = anyFirst && startOfMonth(anyFirst.date) > behind ? startOfMonth(anyFirst.date) : behind;
    const history = await this.views.history(userId, { base, from: monthKey(nwFrom), to: monthKey(thisMonth), asOf: today });
    const outlook = netWorthOutlook(
      history.points.map((p) => BigInt(p.total.minor)),
      NET_WORTH_AHEAD,
    );

    // the months of usual spending that the bank and cash cover
    const worth = await this.views.netWorth(userId, { base, asOf: today });
    const bank = worth.types.find((t) => t.key === 'bank');
    const liquid = bank ? BigInt(bank.value.minor) : 0n;
    const monthlyExpenses = past.length >= MIN_HISTORY ? usualMonth.expenses : null;

    return {
      base,
      asOf: formatDate(today),
      month: monthKey(today),
      day,
      daysInMonth: days,
      method: expenses.method,
      basisMonths: past.length,
      expenses: paceJson(expenses),
      income: paceJson(income),
      savings: money(savings),
      savingsRate: income.projected > 0n ? percentOf(savings, income.projected) : null,
      days: Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        actual: i < day ? money(spent[i]) : null,
        typical: usual[i] ? money(usual[i].typical) : null,
        low: usual[i] ? money(usual[i].low) : null,
        high: usual[i] ? money(usual[i].high) : null,
      })),
      categories,
      year: {
        year: today.getUTCFullYear(),
        soFar: figures(ytd),
        projected: figures(projectedYear),
        lastYear: lastYear.months.size > 0 ? { ...figures(lastYear), months: lastYear.months.size } : null,
      },
      netWorth: {
        history: history.points,
        monthlyChange: outlook ? money(outlook.monthlyChange) : null,
        projection: (outlook?.projection ?? []).map((p, i) => ({
          date: formatDate(endOfMonth(addMonths(thisMonth, i + 1, 1))),
          value: money(p.value),
          low: money(p.low),
          high: money(p.high),
        })),
      },
      runway: { liquid: money(liquid), monthlyExpenses: maybe(monthlyExpenses), months: monthsCovered(liquid, monthlyExpenses) },
      upcoming: await this.upcoming(userId, today),
      missingRates: [...new Set([...missing, ...history.missingRates, ...worth.missingRates])].sort(),
    };
  }

  /** "Parent / child" by id, a merged category under the one it went into (the flows read it that way already). */
  private async categoryNames(userId: string): Promise<Map<string, string>> {
    const categories = await this.prisma.moneyCategory.findMany({ where: { userId } });
    const byId = new Map(categories.map((c) => [c.id, c]));
    return new Map(
      categories.map((c) => {
        const parent = c.parentId ? byId.get(c.parentId) : undefined;
        return [c.id, parent ? `${parent.name} / ${c.name}` : c.name];
      }),
    );
  }

  /** Recurring movements due after today and by the month's end, in their own currency. */
  private async upcoming(userId: string, today: Date): Promise<UpcomingMovement[]> {
    const rules = await this.prisma.moneyRecurringRule.findMany({ where: { userId, pausedAt: null } });
    const out: UpcomingMovement[] = [];
    for (const rule of rules) {
      let dates: Date[];
      try {
        dates = occurrences(parseSchedule(rule.schedule), rule.startDate, addDays(today, 1), endOfMonth(today), { end: rule.endDate });
      } catch {
        continue;
      }
      const amount = await this.amountOf(rule.kind, rule.template);
      for (const date of dates.filter((d) => d >= rule.nextRunAt)) out.push({ date: formatDate(date), name: rule.name, kind: rule.kind, amount });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  }

  /** What a rule's template moves: the amount and currency its kind names. */
  private async amountOf(kind: string, template: unknown) {
    const input = (template ?? {}) as Record<string, unknown>;
    const [value, currency] =
      kind === 'transfer'
        ? [input.amountOut, input.fromCurrency]
        : kind === 'buy'
          ? [input.total, input.currency]
          : kind === 'sell'
            ? [input.proceeds, input.currency]
            : [input.amount, input.currency];
    if (typeof value !== 'string' || typeof currency !== 'string') return null;
    try {
      const dec = await this.commodities.decimalsOf(currency);
      return amountJson(parseMinor(value.replace(/^-/, ''), dec), currency, dec);
    } catch {
      return null;
    }
  }
}

const abs = (v: bigint) => (v < 0n ? -v : v);
/** a running total's whole month */
const sumMonth = (running: bigint[]) => running[running.length - 1] ?? 0n;
