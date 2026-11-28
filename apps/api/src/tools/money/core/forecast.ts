import { divRound, formatScaled } from './decimal';

/**
 * Forecasts, from amounts already in the base currency. Pure, and integers throughout (rule 1):
 * medians and quartiles of minor units, rounded half away from zero like every other figure.
 *
 * The month on pace: what is spent so far, plus what the months before usually spent after the
 * same day of the month (their median; the range is their quartiles). A month whose rent leaves on
 * the 1st and whose salary comes on the 10th therefore projects right on the 2nd, where a straight
 * line from the pace so far would not. Without three months of history the straight line is all
 * there is.
 */

/** Months of history before a projection leans on it rather than on a straight line. */
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
 * This month's running total (up to today) against the running totals of the months before.
 * `day` is today's day of the month, `days` the length of this month.
 */
export function pace(current: readonly bigint[], day: number, days: number, past: readonly (readonly bigint[])[]): Pace {
  const soFar = runningAt(current, day);
  if (past.length < MIN_HISTORY) {
    const projected = day >= days ? soFar : divRound(soFar * BigInt(days), BigInt(day));
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
export function usualCurve(past: readonly (readonly bigint[])[], days: number): { typical: bigint; low: bigint; high: bigint }[] {
  if (past.length < MIN_HISTORY) return [];
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

/** The year: what is in so far, the rest of this month as projected, and a usual month for each month left. */
export function yearProjection(soFar: Totals, restOfMonth: Totals, monthsLeft: number, usualMonth: Totals | null): Totals {
  const ahead = usualMonth ?? { income: 0n, expenses: 0n };
  return {
    income: soFar.income + restOfMonth.income + BigInt(monthsLeft) * ahead.income,
    expenses: soFar.expenses + restOfMonth.expenses + BigInt(monthsLeft) * ahead.expenses,
  };
}

export interface NetWorthOutlook {
  /** the average change per month over the window (up to the last twelve months) */
  monthlyChange: bigint;
  /** one point per month ahead: the average pace, and around it how much a month usually varies, accumulated */
  projection: { value: bigint; low: bigint; high: bigint }[];
}

/**
 * Net worth ahead at the pace of the last twelve months (or fewer, from four month ends on). The
 * range widens by half the spread of the middle months' changes for every month ahead.
 */
export function netWorthOutlook(monthEnds: readonly bigint[], ahead: number): NetWorthOutlook | null {
  const window = monthEnds.slice(-13);
  if (window.length < 4) return null;
  const changes = window.slice(1).map((v, i) => v - window[i]);
  const monthlyChange = divRound(window[window.length - 1] - window[0], BigInt(changes.length));
  const spread = divRound(quantile(changes, 3n, 4n)! - quantile(changes, 1n, 4n)!, 2n);
  const now = window[window.length - 1];
  return {
    monthlyChange,
    projection: Array.from({ length: ahead }, (_, i) => {
      const k = BigInt(i + 1);
      const value = now + k * monthlyChange;
      return { value, low: value - k * spread, high: value + k * spread };
    }),
  };
}

/** Months of the usual spending that an amount covers, one decimal; null without spending. */
export function monthsCovered(amount: bigint, monthlyExpenses: bigint | null): string | null {
  if (monthlyExpenses === null || monthlyExpenses <= 0n) return null;
  return formatScaled(divRound(amount * 10n, monthlyExpenses), 1);
}
