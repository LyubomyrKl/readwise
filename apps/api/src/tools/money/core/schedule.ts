import { addDays, daysInMonth } from './dates';

/**
 * When a recurring movement happens: a subset of the RFC 5545 RRULE.
 *
 *   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY   required
 *   INTERVAL=n                         every n periods (default 1)
 *   BYDAY=MO,TH                        weekly: the weekdays (default: the start's)
 *   BYMONTHDAY=10 | -1                 monthly, yearly: the day, -1 the last (default: the start's)
 *   BYMONTH=3                          yearly: the month (default: the start's)
 *
 * A day past the end of a month falls on its last day (BYMONTHDAY=31 is
 * 30 April). Occurrences never come before the start date.
 */

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface Schedule {
  freq: Frequency;
  interval: number;
  /** weekly: 0 = Monday … 6 = Sunday */
  byDay?: number[];
  /** monthly, yearly: 1-31, or -1 for the last day */
  byMonthDay?: number;
  /** yearly: 1-12 */
  byMonth?: number;
}

export class ScheduleError extends Error {}

const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function parseSchedule(rule: string): Schedule {
  const parts = new Map<string, string>();
  for (const part of rule.trim().toUpperCase().replace(/^RRULE:/, '').split(';').filter(Boolean)) {
    const [key, value] = part.split('=');
    if (!key || value === undefined || parts.has(key)) throw new ScheduleError(`cannot read "${part}"`);
    parts.set(key, value);
  }
  const freq = parts.get('FREQ') as Frequency | undefined;
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) throw new ScheduleError('FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY');
  const known = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH']);
  for (const key of parts.keys()) if (!known.has(key)) throw new ScheduleError(`${key} is not supported`);

  const schedule: Schedule = { freq, interval: 1 };
  const interval = parts.get('INTERVAL');
  if (interval !== undefined) {
    if (!/^\d+$/.test(interval) || Number(interval) < 1 || Number(interval) > 366) throw new ScheduleError('INTERVAL must be 1 to 366');
    schedule.interval = Number(interval);
  }
  const byDay = parts.get('BYDAY');
  if (byDay !== undefined) {
    if (freq !== 'WEEKLY') throw new ScheduleError('BYDAY goes with FREQ=WEEKLY');
    const days = byDay.split(',').map((d) => DAYS.indexOf(d));
    if (days.some((d) => d < 0)) throw new ScheduleError('BYDAY takes MO, TU, WE, TH, FR, SA, SU');
    schedule.byDay = [...new Set(days)].sort((a, b) => a - b);
  }
  const byMonthDay = parts.get('BYMONTHDAY');
  if (byMonthDay !== undefined) {
    if (freq !== 'MONTHLY' && freq !== 'YEARLY') throw new ScheduleError('BYMONTHDAY goes with FREQ=MONTHLY or YEARLY');
    const d = Number(byMonthDay);
    if (!/^-?\d+$/.test(byMonthDay) || !((d >= 1 && d <= 31) || d === -1)) throw new ScheduleError('BYMONTHDAY must be 1 to 31, or -1');
    schedule.byMonthDay = d;
  }
  const byMonth = parts.get('BYMONTH');
  if (byMonth !== undefined) {
    if (freq !== 'YEARLY') throw new ScheduleError('BYMONTH goes with FREQ=YEARLY');
    const m = Number(byMonth);
    if (!/^\d+$/.test(byMonth) || m < 1 || m > 12) throw new ScheduleError('BYMONTH must be 1 to 12');
    schedule.byMonth = m;
  }
  return schedule;
}

export function formatSchedule(s: Schedule): string {
  const parts = [`FREQ=${s.freq}`];
  if (s.interval !== 1) parts.push(`INTERVAL=${s.interval}`);
  if (s.byDay?.length) parts.push(`BYDAY=${s.byDay.map((d) => DAYS[d]).join(',')}`);
  if (s.byMonthDay !== undefined) parts.push(`BYMONTHDAY=${s.byMonthDay}`);
  if (s.byMonth !== undefined) parts.push(`BYMONTH=${s.byMonth}`);
  return parts.join(';');
}

const weekday = (d: Date) => (d.getUTCDay() + 6) % 7;

function dayOf(year: number, monthIndex: number, byMonthDay: number): Date {
  const last = daysInMonth(year, monthIndex);
  const day = byMonthDay === -1 ? last : Math.min(byMonthDay, last);
  return new Date(Date.UTC(year, monthIndex, day));
}

/** The occurrences of period `k` (0 = the period holding the start), in order. */
function period(s: Schedule, start: Date, k: number): Date[] {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  switch (s.freq) {
    case 'DAILY':
      return [addDays(start, k * s.interval)];
    case 'WEEKLY': {
      const monday = addDays(start, -weekday(start) + 7 * k * s.interval);
      return (s.byDay ?? [weekday(start)]).map((d) => addDays(monday, d));
    }
    case 'MONTHLY': {
      const total = m + k * s.interval;
      return [dayOf(y + Math.floor(total / 12), total % 12, s.byMonthDay ?? start.getUTCDate())];
    }
    case 'YEARLY':
      return [dayOf(y + k * s.interval, (s.byMonth ?? m + 1) - 1, s.byMonthDay ?? start.getUTCDate())];
  }
}

/** Roughly how many periods lie between the start and `date`, never too many. */
function periodsBefore(s: Schedule, start: Date, date: Date): number {
  const days = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  if (days <= 0) return 0;
  const length = { DAILY: 1, WEEKLY: 7, MONTHLY: 31, YEARLY: 366 }[s.freq] * s.interval;
  return Math.max(0, Math.floor(days / length) - 1);
}

/** Every occurrence in [from, to], none before `start` or after `end`. */
export function occurrences(s: Schedule, start: Date, from: Date, to: Date, opts: { end?: Date | null; limit?: number } = {}): Date[] {
  const out: Date[] = [];
  const limit = opts.limit ?? 1000;
  const lower = from > start ? from : start;
  const upper = opts.end && opts.end < to ? opts.end : to;
  for (let k = periodsBefore(s, start, lower); out.length < limit; k++) {
    const dates = period(s, start, k);
    if (dates[0] > upper) break;
    for (const d of dates) if (d >= lower && d <= upper && out.length < limit) out.push(d);
  }
  return out;
}

/** The first occurrence on or after `date`, or null past `end` (or ten years on). */
export function nextOccurrence(s: Schedule, start: Date, date: Date, end?: Date | null): Date | null {
  const horizon = new Date(Date.UTC(date.getUTCFullYear() + 10, date.getUTCMonth(), date.getUTCDate()));
  return occurrences(s, start, date, end && end < horizon ? end : horizon, { limit: 1 })[0] ?? null;
}
