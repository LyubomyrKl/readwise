/**
 * Calendar dates without a time of day, as the ledger uses them: a Date at UTC
 * midnight (what Prisma reads from and writes to a @db.Date column) and its
 * "YYYY-MM-DD" form on the wire.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class DateFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateFormatError';
  }
}

export function parseDate(input: string): Date {
  const match = DATE_RE.exec(input.trim());
  if (!match) throw new DateFormatError(`not a date (YYYY-MM-DD): "${input}"`);
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new DateFormatError(`no such day: "${input}"`);
  }
  return date;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "2026-10" */
export function monthKey(date: Date): string {
  return formatDate(date).slice(0, 7);
}

export function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Same day `months` later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number, day = date.getUTCDate()): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  return new Date(Date.UTC(year, month, Math.min(day, daysInMonth(year, month))));
}

export function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

/** Whole days from a to b (b later is positive). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** The calendar date at `now` in an IANA time zone (the scheduler's "today"). */
export function todayIn(timeZone: string, now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return parseDate(`${get('year')}-${get('month')}-${get('day')}`);
}

/** Minutes since local midnight at `now` in a time zone. */
export function minutesIntoDay(timeZone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return get('hour') * 60 + get('minute');
}

/** The last day of the quarter before the one `date` is in (31 Dec for any day in Q1). */
export function previousQuarterEnd(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 0));
}

/** Months from `from` to `to` inclusive, as first-of-month dates. */
export function monthsBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let m = startOfMonth(from); m <= to; m = addMonths(m, 1, 1)) out.push(m);
  return out;
}
