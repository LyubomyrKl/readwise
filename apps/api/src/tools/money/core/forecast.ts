import { divRound, formatScaled } from './decimal';

/**
 * Forecasts, from amounts already in the base currency. Pure, and integers throughout (rule 1):
 * medians and quartiles of minor units, rounded half away from zero like every other figure.
 *
 * The month on pace: what is spent so far, plus what the months before usually spent after the
 * same day of the month (their median; the range is their quartiles). A month whose rent leaves on
 * the 1st and whose salary comes on the 10th therefore projects right on the 2nd, where a straight
 * line from the pace so far would not. Without three months of history the straight line is all
 * there is. "The same day" is the last day with anything recorded: a statement imported up to the
 * 12th projects from the 12th, and a month with nothing in it yet as a usual month.
 *
 * The usual month (a median) answers "is this month normal"; totals over many months (the year,
 * the months the bank covers, net worth ahead) take the average month instead, because a holiday
 * or a tax that comes a few times a year is usually missing from the median and never from a year.
 */

/** Months of history before a projection leans on it rather than on a straight line (one, when the person chose the months). */
export const MIN_HISTORY = 3;

/** The quantile num/den of the values, linear between ranks (as spreadsheets do); null without values. */
export function quantile(values: readonly bigint[], num: bigint, den: bigint): bigint | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const position = num * BigInt(sorted.length - 1);
  const lower = Number(position / den);
  const rest = position % den;
  if (rest === 0n) return sorted[lower];
  // the exact value between the two ranks, then rounded once
  return divRound(sorted[lower] * den + (sorted[lower + 1] - sorted[lower]) * rest, den);
}

export const median = (values: readonly bigint[]): bigint | null => quantile(values, 1n, 2n);

/** The average, rounded once; null without values. */
export function mean(values: readonly bigint[]): bigint | null {
  if (values.length === 0) return null;
  return divRound(values.reduce((a, b) => a + b, 0n), BigInt(values.length));
}

export interface Habit {
  /** the average month; null under three months */
  average: bigint | null;
  /** the months with anything in them */
  monthsWith: number;
  /** comes now and then: spent in at most half the months (travel, a tax paid twice a year) */
  lumpy: boolean;
}

/**
 * How a category spends over the months before (their whole totals): most months, or now and then.
 * One spent every month with a spike in some (transport, a doctor) keeps its usual month: a spike
 * is then unusual, and only totals over many months need the average.
 */
export function habit(totals: readonly bigint[]): Habit {
  const monthsWith = totals.filter((t) => t !== 0n).length;
  if (totals.length < MIN_HISTORY) return { average: null, monthsWith, lumpy: false };
  const average = mean(totals)!;
  return { average, monthsWith, lumpy: average > 0n && 2 * monthsWith <= totals.length };
}

/** The running total at the end of a day of the month; past a shorter month's end, its whole. */
export function runningAt(running: readonly bigint[], day: number): bigint {
  if (running.length === 0 || day < 1) return 0n;
  return running[Math.min(day, running.length) - 1];
}

/** Day-by-day amounts (index 0 = the 1st) as running totals. */
export function runningTotals(daily: readonly bigint[]): bigint[] {
  let sum = 0n;
  return daily.map((v) => (sum += v));
}

export interface Pace {
  soFar: bigint;
  /** where the months before usually stood by this day (their median); null without history */
  typicalByNow: bigint | null;
  /** so far, plus what usually follows after this day */
  projected: bigint;
  /** the likely range of the projection: the quartiles of what followed */
  low: bigint;
  high: bigint;
  /** the median whole month; null without history */
  typicalMonth: bigint | null;
  /** 'history' leans on the months before; 'pace' is the straight line from the pace so far */
  method: 'history' | 'pace';
}

/**
 * This month's running total against the running totals of the months before. `day` is the day it
 * is read at (the last recorded), `days` the length of this month; `elapsed`, the days gone (today),
 * is what a straight line divides by, since a quiet stretch may simply be a quiet stretch.
 */
export function pace(current: readonly bigint[], day: number, days: number, past: readonly (readonly bigint[])[], elapsed = day, minMonths = MIN_HISTORY): Pace {
  const soFar = runningAt(current, day);
  if (past.length < Math.max(1, minMonths)) {
    const projected = elapsed < 1 || elapsed >= days ? soFar : divRound(soFar * BigInt(days), BigInt(elapsed));
    return { soFar, typicalByNow: null, projected, low: projected, high: projected, typicalMonth: null, method: 'pace' };
  }
  const after = past.map((month) => runningAt(month, month.length) - runningAt(month, day));
  const usual = (q: [bigint, bigint]) => soFar + quantile(after, q[0], q[1])!;
  return {
    soFar,
    typicalByNow: median(past.map((month) => runningAt(month, day))),
    projected: usual([1n, 2n]),
    low: usual([1n, 4n]),
    high: usual([3n, 4n]),
    typicalMonth: median(past.map((month) => runningAt(month, month.length))),
    method: 'history',
  };
}

/** The usual running total for each day of a month of `days` days: the median, and the quartiles around it. */
export function usualCurve(past: readonly (readonly bigint[])[], days: number, minMonths = MIN_HISTORY): { typical: bigint; low: bigint; high: bigint }[] {
  if (past.length < Math.max(1, minMonths)) return [];
  return Array.from({ length: days }, (_, i) => {
    const at = past.map((month) => runningAt(month, i + 1));
    return { typical: median(at)!, low: quantile(at, 1n, 4n)!, high: quantile(at, 3n, 4n)! };
  });
}

/** How far above (+) or below (-) the usual a figure is, in percent with one decimal; null without a usual. */
export function changePercent(value: bigint, usual: bigint | null): string | null {
  if (usual === null || usual === 0n) return null;
  return formatScaled(divRound((value - usual) * 1000n, usual), 1);
}

export interface Totals {
  income: bigint;
  expenses: bigint;
}

/** The year: what is in so far, the rest of this month as projected, and an average month for each month left. */
export function yearProjection(soFar: Totals, restOfMonth: Totals, monthsLeft: number, averageMonth: Totals | null): Totals {
  const ahead = averageMonth ?? { income: 0n, expenses: 0n };
  return {
    income: soFar.income + restOfMonth.income + BigInt(monthsLeft) * ahead.income,
    expenses: soFar.expenses + restOfMonth.expenses + BigInt(monthsLeft) * ahead.expenses,
  };
}

/** What moved net worth in a month: saved (income less expenses), one-offs, accounts added, and the rest. */
export interface WorthChange {
  change: bigint;
  saved: bigint;
  /** what categories left out of the totals moved: a car sold (+) */
  oneOffs: bigint;
  /** money already owned, tracked from this month: an account's opening balance, a holding held before */
  added: bigint;
  /** whatever else moved it: prices and exchange rates (and anything never recorded) */
  markets: bigint;
}

/** Each month's change of net worth, told apart; `parts[i]` belongs to the month ending at `ends[i + 1]`. */
export function worthChanges(ends: readonly bigint[], parts: readonly { saved: bigint; oneOffs: bigint; added: bigint }[]): WorthChange[] {
  return parts.map((p, i) => {
    const change = ends[i + 1] - ends[i];
    return { change, ...p, markets: change - p.saved - p.oneOffs - p.added };
  });
}

export interface NetWorthOutlook {
  /** what an average month saves (income less expenses, one-offs out) */
  monthlySaving: bigint;
  /** one point per month ahead, and around it how much a month's saving usually varies, accumulated */
  projection: { value: bigint; low: bigint; high: bigint }[];
}

/**
 * Net worth ahead from what is saved, not from how net worth moved: today's worth, the rest of this
 * month as projected, then the average month saved (`savings`, the months before) for every month
 * ahead, and what is invested today growing at `returnBp` basis points a year (simple within the
 * year, so a year ahead is exactly the rate). One-offs and accounts added are in today's worth and
 * in no month saved; past moves of prices and exchange rates are not carried forward, only the rate
 * the person sets. The range widens by half the spread of the middle months saved, month by month.
 */
export function netWorthOutlook(p: {
  now: bigint;
  savings: readonly bigint[];
  ahead: number;
  restOfMonth?: bigint;
  invested?: bigint;
  returnBp?: bigint;
  minMonths?: number;
}): NetWorthOutlook | null {
  if (p.savings.length < Math.max(1, p.minMonths ?? MIN_HISTORY)) return null;
  const monthlySaving = mean(p.savings)!;
  const spread = divRound(quantile(p.savings, 3n, 4n)! - quantile(p.savings, 1n, 4n)!, 2n);
  const start = p.now + (p.restOfMonth ?? 0n);
  const yearly = (p.invested ?? 0n) * (p.returnBp ?? 0n);
  return {
    monthlySaving,
    projection: Array.from({ length: p.ahead }, (_, i) => {
      const k = BigInt(i + 1);
      const value = start + k * monthlySaving + divRound(yearly * k, 12n * 10_000n);
      return { value, low: value - k * spread, high: value + k * spread };
    }),
  };
}

/** Months of the usual spending that an amount covers, one decimal; null without spending. */
export function monthsCovered(amount: bigint, monthlyExpenses: bigint | null): string | null {
  if (monthlyExpenses === null || monthlyExpenses <= 0n) return null;
  return formatScaled(divRound(amount * 10n, monthlyExpenses), 1);
}
