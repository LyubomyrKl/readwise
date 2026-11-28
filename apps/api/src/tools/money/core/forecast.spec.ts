import {
  changePercent,
  habit,
  mean,
  median,
  monthsCovered,
  netWorthOutlook,
  pace,
  quantile,
  runningAt,
  runningTotals,
  usualCurve,
  worthChanges,
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

  it('takes the average of minor units, rounded once', () => {
    expect(mean([])).toBeNull();
    expect(mean([1n, 2n])).toBe(2n); // 1.5 rounds half away from zero
    expect(mean([3n, 5n, 10n])).toBe(6n);
    expect(mean([-1n, -2n])).toBe(-2n);
  });

  it('tells a category that comes now and then from one spent most months', () => {
    // travel in one month of five: usually nothing, 300 a month on average
    expect(habit([0n, 0n, 1500_00n, 0n, 0n])).toEqual({ average: 300_00n, monthsWith: 1, lumpy: true });
    // a tax in two months of six, a car in half of them: now and then too
    expect(habit([0n, 0n, 0n, 0n, 500_00n, 700_00n])).toMatchObject({ average: 200_00n, lumpy: true });
    expect(habit([0n, 100_00n, 0n, 100_00n, 0n, 100_00n])).toMatchObject({ lumpy: true });
    // a doctor's bill over small regular ones: spent every month, so its usual month stands and the
    // bill is unusual; the average, which counts the bill, is still there for totals
    expect(habit([170_00n, 170_00n, 2000_00n, 170_00n])).toEqual({ average: 627_50n, monthsWith: 4, lumpy: false });
    // groceries: about the same every month
    expect(habit([300_00n, 310_00n, 290_00n, 305_00n])).toEqual({ average: 301_25n, monthsWith: 4, lumpy: false });
    // under three months nothing is usual yet
    expect(habit([0n, 900_00n])).toEqual({ average: null, monthsWith: 1, lumpy: false });
    expect(habit([0n, 0n, 0n])).toEqual({ average: 0n, monthsWith: 0, lumpy: false });
  });

  it("splits each month's net worth change into saved, one-offs, accounts added and the rest", () => {
    const parts = (saved: bigint, oneOffs = 0n, added = 0n) => ({ saved, oneOffs, added });
    // from nothing: 3000 saved; then 2500 saved; 1500 saved and an account of 5000 added;
    // 2500 saved and a price up 200; 3000 saved and a car sold for 2000
    expect(worthChanges([0n, 3000n, 5500n, 12000n, 14700n, 19700n], [parts(3000n), parts(2500n), parts(1500n, 0n, 5000n), parts(2500n), parts(3000n, 2000n)])).toEqual([
      { change: 3000n, saved: 3000n, oneOffs: 0n, added: 0n, markets: 0n },
      { change: 2500n, saved: 2500n, oneOffs: 0n, added: 0n, markets: 0n },
      { change: 6500n, saved: 1500n, oneOffs: 0n, added: 5000n, markets: 0n },
      { change: 2700n, saved: 2500n, oneOffs: 0n, added: 0n, markets: 200n },
      { change: 5000n, saved: 3000n, oneOffs: 2000n, added: 0n, markets: 0n },
    ]);
    // a fall in markets bigger than what was saved
    expect(worthChanges([1000n, 500n], [parts(200n)])[0]).toMatchObject({ change: -500n, markets: -700n });
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

  it('projects a month with nothing recorded yet as a usual month', () => {
    const past = [2300_00n, 2300_00n, 2500_00n].map((total) => month(30, { 1: 2000_00n, 15: total - 2000_00n }));
    expect(pace([], 0, 30, past)).toMatchObject({ soFar: 0n, typicalByNow: 0n, projected: 2300_00n, typicalMonth: 2300_00n, method: 'history' });
    expect(pace([], 0, 30, [])).toMatchObject({ soFar: 0n, projected: 0n, method: 'pace' });
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

  it('projects net worth from the average month saved, the range widening by how much a month varies', () => {
    // saved 2000, 3000 and 4000: 3000 a month; quartiles 2500 and 3500, half the spread 500
    const o = netWorthOutlook({ now: 50_000_00n, savings: [2000_00n, 3000_00n, 4000_00n], ahead: 12 })!;
    expect(o.monthlySaving).toBe(3000_00n);
    expect(o.projection).toHaveLength(12);
    expect(o.projection[0]).toEqual({ value: 53_000_00n, low: 52_500_00n, high: 53_500_00n });
    expect(o.projection[11]).toEqual({ value: 86_000_00n, low: 80_000_00n, high: 92_000_00n });
    // under three months saved, no pace
    expect(netWorthOutlook({ now: 1n, savings: [1n, 2n], ahead: 12 })).toBeNull();
  });

  it('adds the rest of this month as projected, and investments at the expected return', () => {
    // 500 more to save this month; 100 000 invested at 5% a year: 416.67 after a month, 5000 after a year
    const o = netWorthOutlook({
      now: 50_000_00n,
      savings: [3000_00n, 3000_00n, 3000_00n],
      ahead: 12,
      restOfMonth: 500_00n,
      invested: 100_000_00n,
      returnBp: 500n,
    })!;
    expect(o.projection[0].value).toBe(50_000_00n + 500_00n + 3000_00n + 416_67n);
    expect(o.projection[11].value).toBe(50_000_00n + 500_00n + 36_000_00n + 5000_00n);
    // markets are not a pace: nothing invested or no return, no growth
    expect(netWorthOutlook({ now: 0n, savings: [1n, 1n, 1n], ahead: 1, invested: 100_000_00n })!.projection[0].value).toBe(1n);
  });

  it('keeps a one-off out of the pace: a car sold is in net worth today, never a month saved', () => {
    // the months saved exclude the sale by construction (it is not income); today's worth has it
    const o = netWorthOutlook({ now: 1300n + 1000n, savings: [100n, 100n, 100n, 100n, 100n], ahead: 2 })!;
    expect(o.monthlySaving).toBe(100n);
    expect(o.projection.map((p) => p.value)).toEqual([2400n, 2500n]);
  });

  it('counts the months of usual spending an amount covers', () => {
    expect(monthsCovered(18800_00n, 2300_00n)).toBe('8.2');
    expect(monthsCovered(1n, null)).toBeNull();
    expect(monthsCovered(1n, 0n)).toBeNull();
  });
});
