import {
  changePercent,
  median,
  monthsCovered,
  netWorthOutlook,
  pace,
  quantile,
  runningAt,
  runningTotals,
  usualCurve,
  yearProjection,
} from './forecast';

/** A month of `days` days with amounts on some days: { 1: 2000_00n, 15: 100_00n }. */
const month = (days: number, on: Record<number, bigint>): bigint[] =>
  runningTotals(Array.from({ length: days }, (_, i) => on[i + 1] ?? 0n));

describe('forecast', () => {
  it('takes medians and quartiles of minor units, linear between ranks', () => {
    expect(median([])).toBeNull();
    expect(median([5n])).toBe(5n);
    expect(median([3n, 1n, 2n])).toBe(2n);
    expect(median([1n, 2n, 3n, 4n])).toBe(3n); // 2.5 rounds half away from zero
    expect(quantile([10n, 20n, 30n, 40n, 50n], 1n, 4n)).toBe(20n);
    expect(quantile([10n, 20n, 30n, 40n], 3n, 4n)).toBe(33n); // 32.5
    expect(quantile([-4n, -1n], 1n, 2n)).toBe(-3n); // -2.5 away from zero
  });

  it('reads a running total at a day, a shorter month standing at its end', () => {
    const feb = month(28, { 1: 100n, 28: 50n });
    expect(runningAt(feb, 1)).toBe(100n);
    expect(runningAt(feb, 27)).toBe(100n);
    expect(runningAt(feb, 31)).toBe(150n);
    expect(runningAt([], 5)).toBe(0n);
  });

  it('projects so far plus what usually follows, so rent on the 1st does not inflate the month', () => {
    // rent 2000 on the 1st, groceries 100 on the 5th, 15th and 25th: 2300 a month
    const past = [30, 31, 30, 31].map((days) => month(days, { 1: 2000_00n, 5: 100_00n, 15: 100_00n, 25: 100_00n }));
    const now = month(30, { 1: 2000_00n }); // the 2nd: only the rent so far
    expect(pace(now, 2, 30, past)).toEqual({
      soFar: 2000_00n,
      typicalByNow: 2000_00n,
      projected: 2300_00n,
      low: 2300_00n,
      high: 2300_00n,
      typicalMonth: 2300_00n,
      method: 'history',
    });
    // a straight line from the 2nd would have said 30 000
  });

  it('gives the range of what followed in the months before', () => {
    const past = [100_00n, 200_00n, 300_00n, 400_00n].map((late) => month(30, { 1: 1000_00n, 20: late }));
    const p = pace(month(30, { 1: 1000_00n, 3: 50_00n }), 10, 30, past);
    expect([p.soFar, p.projected, p.low, p.high]).toEqual([1050_00n, 1300_00n, 1225_00n, 1375_00n]);
  });

  it('draws a straight line while there are fewer than three months before', () => {
    const p = pace(month(30, { 1: 300_00n }), 10, 30, [month(31, { 1: 999_00n })]);
    expect(p).toMatchObject({ method: 'pace', projected: 900_00n, typicalByNow: null, typicalMonth: null });
    expect(pace(month(30, { 30: 10n }), 30, 30, []).projected).toBe(10n);
  });

  it('draws the usual month day by day, with its quartiles', () => {
    const past = [10n, 20n, 30n].map((v) => month(3, { 2: v }));
    expect(usualCurve(past, 3)).toEqual([
      { typical: 0n, low: 0n, high: 0n },
      { typical: 20n, low: 15n, high: 25n },
      { typical: 20n, low: 15n, high: 25n },
    ]);
    expect(usualCurve(past.slice(0, 2), 3)).toEqual([]);
  });

  it('says how far above or below the usual, one decimal', () => {
    expect(changePercent(500_00n, 300_00n)).toBe('66.7');
    expect(changePercent(200_00n, 300_00n)).toBe('-33.3');
    expect(changePercent(5n, 0n)).toBeNull();
    expect(changePercent(5n, null)).toBeNull();
  });

  it('projects the year: so far, the rest of the month, a usual month for each month left', () => {
    expect(
      yearProjection({ income: 30000_00n, expenses: 13900_00n }, { income: 0n, expenses: 100_00n }, 6, { income: 5000_00n, expenses: 2300_00n }),
    ).toEqual({ income: 60000_00n, expenses: 27800_00n });
    expect(yearProjection({ income: 1n, expenses: 2n }, { income: 0n, expenses: 0n }, 3, null)).toEqual({ income: 1n, expenses: 2n });
  });

  it("projects net worth at the last year's average monthly change, the range widening each month", () => {
    const ends = [0n, 100n, 200n, 300n, 400n, 500n, 600n, 700n, 800n, 900n, 1000n, 1100n, 1200n, 1300n, 1400n];
    const steady = netWorthOutlook(ends, 2)!;
    expect(steady.monthlyChange).toBe(100n); // the last 12 changes
    expect(steady.projection).toEqual([
      { value: 1500n, low: 1500n, high: 1500n },
      { value: 1600n, low: 1600n, high: 1600n },
    ]);

    const bumpy = netWorthOutlook([1000n, 1100n, 1000n, 1300n, 1200n], 2)!;
    // changes +100, -100, +300, -100: average +50, quartiles -100 and +150, half the spread 125
    expect(bumpy.monthlyChange).toBe(50n);
    expect(bumpy.projection[1]).toEqual({ value: 1300n, low: 1050n, high: 1550n });
    expect(netWorthOutlook([1n, 2n, 3n], 12)).toBeNull();
  });

  it('counts the months of usual spending an amount covers', () => {
    expect(monthsCovered(18800_00n, 2300_00n)).toBe('8.2');
    expect(monthsCovered(1n, null)).toBeNull();
    expect(monthsCovered(1n, 0n)).toBeNull();
  });
});
