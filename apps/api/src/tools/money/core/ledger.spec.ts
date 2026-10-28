import { assertBalanced, netByCommodity, UnbalancedTransactionError, type LedgerLine } from './ledger';
import { parseQuantity } from './quantity';

const line = (subAccountId: string, commodityId: string, amountMinor: bigint): LedgerLine => ({
  subAccountId,
  commodityId,
  amountMinor,
});

describe('ledger', () => {
  it('accepts a same-currency transfer', () => {
    expect(() => assertBalanced([line('mbank-pln', 'PLN', -50000n), line('zen-pln', 'PLN', 50000n)])).not.toThrow();
  });

  it('accepts a cross-currency transfer with a fee through the conversion account', () => {
    // 1000.00 PLN out of mBank, 230.00 EUR into ZEN, 2.00 PLN fee
    expect(() =>
      assertBalanced([
        line('mbank-pln', 'PLN', -100200n),
        line('expense-pln', 'PLN', 200n),
        line('conversion-pln', 'PLN', 100000n),
        line('conversion-eur', 'EUR', -23000n),
        line('zen-eur', 'EUR', 23000n),
      ]),
    ).not.toThrow();
  });

  it('accepts a buy: cash out, units in, both sides balanced', () => {
    expect(() =>
      assertBalanced([
        line('ibkr-eur', 'EUR', -125000n),
        line('conversion-eur', 'EUR', 125000n),
        { subAccountId: 'conversion-vwce', commodityId: 'VWCE', quantity: -parseQuantity('10') },
        { subAccountId: 'ibkr-vwce', commodityId: 'VWCE', quantity: parseQuantity('10') },
      ]),
    ).not.toThrow();
  });

  it('rejects money created or destroyed, naming the currency', () => {
    try {
      assertBalanced([line('a', 'PLN', -100n), line('b', 'PLN', 99n), line('c', 'EUR', 1n)]);
      fail('expected an error');
    } catch (error) {
      expect(error).toBeInstanceOf(UnbalancedTransactionError);
      expect((error as UnbalancedTransactionError).imbalances).toEqual(
        new Map([
          ['PLN', -1n],
          ['EUR', 1n],
        ]),
      );
    }
  });

  it('rejects a cross-currency transfer that skips the conversion account', () => {
    expect(() => assertBalanced([line('mbank-pln', 'PLN', -100000n), line('zen-eur', 'EUR', 23000n)])).toThrow(
      UnbalancedTransactionError,
    );
  });

  it('rejects malformed entries', () => {
    expect(() => assertBalanced([line('a', 'PLN', 0n), line('b', 'PLN', 0n)])).toThrow(/is zero/);
    expect(() => assertBalanced([line('a', 'PLN', 1n)])).toThrow(/at least two/);
    expect(() =>
      assertBalanced([
        { subAccountId: 'a', commodityId: 'PLN', amountMinor: 1n, quantity: 1n },
        line('b', 'PLN', -1n),
      ]),
    ).toThrow(/exactly one/);
    expect(() => assertBalanced([{ subAccountId: 'a', commodityId: 'PLN' }, line('b', 'PLN', -1n)])).toThrow(
      /exactly one/,
    );
  });

  it('nets by commodity', () => {
    expect(netByCommodity([line('a', 'PLN', 5n), line('b', 'PLN', 7n), line('c', 'USD', -2n)])).toEqual(
      new Map([
        ['PLN', 12n],
        ['USD', -2n],
      ]),
    );
  });
});
