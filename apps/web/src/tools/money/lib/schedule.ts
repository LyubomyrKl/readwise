/**
 * The recurring schedule as the API stores it (an RRULE subset: FREQ, INTERVAL,
 * BYDAY, BYMONTHDAY, BYMONTH) and as people read it.
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface ScheduleParts {
  freq: Freq;
  interval: number;
  /** weekly: 0 = Monday … 6 = Sunday */
  byDay: number[];
  /** monthly, yearly: 1-31 or -1 for the last day */
  byMonthDay: number | null;
  /** yearly: 1-12 */
  byMonth: number | null;
}

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseRule(rule: string): ScheduleParts {
  const parts = new Map(
    rule
      .toUpperCase()
      .split(";")
      .filter(Boolean)
      .map((p) => p.split("=") as [string, string])
  );
  const day = parts.get("BYMONTHDAY");
  const month = parts.get("BYMONTH");
  return {
    freq: (parts.get("FREQ") as Freq) ?? "MONTHLY",
    interval: Number(parts.get("INTERVAL") ?? 1),
    byDay: (parts.get("BYDAY") ?? "")
      .split(",")
      .filter(Boolean)
      .map((d) => WEEKDAYS.indexOf(d as (typeof WEEKDAYS)[number]))
      .filter((d) => d >= 0),
    byMonthDay: day === undefined ? null : Number(day),
    byMonth: month === undefined ? null : Number(month),
  };
}

export function buildRule(s: ScheduleParts): string {
  const out = [`FREQ=${s.freq}`];
  if (s.interval > 1) out.push(`INTERVAL=${s.interval}`);
  if (s.freq === "WEEKLY" && s.byDay.length) out.push(`BYDAY=${[...s.byDay].sort((a, b) => a - b).map((d) => WEEKDAYS[d]).join(",")}`);
  if ((s.freq === "MONTHLY" || s.freq === "YEARLY") && s.byMonthDay !== null) out.push(`BYMONTHDAY=${s.byMonthDay}`);
  if (s.freq === "YEARLY" && s.byMonth !== null) out.push(`BYMONTH=${s.byMonth}`);
  return out.join(";");
}

function ordinal(n: number): string {
  if (n === -1) return "last day";
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** "Monthly on the 10th", "Every 2 weeks on Mon, Thu"; missing days come from the start date. */
export function describeRule(rule: string, startDate?: string): string {
  const s = parseRule(rule);
  const start = startDate ? new Date(`${startDate}T00:00:00Z`) : null;
  const every = (one: string, many: string) => (s.interval > 1 ? `Every ${s.interval} ${many}` : one);
  switch (s.freq) {
    case "DAILY":
      return every("Every day", "days");
    case "WEEKLY": {
      const days = s.byDay.length ? s.byDay : start ? [(start.getUTCDay() + 6) % 7] : [];
      return `${every("Weekly", "weeks")}${days.length ? ` on ${days.map((d) => WEEKDAY_NAMES[d]).join(", ")}` : ""}`;
    }
    case "MONTHLY": {
      const day = s.byMonthDay ?? start?.getUTCDate() ?? null;
      return `${every("Monthly", "months")}${day === null ? "" : ` on the ${ordinal(day)}`}`;
    }
    case "YEARLY": {
      const day = s.byMonthDay ?? start?.getUTCDate() ?? null;
      const month = s.byMonth ?? (start ? start.getUTCMonth() + 1 : null);
      const when = day === -1 ? `the last day of ${month ? MONTH_NAMES[month - 1] : "the month"}` : `${day ?? ""} ${month ? MONTH_NAMES[month - 1] : ""}`.trim();
      return `${every("Yearly", "years")}${when ? ` on ${when}` : ""}`;
    }
  }
}
