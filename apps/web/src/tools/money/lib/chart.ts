/**
 * Geometry for the money charts. Amount strings become numbers here only to
 * place marks on screen; every value a person reads stays the exact string.
 */

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

const STEPS = [1, 2, 2.5, 5, 10];

/** A domain that always holds zero, widened to round steps (1, 2, 2.5 or 5 × 10^n). */
export function niceScale(values: readonly number[], count = 4): Scale {
  const finite = values.filter((v) => Number.isFinite(v));
  const lo = Math.min(0, ...finite);
  let hi = Math.max(0, ...finite);
  if (lo === hi) hi = lo + 1;
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = (STEPS.find((s) => s * magnitude >= raw) ?? 10) * magnitude;
  const first = Math.floor(lo / step);
  const last = Math.ceil(hi / step);
  const ticks: number[] = [];
  for (let k = first; k <= last; k++) ticks.push(Number((k * step).toPrecision(12)));
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
}

/** Every how many items to label so that at most `room` labels show. */
export function labelEvery(count: number, room: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, room)));
}

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

/** Axis ticks: 12 500 -> "12.5K" (the chart title names the currency). */
export function compactNumber(value: number): string {
  return compact.format(value);
}

const monthShort = new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });

/** "2026-10" or "2026-10-31" -> "Oct 26" */
export function shortMonth(dateOrMonth: string): string {
  return monthShort.format(new Date(`${dateOrMonth.slice(0, 7)}-01T00:00:00Z`));
}

/** A path for a bar with rounded corners at its data end only, anchored at `base`. */
export function barPath(x: number, width: number, base: number, end: number, radius = 4): string {
  const h = Math.abs(end - base);
  if (h === 0 || width <= 0) return "";
  const r = Math.min(radius, width / 2, h);
  if (end < base) {
    // grows up
    return `M${x},${base}V${end + r}Q${x},${end} ${x + r},${end}H${x + width - r}Q${x + width},${end} ${x + width},${end + r}V${base}Z`;
  }
  // grows down
  return `M${x},${base}V${end - r}Q${x},${end} ${x + r},${end}H${x + width - r}Q${x + width},${end} ${x + width},${end - r}V${base}Z`;
}

/** YYYY-MM of a month `delta` months from `month`. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** First and last day of a YYYY-MM month. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** "2026-10-28" -> "Q4 2026" */
export function quarterLabel(date: string): string {
  const month = Number(date.slice(5, 7));
  return `Q${Math.ceil(month / 3)} ${date.slice(0, 4)}`;
}
