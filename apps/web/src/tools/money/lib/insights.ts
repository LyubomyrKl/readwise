import type { AmountJson, CategoryPace, ForecastResponse, PaceDay } from "../types";
import { shortMonth } from "./chart";

/**
 * The forecast as the Insights page draws it. Amount strings become numbers only to place marks;
 * every figure a person reads stays the exact string.
 */

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

/**
 * A category as a bar on a shared scale: what is spent so far, the projection beyond it, and a tick
 * where the usual month ends; percents of `max`.
 */
export function categoryBar(c: CategoryPace, max: number) {
  const pct = (v: number | null) => (v === null || max <= 0 ? null : Math.min(100, Math.max(0, (v / max) * 100)));
  return { soFar: pct(num(c.soFar)) ?? 0, projected: pct(num(c.projected)) ?? 0, usual: pct(num(c.typicalMonth)) };
}

/** The scale every category bar shares: the largest of the figures any of them shows. */
export function categoryScale(categories: CategoryPace[]): number {
  return Math.max(0, ...categories.flatMap((c) => [num(c.projected) ?? 0, num(c.typicalMonth) ?? 0, num(c.soFar) ?? 0]));
}
