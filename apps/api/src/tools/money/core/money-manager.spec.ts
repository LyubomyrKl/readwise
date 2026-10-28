import { parseCsv } from './csv';
import { DEFAULT_TYPE_VALUES, distinctValues, mapMoneyManagerRows, type MoneyManagerMapping } from './money-manager';

const CSV = `Date;Account;Category;Subcategory;Note;Amount;Currency;Type
01.10.2026;mBank;Salary;;October;12 345,67;PLN;Income
02.10.2026;mBank;Food;Coffee;;-12,50;PLN;Expense
02.10.2026;mBank;Food;Coffee;;-12,50;PLN;Expense
03.10.2026;mBank;;;To ZEN;-1000,00;PLN;Transfer-Out
03.10.2026;ZEN;;;To ZEN;230,45;EUR;Transfer-In
04.10.2026;mBank;;;Savings;-500,00;PLN;Transfer-Out
04.10.2026;Savings;;;Savings;500,00;PLN;Transfer-In
05.10.2026;mBank;;;Lonely half;-10,00;PLN;Transfer-Out
06.10.2026;Revolut;Food;;;-5,00;PLN;Expense
07.10.2026;mBank;Food;;;0,00;PLN;Expense
31.02.2026;mBank;Food;;;-1,00;PLN;Expense
`;

const mapping: MoneyManagerMapping = {
  headerRow: 0,
  columns: { date: 0, account: 1, category: 2, subcategory: 3, note: [4], amount: 5, currency: 6, type: 7 },
  dateFormat: 'auto',
  decimalSeparator: 'auto',
  defaultCurrency: 'PLN',
  amountSign: 'type',
  typeValues: DEFAULT_TYPE_VALUES,
  accounts: { mBank: 'acc-mbank', ZEN: 'acc-zen', Savings: 'acc-savings' },
};

describe('money-manager mapping', () => {
  const rows = parseCsv(CSV);
  const mapped = mapMoneyManagerRows(rows, mapping);
  const byRow = (n: number) => mapped.find((r) => r.rowNumber === n)!;

  it('lists the account names to map', () => {
    expect(distinctValues(rows, 0, [1])).toEqual(['mBank', 'Revolut', 'Savings', 'ZEN']);
  });

  it('turns income and expenses into movements with their categories', () => {
    expect(byRow(2)).toMatchObject({
      status: 'ready',
      proposal: {
        kind: 'income',
        input: { date: '2026-10-01', accountId: 'acc-mbank', currency: 'PLN', amount: '12345.67', note: 'October' },
        category: { name: 'Salary', kind: 'income' },
      },
    });
    expect(byRow(3).proposal).toEqual({
      kind: 'expense',
      input: { date: '2026-10-02', accountId: 'acc-mbank', currency: 'PLN', amount: '12.50' },
      category: { name: 'Coffee', parent: 'Food', kind: 'expense' },
    });
  });

  it('keeps identical rows as two movements with distinct fingerprints', () => {
    expect(byRow(4).status).toBe('ready');
    expect(byRow(3).dedupeHash).toBeTruthy();
    expect(byRow(4).dedupeHash).not.toBe(byRow(3).dedupeHash);
    // the same file mapped again gives the same fingerprints: a re-import is recognised
    expect(mapMoneyManagerRows(rows, mapping).map((r) => r.dedupeHash)).toEqual(mapped.map((r) => r.dedupeHash));
  });

  it('pairs the two halves of each transfer, across currencies too', () => {
    expect(byRow(5)).toMatchObject({
      status: 'ready',
      proposal: {
        kind: 'transfer',
        input: {
          date: '2026-10-03',
          fromAccountId: 'acc-mbank',
          fromCurrency: 'PLN',
          amountOut: '1000.00',
          toAccountId: 'acc-zen',
          toCurrency: 'EUR',
          amountIn: '230.45',
          note: 'To ZEN',
        },
      },
    });
    expect(byRow(6)).toMatchObject({ status: 'skipped', message: 'the receiving half of the transfer on row 5' });
    expect(byRow(7).proposal?.input).toMatchObject({ fromAccountId: 'acc-mbank', toAccountId: 'acc-savings', amountOut: '500.00' });
    expect(byRow(7).proposal?.input.amountIn).toBeUndefined();
    expect(byRow(8)).toMatchObject({ status: 'skipped' });
    expect(byRow(9)).toMatchObject({ status: 'error', message: expect.stringContaining('no matching receiving half') });
  });

  it('reports what cannot be imported', () => {
    expect(byRow(10)).toMatchObject({ status: 'error', message: 'map the account "Revolut"' });
    expect(byRow(11)).toMatchObject({ status: 'skipped', message: 'zero amount' });
    expect(byRow(12)).toMatchObject({ status: 'error' });
  });

  it('reads a signed export without a type column, and one-row transfers with a target account', () => {
    const csv = `date,account,to account,amount,amount 2,currency 2,note
2026-10-01,mBank,,-20.00,,,Lunch
2026-10-01,mBank,,100.00,,,Refund
2026-10-02,mBank,ZEN,-400.00,92.00,EUR,FX
2026-10-03,mBank,Savings,-100.00,99.00,PLN,With fee`;
    const out = mapMoneyManagerRows(parseCsv(csv), {
      ...mapping,
      columns: { date: 0, account: 1, toAccount: 2, amount: 3, toAmount: 4, toCurrency: 5, note: [6], type: undefined },
      amountSign: 'signed',
    });
    expect(out.map((r) => [r.status, r.proposal?.kind])).toEqual([
      ['ready', 'expense'],
      ['ready', 'income'],
      ['ready', 'transfer'],
      ['ready', 'transfer'],
    ]);
    expect(out[0].proposal?.input).toMatchObject({ currency: 'PLN', amount: '20.00', note: 'Lunch' });
    expect(out[2].proposal?.input).toMatchObject({ amountOut: '400.00', toCurrency: 'EUR', amountIn: '92.00' });
    expect(out[3].proposal?.input).toMatchObject({ amountOut: '100.00', toCurrency: 'PLN', fee: '1.00' });
  });
});
