import {
  addMonths,
  addYears,
  DateFormatError,
  daysBetween,
  endOfMonth,
  formatDate,
  minutesIntoDay,
  monthsBetween,
  parseDate,
  previousQuarterEnd,
  todayIn,
} from './dates';

const d = parseDate;

describe('dates', () => {
  it('parses calendar dates strictly, as UTC midnight', () => {
    expect(d('2026-10-28').toISOString()).toBe('2026-10-28T00:00:00.000Z');
    expect(() => d('2026-02-30')).toThrow(DateFormatError);
    expect(() => d('28.10.2026')).toThrow(DateFormatError);
  });

  it('adds months and years, clamping to the month end', () => {
    expect(formatDate(addMonths(d('2026-01-31'), 1))).toBe('2026-02-28');
    expect(formatDate(addMonths(d('2028-01-31'), 1))).toBe('2028-02-29');
    expect(formatDate(addMonths(d('2026-11-15'), 3))).toBe('2027-02-15');
    expect(formatDate(addMonths(d('2026-03-15'), -4))).toBe('2025-11-15');
    expect(formatDate(addYears(d('2028-02-29'), 1))).toBe('2029-02-28');
    expect(formatDate(endOfMonth(d('2026-02-10')))).toBe('2026-02-28');
  });

  it('counts days and months', () => {
    expect(daysBetween(d('2026-01-01'), d('2027-01-01'))).toBe(365);
    expect(monthsBetween(d('2026-11-20'), d('2027-02-01')).map(formatDate)).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
    ]);
  });

  it('finds the previous quarter end', () => {
    expect(formatDate(previousQuarterEnd(d('2026-01-01')))).toBe('2025-12-31');
    expect(formatDate(previousQuarterEnd(d('2026-06-30')))).toBe('2026-03-31');
    expect(formatDate(previousQuarterEnd(d('2026-10-28')))).toBe('2026-09-30');
  });

  it('reads the calendar date and time of day in a time zone', () => {
    const lateEvening = new Date('2026-10-28T23:30:00Z'); // 00:30 on the 29th in Warsaw (CET)
    expect(formatDate(todayIn('Europe/Warsaw', lateEvening))).toBe('2026-10-29');
    expect(formatDate(todayIn('UTC', lateEvening))).toBe('2026-10-28');
    expect(minutesIntoDay('Europe/Warsaw', lateEvening)).toBe(30);
  });
});
