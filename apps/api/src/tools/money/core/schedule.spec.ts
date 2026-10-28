import { formatDate, parseDate } from './dates';
import { formatSchedule, nextOccurrence, occurrences, parseSchedule, ScheduleError } from './schedule';

const d = parseDate;
const list = (dates: Date[]) => dates.map(formatDate);

describe('recurring schedules', () => {
  it('reads and writes the supported rules', () => {
    expect(parseSchedule('FREQ=MONTHLY;BYMONTHDAY=10')).toEqual({ freq: 'MONTHLY', interval: 1, byMonthDay: 10 });
    expect(parseSchedule('rrule:freq=weekly;byday=th,mo;interval=2')).toEqual({ freq: 'WEEKLY', interval: 2, byDay: [0, 3] });
    expect(formatSchedule(parseSchedule('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=-1'))).toBe('FREQ=YEARLY;BYMONTHDAY=-1;BYMONTH=3');
    for (const bad of ['', 'FREQ=HOURLY', 'FREQ=MONTHLY;BYDAY=MO', 'FREQ=MONTHLY;BYMONTHDAY=32', 'FREQ=DAILY;COUNT=3', 'FREQ=DAILY;INTERVAL=0']) {
      expect(() => parseSchedule(bad)).toThrow(ScheduleError);
    }
  });

  it('pays the rent on the 10th, and on the last day when the month is short', () => {
    const rent = parseSchedule('FREQ=MONTHLY;BYMONTHDAY=10');
    expect(list(occurrences(rent, d('2026-01-15'), d('2026-01-01'), d('2026-04-30')))).toEqual(['2026-02-10', '2026-03-10', '2026-04-10']);
    const lastDay = parseSchedule('FREQ=MONTHLY;BYMONTHDAY=31');
    expect(list(occurrences(lastDay, d('2026-01-31'), d('2026-01-01'), d('2026-04-30')))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('defaults to the start date and respects the interval and the end', () => {
    const quarterly = parseSchedule('FREQ=MONTHLY;INTERVAL=3');
    expect(list(occurrences(quarterly, d('2026-01-05'), d('2026-01-01'), d('2026-12-31')))).toEqual(['2026-01-05', '2026-04-05', '2026-07-05', '2026-10-05']);
    expect(list(occurrences(quarterly, d('2026-01-05'), d('2026-01-01'), d('2026-12-31'), { end: d('2026-06-30') }))).toEqual(['2026-01-05', '2026-04-05']);
    const weekly = parseSchedule('FREQ=WEEKLY;BYDAY=MO,TH');
    // 2026-10-28 is a Wednesday
    expect(list(occurrences(weekly, d('2026-10-28'), d('2026-10-01'), d('2026-11-09')))).toEqual(['2026-10-29', '2026-11-02', '2026-11-05', '2026-11-09']);
    const yearly = parseSchedule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29');
    expect(list(occurrences(yearly, d('2026-01-01'), d('2026-01-01'), d('2029-12-31')))).toEqual(['2026-02-28', '2027-02-28', '2028-02-29', '2029-02-28']);
  });

  it('finds the next run on or after a day', () => {
    const rent = parseSchedule('FREQ=MONTHLY;BYMONTHDAY=10');
    expect(formatDate(nextOccurrence(rent, d('2020-01-10'), d('2026-10-10'))!)).toBe('2026-10-10');
    expect(formatDate(nextOccurrence(rent, d('2020-01-10'), d('2026-10-11'))!)).toBe('2026-11-10');
    expect(nextOccurrence(rent, d('2020-01-10'), d('2026-10-11'), d('2026-10-31'))).toBeNull();
    const daily = parseSchedule('FREQ=DAILY;INTERVAL=2');
    expect(formatDate(nextOccurrence(daily, d('2026-10-01'), d('2026-10-28'))!)).toBe('2026-10-29');
  });
});
