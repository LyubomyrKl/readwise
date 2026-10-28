import { shiftMonth } from "./chart";
import { isZero } from "./format";
import type { HistoryPoint } from "../types";

export type RangeKey = "12m" | "3y" | "all";

export const RANGES: { value: RangeKey; label: string }[] = [
  { value: "12m", label: "12 months" },
  { value: "3y", label: "3 years" },
  { value: "all", label: "All" },
];

/** The `from` the views API takes for a range ending this month. */
export function rangeFrom(range: RangeKey, thisMonth: string): string {
  if (range === "all") return "start";
  return shiftMonth(thisMonth, range === "3y" ? -35 : -11);
}

/** Month ends before anything was recorded say nothing; the chart starts at the first that does. */
export function trimLeadingEmpty(points: HistoryPoint[]): HistoryPoint[] {
  const first = points.findIndex((p) => !isZero(p.total.value) || !isZero(p.assets.value) || !isZero(p.liabilities.value));
  return first <= 0 ? points : points.slice(first);
}

/** Quick picks for the base currency: the setting first, then what is held, then the usual ones. */
export function suggestBases(settingsBase: string | undefined, held: string[], max = 4): string[] {
  const out: string[] = [];
  for (const c of [settingsBase, ...held, "EUR", "USD", "PLN"]) if (c && !out.includes(c)) out.push(c);
  return out.slice(0, max);
}
