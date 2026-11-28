import type { AmountJson, CategoryPace, ForecastRange, ForecastResponse, MoneySettings, PaceDay, WorthMonth } from "../types";
import { shiftMonth, shortMonth } from "./chart";
import { formatMonth, formatMonthSpan } from "./format";

/**
 * The forecast as the Insights page draws it. Amount strings become numbers only to place marks;
 * every figure a person reads stays the exact string.
 */

/**
 * The months every projection learns from, in words: "your last 12 months", "your 5 months this
 * year", "your 5 months since June 2026", "your 3 months, Jan – Mar 2026", or the month alone.
 */
export function basisLabel(f: Pick<ForecastResponse, "basisMonths" | "basisFrom" | "basisTo" | "range" | "until">): string {
  const n = f.basisMonths;
  if (n === 1 && f.basisFrom) return formatMonth(f.basisFrom);
  if (f.range === "this_year") return `your ${n} months this year`;
  if (f.range === "custom" && f.basisFrom && f.basisTo)
    return f.until ? `your ${n} months, ${formatMonthSpan(f.basisFrom, f.basisTo)}` : `your ${n} months since ${formatMonth(f.basisFrom)}`;
  return `your last ${n} months`;
}

/** What Learn from offers. */
export const RANGE_OPTIONS: { value: ForecastRange; label: string }[] = [
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "last_12_months", label: "Last 12 months" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

/** A chosen range in words: "your last 3 months", "this year", "June 2026 to now", "Jan – Mar 2026". */
export function rangeWords(s: Pick<MoneySettings, "forecastRange" | "forecastSince" | "forecastUntil">): string {
  if (s.forecastRange === "custom" && s.forecastSince)
    return s.forecastUntil ? formatMonthSpan(s.forecastSince, s.forecastUntil) : `${formatMonth(s.forecastSince)} to now`;
  if (s.forecastRange === "this_year") return "this year";
  if (s.forecastRange === "last_month") return "last month";
  return `your ${RANGE_OPTIONS.find((o) => o.value === s.forecastRange)?.label.toLowerCase() ?? "last 12 months"}`;
}

/** What the range button says: the common range, or the custom months ("Jun 2026 – now"). */
export function rangeTitle(f: Pick<ForecastResponse, "range" | "since" | "until">): string {
  if (f.range === "custom" && f.since) return f.until ? formatMonthSpan(f.since, f.until) : `${formatMonthSpan(f.since, f.since)} – now`;
  return RANGE_OPTIONS.find((o) => o.value === f.range)?.label ?? "Last 12 months";
}

const monthShort = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });

/**
 * The months the range picker offers, a year a row, this year first and back to the first
 * movement's (at most five years); a month can be learned from once it is over and when it has
 * movements.
 */
export function monthGrid(month: string, firstMonth: string | null): { year: number; months: { value: string; label: string; disabled: boolean }[] }[] {
  const thisYear = Number(month.slice(0, 4));
  const from = Math.max(thisYear - 4, Number((firstMonth ?? month).slice(0, 4)));
  return Array.from({ length: thisYear - from + 1 }, (_, i) => {
    const year = thisYear - i;
    return {
      year,
      months: Array.from({ length: 12 }, (_, k) => {
        const value = `${year}-${String(k + 1).padStart(2, "0")}`;
        return { value, label: monthShort.format(new Date(`${value}-01T00:00:00Z`)), disabled: value >= month || (firstMonth !== null && value < firstMonth) };
      }),
    };
  });
}

/** A custom range from two picked months, in either order; ending at last month it stays open, so new months join. */
export function pickedRange(a: string, b: string, month: string): { since: string; until: string | null } {
  const [since, end] = a <= b ? [a, b] : [b, a];
  return { since, until: end >= shiftMonth(month, -1) ? null : end };
}

/**
 * The next round figure net worth reaches at this pace (half a power of ten: 200 000 after 183 000,
 * 1 500 000 after 1 200 000; above zero again when below it), and the month end it gets there, null
 * when that is beyond the projection. Nothing when net worth is not rising.
 */
export function nextMilestone(now: number, ahead: { date: string; value: number }[]): { target: number; date: string | null } | null {
  const last = ahead.at(-1);
  if (!last || last.value <= now) return null;
  const step = now <= 0 ? 0 : 10 ** Math.floor(Math.log10(Math.max(now, 1))) / 2;
  const target = step === 0 ? 0 : (Math.floor(now / step) + 1) * step;
  return { target, date: ahead.find((p) => p.value >= target)?.date ?? null };
}

/** The safety net against the three to six months of spending often advised. */
export function safetyLevel(months: string | null): "below" | "within" | "beyond" | null {
  if (months === null) return null;
  const m = Number(months);
  return m < 3 ? "below" : m <= 6 ? "within" : "beyond";
}

/** A position on the chart, not a figure to read. */
export const num = (a: AmountJson | null | undefined): number | null => (a ? Number(a.value) : null);

/** This month's running total against the usual one, day by day. */
export function paceSeries(days: PaceDay[]) {
  return {
    labels: days.map((d) => String(d.day)),
    actual: days.map((d) => num(d.actual)),
    typical: days.map((d) => num(d.typical)),
    low: days.map((d) => num(d.low)),
    high: days.map((d) => num(d.high)),
  };
}

/**
 * Net worth behind (solid) and ahead (dashed, from the last month end so the two lines meet), the
 * range ahead starting at that same point.
 */
export function outlookSeries(nw: ForecastResponse["netWorth"]) {
  const behind = nw.history.map((p) => num(p.total));
  const ahead = nw.projection;
  const last = behind.length - 1;
  const join = (pick: (p: (typeof ahead)[number]) => AmountJson) => [
    ...behind.map((v, i) => (i === last && ahead.length ? v : null)),
    ...ahead.map((p) => num(pick(p))),
  ];
  return {
    labels: [...nw.history.map((p) => shortMonth(p.date)), ...ahead.map((p) => shortMonth(p.date))],
    history: [...behind, ...ahead.map(() => null)],
    projection: join((p) => p.value),
    low: join((p) => p.low),
    high: join((p) => p.high),
    /** the last month end behind: today */
    today: last,
  };
}

export type Tone = "good" | "warn" | "neutral";

/**
 * "12.5% above usual", and whether that is good: more spending is the warning, more income the good
 * news. Within 5% either way is "about usual".
 */
export function changeLabel(change: string | null, kind: "expense" | "income"): { text: string; direction: "up" | "down" | "even"; tone: Tone } | null {
  if (change === null) return null;
  const value = Number(change);
  if (Math.abs(value) < 5) return { text: "About usual", direction: "even", tone: "neutral" };
  const up = value > 0;
  const text = `${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}% ${up ? "above" : "below"} usual`;
  const good = kind === "income" ? up : !up;
  return { text, direction: up ? "up" : "down", tone: good ? "good" : "warn" };
}

/** Where a category's tick goes: the usual month, or the average one for a category that comes in lumps. */
const reference = (c: CategoryPace) => (c.lumpy ? c.averageMonth : c.typicalMonth);

/**
 * A category as a bar on a shared scale: what is spent so far, the projection beyond it, and a tick
 * where the usual month ends (the average month, for one that comes in lumps); percents of `max`.
 */
export function categoryBar(c: CategoryPace, max: number) {
  const pct = (v: number | null) => (v === null || max <= 0 ? null : Math.min(100, Math.max(0, (v / max) * 100)));
  return { soFar: pct(num(c.soFar)) ?? 0, projected: pct(num(c.projected)) ?? 0, usual: pct(num(reference(c))) };
}

/** The scale every category bar shares: the largest of the figures any of them shows. */
export function categoryScale(categories: CategoryPace[]): number {
  return Math.max(0, ...categories.flatMap((c) => [num(c.projected) ?? 0, num(reference(c)) ?? 0, num(c.soFar) ?? 0]));
}

/**
 * Each month's change of net worth as stacked parts: saved, markets and exchange rates, and one-offs
 * with the accounts added (both are worth that was never saved), plus the net change.
 */
export function worthSeries(months: WorthMonth[]) {
  return {
    labels: months.map((m) => shortMonth(m.month)),
    saved: months.map((m) => num(m.saved) ?? 0),
    markets: months.map((m) => num(m.markets) ?? 0),
    oneOffs: months.map((m) => (num(m.oneOffs) ?? 0) + (num(m.added) ?? 0)),
    net: months.map((m) => num(m.change) ?? 0),
  };
}
