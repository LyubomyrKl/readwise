import { netByCommodity } from './ledger';
import {
  buyLines,
  expenseLines,
  incomeLines,
  investmentIncomeLines,
  openingBalanceLines,
  PostingError,
  refKey,
  reversalLines,
  sellLines,
  splitLines,
  transferLines,
  unitMoveLines,
  type PostingLine,
} from './postings';
import { parseQuantity } from './quantity';

const net = (lines: PostingLine[]) =>
  netByCommodity(lines.map((l) => ({ ...l, subAccountId: refKey(l.account) })));

const summary = (lines: PostingLine[]) =>
  lines.map((l) => `${refKey(l.account)} ${l.commodityId} ${l.amountMinor ?? l.quantity}`);

describe('postings', () => {
  it('posts income and expenses against the system accounts with their category', () => {
    expect(summary(incomeLines({ accountId: 'mbank', currency: 'PLN', amount: 1000000n, categoryId: 'salary' }))).toEqual([
      'mbank PLN 1000000',
      'system:income PLN -1000000',
    ]);
    const expense = expenseLines({ accountId: 'mbank', currency: 'PLN', amount: 250000n, categoryId: 'rent' });
    expect(summary(expense)).toEqual(['mbank PLN -250000', 'system:expense PLN 250000']);
    expect(expense[1].categoryId).toBe('rent');
    expect(() => expenseLines({ accountId: 'a', currency: 'PLN', amount: 0n })).toThrow(PostingError);
  });

  it('opens a debt with a negative balance', () => {
    expect(summary(openingBalanceLines({ accountId: 'loan', currency: 'USD', amount: -500000n }))).toEqual([
      'loan USD -500000',
      'system:opening_balance USD 500000',
    ]);
  });

  describe('transfers', () => {
    it('moves one amount within a currency, less the fee', () => {
      const plan = transferLines({
        from: { accountId: 'mbank', currency: 'PLN', amount: 100500n },
        to: { accountId: 'ibkr', currency: 'PLN' },
        fee: 500n,
        feeCategoryId: 'fees',
      });
      expect(plan.received).toBe(100000n);
      expect(summary(plan.lines)).toEqual(['mbank PLN -100500', 'system:expense PLN 500', 'ibkr PLN 100000']);
      expect(net(plan.lines)).toEqual(new Map([['PLN', 0n]]));
    });

    it('passes a cross-currency transfer through the conversion account, one leg per currency', () => {
      // 1000.00 PLN out of mBank incl. 2.00 PLN fee, 230.00 EUR into ZEN
      const plan = transferLines({
        from: { accountId: 'mbank', currency: 'PLN', amount: 100000n },
        to: { accountId: 'zen', currency: 'EUR', amount: 23000n },
        fee: 200n,
      });
      expect(plan.crossCurrency).toBe(true);
      expect(plan.converted).toBe(99800n);
      expect(summary(plan.lines)).toEqual([
        'mbank PLN -100000',
        'system:expense PLN 200',
        'system:conversion PLN 99800',
        'system:conversion EUR -23000',
        'zen EUR 23000',
      ]);
      expect(net(plan.lines)).toEqual(
        new Map([
          ['PLN', 0n],
          ['EUR', 0n],
        ]),
      );
    });

    it('allows an exchange between two currencies of one account', () => {
      const plan = transferLines({
        from: { accountId: 'zen', currency: 'PLN', amount: 43000n },
        to: { accountId: 'zen', currency: 'EUR', amount: 10000n },
      });
      expect(plan.lines).toHaveLength(4);
    });

    it('refuses what would create or lose money', () => {
      expect(() =>
        transferLines({
          from: { accountId: 'a', currency: 'PLN', amount: 1000n },
          to: { accountId: 'b', currency: 'PLN', amount: 999n },
        }),
      ).toThrow(/record the difference as the fee/);
      expect(() =>
        transferLines({ from: { accountId: 'a', currency: 'PLN', amount: 1000n }, to: { accountId: 'b', currency: 'EUR' } }),
      ).toThrow(/needs the amount received/);
      expect(() =>
        transferLines({ from: { accountId: 'a', currency: 'PLN', amount: 1000n }, to: { accountId: 'a', currency: 'PLN' } }),
      ).toThrow(/two different/);
      expect(() =>
        transferLines({ from: { accountId: 'a', currency: 'PLN', amount: 1000n }, to: { accountId: 'b', currency: 'PLN' }, fee: 1000n }),
      ).toThrow(/less than the amount sent/);
    });
  });

  describe('investments', () => {
    it('buys at cost: cash out, units in, both sides balanced', () => {
      const lines = buyLines({
        accountId: 'ibkr',
        assetId: 'VWCE',
        units: parseQuantity('10'),
        paidFrom: { accountId: 'ibkr', currency: 'EUR' },
        total: 125035n,
      });
      expect(summary(lines)).toEqual([
        'ibkr EUR -125035',
        'system:conversion EUR 125035',
        'system:conversion VWCE -100000000000',
        'ibkr VWCE 100000000000',
      ]);
    });

    it('sells into another account', () => {
      const lines = sellLines({
        accountId: 'ibkr',
        assetId: 'VWCE',
        units: parseQuantity('2.5'),
        proceedsTo: { accountId: 'ibkr', currency: 'EUR' },
        proceeds: 31000n,
      });
      expect(net(lines)).toEqual(
        new Map([
          ['VWCE', 0n],
          ['EUR', 0n],
        ]),
      );
    });

    it('books a dividend gross, with the tax withheld as an expense', () => {
      const lines = investmentIncomeLines({
        accountId: 'ibkr',
        currency: 'USD',
        net: 8500n,
        withholding: 1500n,
        incomeCategoryId: 'dividends',
        taxCategoryId: 'taxes',
      });
      expect(summary(lines)).toEqual(['ibkr USD 8500', 'system:expense USD 1500', 'system:income USD -10000']);
      expect(lines.map((l) => l.categoryId ?? null)).toEqual([null, 'taxes', 'dividends']);
    });

    it('moves units and splits', () => {
      expect(summary(unitMoveLines({ fromAccountId: 'a', toAccountId: 'b', assetId: 'X', units: 5n }))).toEqual([
        'a X -5',
        'b X 5',
      ]);
      const split = splitLines('X', [
        { accountId: 'a', delta: 20n },
        { accountId: 'b', delta: 0n },
      ]);
      expect(summary(split)).toEqual(['a X 20', 'system:conversion X -20']);
      expect(() => splitLines('X', [{ accountId: 'a', delta: 0n }])).toThrow(/changes no holding/);
    });
  });

  it('reverses lines exactly', () => {
    const lines = incomeLines({ accountId: 'mbank', currency: 'PLN', amount: 100n, categoryId: 'c' });
    const reversed = reversalLines(lines);
    expect(summary(reversed)).toEqual(['mbank PLN -100', 'system:income PLN 100']);
    expect(reversed[1].categoryId).toBe('c');
  });
});
