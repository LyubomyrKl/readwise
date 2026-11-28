import { Injectable } from '@nestjs/common';
import { PrismaService } from '@platform/db/prisma.service';
import { amountJson } from '../common/amounts';
import { addDays, addMonths, endOfMonth, formatDate, monthKey, monthsBetween, startOfMonth } from '../core/dates';
import {
  changePercent,
  habit,
  mean,
  MIN_HISTORY,
  monthsCovered,
  netWorthOutlook,
  pace,
  runningTotals,
  usualCurve,
  worthChanges,
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

/** The months before this one that it is compared with, unless the person chose others. */
const LOOKBACK = 12;
/** The rolling ranges, in months before this one. */
const ROLLING: Partial<Record<string, number>> = { last_month: 1, last_3_months: 3, last_6_months: 6, last_12_months: 12 };
/** Month ends of net worth behind, and ahead. */
const NET_WORTH_BEHIND = 24;
const NET_WORTH_AHEAD = 12;

interface Day {
  income: bigint;
  expenses: bigint;
  byCategory: Map<string | null, bigint>;
  /** what categories left out of the totals moved (a car sold: +), apart from income and expenses */
  oneOff: bigint;
  /** money already owned, tracked from this day: what came from the opening balances account */
  added: bigint;
}

/**
 * Where the money is heading: this month on pace against the months before (expenses, income, each
 * category, and whether a category comes in lumps), the year so far and as projected, net worth
 * ahead from what an average month saves (and investments at the expected return of the settings),
 * each month's change of net worth told apart, the months of average spending the bank and cash
 * cover, and what is still scheduled this month. Read-only; figures in the base currency at each
 * day's rate, like the other views; one-offs left out, like the totals.
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

    // the history: the months the person chose to learn from (the last twelve unless they chose; things
    // change: a tax begins, a new job), never before the first movement
    const settings = await this.prisma.moneySettings.findUniqueOrThrow({ where: { userId } });
    const first = await this.prisma.moneyTransaction.findFirst({
      where: { userId, status: 'posted', kind: { not: 'opening_balance' } },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    const firstMonth = first ? startOfMonth(first.date) : thisMonth;
    const lookback = addMonths(thisMonth, -LOOKBACK, 1);
    const previous = addMonths(thisMonth, -1, 1);
    const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const range = settings.forecastRange;
    let from = range === 'this_year' ? yearStart : addMonths(thisMonth, -(ROLLING[range] ?? LOOKBACK), 1);
    let to = previous;
    if (range === 'custom' && settings.forecastSince) {
      from = startOfMonth(settings.forecastSince);
      if (settings.forecastUntil && startOfMonth(settings.forecastUntil) < previous) to = startOfMonth(settings.forecastUntil);
    }
    if (firstMonth > from) from = firstMonth;
    const past = from <= to ? monthsBetween(from, to) : [];
    // net worth ahead keeps its own: the last twelve months, whatever the range (a long view)
    const year = monthsBetween(lookback > firstMonth ? lookback : firstMonth, previous).filter((m) => m <= previous);
    // months the person chose are enough from one on; the last twelve by default need three
    const minMonths = range === 'last_12_months' ? MIN_HISTORY : 1;
    // and last year whole, for the year's comparison; the year behind, for net worth's months
    const lastYearStart = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1));
    const fetchFrom = [lookback, lastYearStart, from].reduce((a, b) => (a < b ? a : b));
    const { entries, missing } = await this.views.flowEntries(userId, base, fetchFrom, today, { openings: true });

    // day by day, as the month's totals count it (transfers aside, one-offs and opening balances apart)
    const byDate = new Map<string, FlowEntry[]>();
    const recordedDays = new Set<string>();
    for (const e of entries) {
      const list = byDate.get(e.date!);
      if (list) list.push(e);
      else byDate.set(e.date!, [e]);
      if (e.kind !== 'opening_balance') recordedDays.add(e.date!);
    }
    const daily = new Map<string, Day>();
    for (const [date, list] of byDate) {
      const t = monthTotals(list);
      const total = (map: Map<string | null, bigint>) => [...map.values()].reduce((a, b) => a + b, 0n);
      daily.set(date, {
        income: t.income,
        expenses: t.expenses,
        byCategory: t.expensesByCategory,
        oneOff: total(t.leftOutIncomeByCategory) - total(t.leftOutExpensesByCategory),
        // an account's opening balance, or a holding held before: worth that was never saved here
        added: -list.filter((e) => e.systemRole === 'opening_balance').reduce((a, e) => a + (e.base ?? 0n), 0n),
      });
    }
    // the last day of this month with anything recorded: a statement imported up to the 12th
    // projects from the 12th; a month with nothing in it yet, as a usual month
    const monthPrefix = monthKey(today);
    const recorded = Math.max(0, ...[...recordedDays].filter((date) => date.startsWith(monthPrefix)).map((date) => Number(date.slice(8, 10))));
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
        running(thisMonth, pick, recorded),
        recorded,
        days,
        past.map((m) => running(m, pick)),
        day,
        minMonths,
      );
    /** a past month's whole total of one figure */
    const whole = (month: Date, pick: (d: Day) => bigint) => sumMonth(running(month, pick));
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
      minMonths,
    );
    const spent = running(thisMonth, (d) => d.expenses, recorded);

    // each expense category on pace, the furthest from its usual month first
    const names = await this.categoryNames(userId);
    const keys = new Set<string | null>();
    const since = formatDate(past[0] ?? thisMonth);
    for (const [date, d] of daily) if (date >= since) for (const key of d.byCategory.keys()) keys.add(key);
    const categories = [...keys]
      .map((key) => {
        const pick = (d: Day) => d.byCategory.get(key) ?? 0n;
        return { key, p: onPace(pick), h: habit(past.map((m) => whole(m, pick))) };
      })
      .filter(({ p, h }) => p.soFar !== 0n || p.projected !== 0n || (p.typicalMonth ?? 0n) !== 0n || (h.average ?? 0n) !== 0n)
      .map((c) => ({ ...c, gap: abs(c.p.projected - (c.p.typicalMonth ?? 0n)) }))
      .sort((a, b) => (b.gap > a.gap ? 1 : b.gap < a.gap ? -1 : 0))
      .map(({ key, p, h }) => ({
        categoryId: key,
        name: names.get(key ?? '') ?? 'Uncategorised',
        ...paceJson(p),
        // a category that comes now and then is not unusual for coming this month
        change: h.lumpy ? null : changePercent(p.projected, p.typicalMonth),
        averageMonth: maybe(h.average),
        monthsWith: h.monthsWith,
        lumpy: h.lumpy,
      }));

    // the year: so far, the rest of this month as projected, an average month (or this one) for each month left
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
    // the average month, not the usual one: a total over months has its lumps (a holiday, a tax)
    const averageMonth =
      past.length >= minMonths
        ? { income: mean(past.map((m) => whole(m, (d) => d.income)))!, expenses: mean(past.map((m) => whole(m, (d) => d.expenses)))! }
        : { income: income.projected, expenses: expenses.projected };
    const ytd = sum(yearStart, today);
    const lastYear = sum(lastYearStart, new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 31)));
    const projectedYear = yearProjection(
      ytd,
      { income: income.projected - income.soFar, expenses: expenses.projected - expenses.soFar },
      11 - today.getUTCMonth(),
      averageMonth,
    );

    // net worth: the month ends behind, each recent month's change told apart, and ahead from what is saved
    const anyFirst = await this.prisma.moneyTransaction.findFirst({ where: { userId, status: 'posted' }, orderBy: { date: 'asc' }, select: { date: true } });
    const behind = addMonths(thisMonth, -(NET_WORTH_BEHIND - 1), 1);
    const nwFrom = anyFirst && startOfMonth(anyFirst.date) > behind ? startOfMonth(anyFirst.date) : behind;
    const history = await this.views.history(userId, { base, from: monthKey(nwFrom), to: monthKey(thisMonth), asOf: today });
    const ends = new Map(history.points.map((p) => [p.date.slice(0, 7), BigInt(p.total.minor)]));
    // the year behind and this month so far; before the very first month there was nothing
    const told = monthsBetween(lookback, thisMonth).filter((m) => ends.has(monthKey(m)));
    const before = told.length ? (ends.get(monthKey(addMonths(told[0], -1, 1))) ?? 0n) : 0n;
    const inMonth = (month: Date, pick: (d: Day) => bigint) => {
      const [key, upTo] = [monthKey(month), formatDate(month < thisMonth ? endOfMonth(month) : today)];
      let sum = 0n;
      for (const [date, d] of daily) if (date.startsWith(key) && date <= upTo) sum += pick(d);
      return sum;
    };
    const changes = worthChanges(
      [before, ...told.map((m) => ends.get(monthKey(m))!)],
      told.map((m) => ({ saved: inMonth(m, (d) => d.income - d.expenses), oneOffs: inMonth(m, (d) => d.oneOff), added: inMonth(m, (d) => d.added) })),
    );

    // what is invested today (holdings at their value), growing at the rate the person expects
    const worth = await this.views.netWorth(userId, { base, asOf: today });
    let invested = 0n;
    for (const item of worth.accounts.flatMap((a) => a.items)) if (item.kind === 'asset' && item.value) invested += BigInt(item.value.minor);
    const outlook = netWorthOutlook({
      now: history.points.length ? BigInt(history.points[history.points.length - 1].total.minor) : 0n,
      savings: year.map((m) => whole(m, (d) => d.income) - whole(m, (d) => d.expenses)),
      ahead: NET_WORTH_AHEAD,
      restOfMonth: income.projected - income.soFar - (expenses.projected - expenses.soFar),
      invested,
      returnBp: BigInt(settings.expectedReturn.times(100).toFixed(0)),
    });

    // the months of average spending that the bank and cash cover
    const bank = worth.types.find((t) => t.key === 'bank');
    const liquid = bank ? BigInt(bank.value.minor) : 0n;
    const monthlyExpenses = past.length >= minMonths ? averageMonth.expenses : null;

    return {
      base,
      asOf: formatDate(today),
      month: monthKey(today),
      day,
      daysInMonth: days,
      recordedThrough: recorded,
      method: expenses.method,
      basisMonths: past.length,
      basisFrom: past.length ? monthKey(past[0]) : null,
      basisTo: past.length ? monthKey(past[past.length - 1]) : null,
      firstMonth: first ? monthKey(firstMonth) : null,
      range,
      since: settings.forecastSince ? monthKey(settings.forecastSince) : null,
      until: settings.forecastUntil ? monthKey(settings.forecastUntil) : null,
      expenses: paceJson(expenses),
      income: paceJson(income),
      savings: money(savings),
      savingsRate: income.projected > 0n ? percentOf(savings, income.projected) : null,
      days: Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        actual: i < recorded ? money(spent[i]) : null,
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
        months: changes.map((c, i) => ({
          month: monthKey(told[i]),
          change: money(c.change),
          saved: money(c.saved),
          markets: money(c.markets),
          oneOffs: money(c.oneOffs),
          added: money(c.added),
        })),
        monthlySaving: outlook ? money(outlook.monthlySaving) : null,
        savingMonths: year.length,
        invested: money(invested),
        expectedReturn: settings.expectedReturn.toFixed(),
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
