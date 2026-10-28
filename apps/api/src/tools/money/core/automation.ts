import { addDays, daysBetween, formatDate, parseDate, previousQuarterEnd } from './dates';

/**
 * What the daily money jobs do and when, in the scheduler's time zone. Pure:
 * the scheduler asks this each tick with what already ran today.
 *
 *  recurring  06:00  movements due today (drafts or posted)
 *  snapshot   06:30  the quarter-end snapshot, on the days after a quarter ends
 *  rates      17:15  ECB (published about 16:00 CET) and NBP table A (about 12:15)
 *  prices     18:30  end-of-day prices, after European markets close
 *
 * A task that has not run for more than a day runs at once (the server was down).
 */

export const MONEY_TASKS = ['recurring', 'snapshot', 'rates', 'prices'] as const;
export type MoneyTask = (typeof MONEY_TASKS)[number];

export const TASK_START_MINUTES: Record<MoneyTask, number> = {
  recurring: 6 * 60,
  snapshot: 6 * 60 + 30,
  rates: 17 * 60 + 15,
  prices: 18 * 60 + 30,
};

/** Days after a quarter end during which its missing snapshot is still taken. */
export const SNAPSHOT_GRACE_DAYS = 14;

export interface SchedulerState {
  /** local date, YYYY-MM-DD */
  today: string;
  /** minutes since local midnight */
  minutes: number;
  /** local date each task last started, if ever */
  lastRun: Partial<Record<MoneyTask, string>>;
  /** dates of the snapshots already taken */
  snapshots: readonly string[];
  /** the user has at least one asset with a price feed */
  hasPriceFeeds: boolean;
}

export interface DueTask {
  task: MoneyTask;
  payload: Record<string, string>;
}

export function dueTasks(s: SchedulerState): DueTask[] {
  const yesterday = formatDate(addDays(parseDate(s.today), -1));
  const due = (task: MoneyTask) => {
    const last = s.lastRun[task];
    if (last === s.today) return false;
    return s.minutes >= TASK_START_MINUTES[task] || !last || last < yesterday;
  };
  const out: DueTask[] = [];
  if (due('recurring')) out.push({ task: 'recurring', payload: { date: s.today } });
  const quarterEnd = previousQuarterEnd(parseDate(s.today));
  const qe = formatDate(quarterEnd);
  if (
    s.minutes >= TASK_START_MINUTES.snapshot &&
    s.lastRun.snapshot !== s.today &&
    !s.snapshots.includes(qe) &&
    daysBetween(quarterEnd, parseDate(s.today)) <= SNAPSHOT_GRACE_DAYS
  ) {
    out.push({ task: 'snapshot', payload: { date: qe, label: quarterLabel(qe) } });
  }
  if (due('rates')) out.push({ task: 'rates', payload: { date: s.today } });
  if (s.hasPriceFeeds && due('prices')) out.push({ task: 'prices', payload: {} });
  return out;
}

/** "2026-09-30" -> "Q3 2026" */
export function quarterLabel(date: string): string {
  return `Q${Math.ceil(Number(date.slice(5, 7)) / 3)} ${date.slice(0, 4)}`;
}
