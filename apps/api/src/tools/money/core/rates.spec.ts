import { RateBook, type RateRow } from './rates';

const ecb = (date: string, to: string, rate: string): RateRow => ({ date, from: 'EUR', to, rate, source: 'ecb' });
const nbp = (date: string, from: string, rate: string): RateRow => ({ date, from, to: 'PLN', rate, source: 'nbp' });

describe('rate book', () => {
  const book = new RateBook([
    ecb('2026-10-26', 'PLN', '4.2500'),
    ecb('2026-10-27', 'PLN', '4.3000'),
    ecb('2026-10-27', 'USD', '1.0800'),
    nbp('2026-10-27', 'UAH', '0.0950'),
    nbp('2026-10-27', 'USD', '3.9800'),
    { date: '2026-10-20', from: 'CHF', to: 'PLN', rate: '4.5000', source: 'manual' },
  ]);

  it('takes the latest rate on or before the day', () => {
    // 100.00 EUR in PLN on the 26th and on the 28th (a day without a table)
    expect(book.convert(10_000n, 'EUR', 2, 'PLN', 2, '2026-10-26')).toBe(42_500n);
    expect(book.convert(10_000n, 'EUR', 2, 'PLN', 2, '2026-10-28')).toBe(43_000n);
    expect(book.rate('EUR', 'PLN', '2026-10-28')?.date).toBe('2026-10-27');
    expect(book.convert(10_000n, 'EUR', 2, 'PLN', 2, '2026-10-25')).toBeNull();
  });

  it('inverts and crosses through EUR within the ECB table', () => {
    // 430.00 PLN = 100.00 EUR
    expect(book.convert(43_000n, 'PLN', 2, 'EUR', 2, '2026-10-27')).toBe(10_000n);
    // 100.00 USD in PLN via EUR: 100 / 1.08 * 4.30 = 398.148... -> 398.15
    expect(book.convert(10_000n, 'USD', 2, 'PLN', 2, '2026-10-27')).toBe(39_815n);
    expect(book.rate('USD', 'PLN', '2026-10-27')?.sources).toEqual(['ecb']);
  });

  it('crosses two sources when one alone cannot', () => {
    // UAH only in NBP: 1000 UAH -> PLN (NBP) -> EUR (ECB): 1000 * 0.095 / 4.30 = 22.093... -> 22.09 EUR
    expect(book.convert(100_000n, 'UAH', 2, 'EUR', 2, '2026-10-27')).toBe(2_209n);
    expect(book.rate('UAH', 'EUR', '2026-10-27')?.sources).toEqual(['nbp', 'ecb']);
  });

  it('prefers a rate entered by hand', () => {
    expect(book.convert(10_000n, 'CHF', 2, 'PLN', 2, '2026-10-27')).toBe(45_000n);
    expect(book.rate('CHF', 'PLN', '2026-10-27')?.sources).toEqual(['manual']);
  });

  it('converts between currencies with different minor units', () => {
    const jpy = new RateBook([ecb('2026-10-27', 'JPY', '162.00')]);
    // 100.00 EUR = 16200 JPY
    expect(jpy.convert(10_000n, 'EUR', 2, 'JPY', 0, '2026-10-27')).toBe(16_200n);
    expect(jpy.convert(16_200n, 'JPY', 0, 'EUR', 2, '2026-10-27')).toBe(10_000n);
  });

  it('knows when there is no way', () => {
    expect(book.convert(100n, 'XYZ', 2, 'PLN', 2, '2026-10-27')).toBeNull();
    expect(book.convert(100n, 'PLN', 2, 'PLN', 2, '2026-10-27')).toBe(100n);
  });
});
