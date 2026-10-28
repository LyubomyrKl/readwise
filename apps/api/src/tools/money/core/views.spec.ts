import { allocationRows, monthTotals, percentOf, splitByShares, type FlowEntry } from './views';

let n = 0;
const tx = (kind: string, entries: Omit<FlowEntry, 'transactionId' | 'kind'>[]): FlowEntry[] => {
  const id = `t${++n}`;
  return entries.map((e) => ({ transactionId: id, kind, ...e }));
};
const own = (accountType: FlowEntry['accountType'], base: bigint | null): Omit<FlowEntry, 'transactionId' | 'kind'> => ({
  accountType,
  systemRole: null,
  base,
  categoryId: null,
});
const sys = (systemRole: FlowEntry['systemRole'], base: bigint, categoryId: string | null = null) => ({
  accountType: 'system' as const,
  systemRole,
  base,
  categoryId,
});

describe('monthly flow', () => {
  // October, by hand: salary 10 000.00; rent 3 200.00, groceries 1 234.56, a transfer fee 2.00;
  // 1 000.00 sent to the broker (incl. that fee), a buy paid from the bank 500.00, 300.00 sold back to the bank;
  // a dividend of 8.50 net (1.50 tax) inside the broker; an opening balance that is not a flow
  const entries = [
    ...tx('income', [own('bank', 1_000_000n), sys('income', -1_000_000n, 'salary')]),
    ...tx('expense', [own('bank', -320_000n), sys('expense', 320_000n, 'rent')]),
    ...tx('expense', [own('bank', -123_456n), sys('expense', 123_456n, 'food')]),
    ...tx('transfer', [own('bank', -100_000n), sys('expense', 200n, 'fees'), own('investment', 99_800n)]),
    ...tx('buy', [own('bank', -50_000n), sys('conversion', 50_000n), own('bonds', null), sys('conversion', 0n)]),
    ...tx('sell', [own('investment', null), sys('conversion', -30_000n), own('bank', 30_000n)]),
    ...tx('investment_income', [own('investment', 850n), sys('expense', 150n, 'taxes'), sys('income', -1_000n, 'dividends')]),
    ...tx('opening_balance', [own('bank', 500_000n), sys('opening_balance', -500_000n)]),
  ];
  const m = monthTotals(entries);

  it('adds income and expenses from the system accounts', () => {
    expect(m.income).toBe(1_001_000n); // salary + gross dividend
    expect(m.expenses).toBe(443_806n); // rent + food + fee + tax withheld
  });

  it('counts money moved to investments at cost, never as an expense', () => {
    // 998.00 to the broker + 500.00 of bonds - 300.00 taken back
    expect(m.invested).toBe(119_800n);
  });

  it('works out the savings rate', () => {
    // (10 010.00 - 4 438.06) / 10 010.00 = 55.66% -> 55.7
    expect(m.savings).toBe(557_194n);
    expect(m.savingsRate).toBe('55.7');
    expect(monthTotals([]).savingsRate).toBeNull();
  });

  it('splits by category', () => {
    expect(m.expensesByCategory.get('rent')).toBe(320_000n);
    expect(m.expensesByCategory.get('fees')).toBe(200n);
    expect(m.incomeByCategory.get('dividends')).toBe(1_000n);
  });
});

describe('allocation', () => {
  it('compares each class with its target', () => {
    const { total, rows } = allocationRows(
      new Map<string | null, bigint>([
        ['core', 7_500_000n],
        ['sat', 1_500_000n],
        ['ef', 1_000_000n],
      ]),
      ['core', 'sat', 'ef'],
      new Map([
        ['core', '70'],
        ['sat', '10'],
        ['ef', '20'],
      ]),
    );
    expect(total).toBe(10_000_000n);
    expect(rows.map((r) => [r.classId, r.percent, r.drift, r.driftAmount])).toEqual([
      ['core', '75.0', '5.0', 500_000n],
      ['sat', '15.0', '5.0', 500_000n],
      ['ef', '10.0', '-10.0', -1_000_000n],
    ]);
  });

  it('keeps what no class claims apart', () => {
    const { rows } = allocationRows(new Map<string | null, bigint>([['core', 900n], [null, 100n]]), ['core'], new Map([['core', '100']]));
    expect(rows.map((r) => [r.classId, r.percent, r.drift])).toEqual([
      ['core', '90.0', '-10.0'],
      [null, '10.0', null],
    ]);
  });

  it('splits a holding across classes exactly', () => {
    const parts = splitByShares(1_001n, [
      { classId: 'a', percent: '33.3333' },
      { classId: 'b', percent: '33.3333' },
      { classId: 'c', percent: '33.3334' },
    ]);
    expect([...parts.values()].reduce((s, v) => s + v, 0n)).toBe(1_001n);
    expect(splitByShares(1_000n, [{ classId: 'a', percent: '60' }])).toEqual(
      new Map<string | null, bigint>([
        ['a', 600n],
        [null, 400n],
      ]),
    );
    expect(percentOf(1n, 3n)).toBe('33.3');
  });
});
