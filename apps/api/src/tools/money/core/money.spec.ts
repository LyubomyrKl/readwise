import { DecimalFormatError, divRound } from './decimal';
import { allocate, amountInput, convertMinor, formatMinor, impliedRate, parseMinor, sumMinor } from './money';
import { formatQuantity, parseQuantity, proRataMinor, quantityFromDb, quantityToDb } from './quantity';

describe('money helpers', () => {
  describe('parseMinor / formatMinor', () => {
    it.each([
      ['12.34', 2, 1234n],
      ['-12.34', 2, -1234n],
      ['12,3', 2, 1230n],
      ['12', 2, 1200n],
      ['0.10', 2, 10n],
      ['1500', 0, 1500n],
      ['1.234', 3, 1234n],
      ['12.3400', 2, 1234n],
      ['+5', 2, 500n],
    ])('parses %s with %i decimals to %s', (input, decimals, expected) => {
      expect(parseMinor(input, decimals)).toBe(expected);
    });

    it('refuses precision the currency does not have instead of rounding it away', () => {
      expect(() => parseMinor('12.345', 2)).toThrow(DecimalFormatError);
      expect(() => parseMinor('1.5', 0)).toThrow(DecimalFormatError);
    });

    it.each(['', 'abc', '1e3', '1 000', '1,000.00', '--1', '.5', '0x10'])('refuses %p', (input) => {
      expect(() => parseMinor(input, 2)).toThrow(DecimalFormatError);
    });

    it.each([
      [1234n, 2, '12.34'],
      [-5n, 2, '-0.05'],
      [0n, 2, '0.00'],
      [1500n, 0, '1500'],
      [1n, 3, '0.001'],
    ])('formats %s with %i decimals as %s', (minor, decimals, expected) => {
      expect(formatMinor(minor, decimals)).toBe(expected);
    });

    it('round-trips amounts far beyond Number precision', () => {
      const huge = '92233720368547758.07';
      expect(formatMinor(parseMinor(huge, 2), 2)).toBe(huge);
    });

    it('adds 0.10 and 0.20 to exactly 0.30', () => {
      expect(formatMinor(sumMinor([parseMinor('0.1', 2), parseMinor('0.2', 2)]), 2)).toBe('0.30');
    });

    it('validates form input with zod before parsing', () => {
      expect(amountInput.safeParse(' 12,50 ').success).toBe(true);
      expect(amountInput.safeParse('12.5.0').success).toBe(false);
    });
  });

  describe('divRound', () => {
    it.each([
      [5n, 2n, 'half-up', 3n],
      [-5n, 2n, 'half-up', -3n],
      [5n, 2n, 'half-even', 2n],
      [7n, 2n, 'half-even', 4n],
      [-7n, 2n, 'half-even', -4n],
      [10n, 3n, 'half-up', 3n],
      [11n, 3n, 'half-up', 4n],
      [5n, -2n, 'half-up', -3n],
    ] as const)('%s / %s (%s) = %s', (n, d, mode, expected) => {
      expect(divRound(n, d, mode)).toBe(expected);
    });

    it('refuses division by zero', () => {
      expect(() => divRound(1n, 0n)).toThrow(RangeError);
    });
  });

  describe('convertMinor (display only)', () => {
    it('converts between currencies with different minor units', () => {
      // 100.00 USD at 4.0123 PLN/USD = 401.23 PLN
      expect(convertMinor(10000n, 2, '4.0123', 2)).toBe(40123n);
      // 1000 JPY at 0.0265 PLN/JPY = 26.50 PLN
      expect(convertMinor(1000n, 0, '0.0265', 2)).toBe(2650n);
      // 10.00 EUR at 0.385 KWD/EUR = 3.850 KWD
      expect(convertMinor(1000n, 2, '0.385', 3)).toBe(3850n);
    });

    it('rounds the last minor unit half up by default', () => {
      // 0.01 USD * 4.25 = 0.0425 PLN -> 0.04; 0.03 * 4.25 = 0.1275 -> 0.13
      expect(convertMinor(1n, 2, '4.25', 2)).toBe(4n);
      expect(convertMinor(3n, 2, '4.25', 2)).toBe(13n);
    });
  });

  describe('impliedRate', () => {
    it('is what one unit sent bought', () => {
      // sent 1000.00 PLN, received 230.45 EUR
      expect(impliedRate(100000n, 2, 23045n, 2)).toBe('0.230450');
      // sent 100.00 EUR, received 16200 JPY
      expect(impliedRate(10000n, 2, 16200n, 0, 2)).toBe('162.00');
    });
  });

  describe('allocate', () => {
    it('splits without losing a grosz', () => {
      expect(allocate(100n, [1n, 1n, 1n])).toEqual([34n, 33n, 33n]);
      expect(allocate(-100n, [1n, 1n, 1n])).toEqual([-34n, -33n, -33n]);
      expect(allocate(1000n, [0n, 1n])).toEqual([0n, 1000n]);
    });

    it('always sums to the total', () => {
      const weights = [7n, 13n, 29n, 51n, 3n];
      for (const total of [0n, 1n, 99n, 12345n, -98765n]) {
        expect(sumMinor(allocate(total, weights))).toBe(total);
      }
    });

    it('refuses weights it cannot split by', () => {
      expect(() => allocate(1n, [])).toThrow(RangeError);
      expect(() => allocate(1n, [0n, 0n])).toThrow(RangeError);
      expect(() => allocate(1n, [-1n, 2n])).toThrow(RangeError);
    });
  });

  describe('quantities', () => {
    it('keeps 10 decimal places exactly', () => {
      expect(parseQuantity('71')).toBe(710000000000n);
      expect(parseQuantity('0.0000000001')).toBe(1n);
      expect(() => parseQuantity('0.00000000001')).toThrow(DecimalFormatError);
      expect(formatQuantity(parseQuantity('71.50'))).toBe('71.5');
      expect(formatQuantity(parseQuantity('100'))).toBe('100');
      expect(formatQuantity(0n)).toBe('0');
    });

    it('crosses the Decimal(28, 10) column without loss', () => {
      const units = parseQuantity('123456789012345678.0123456789');
      expect(quantityToDb(units)).toBe('123456789012345678.0123456789');
      expect(quantityFromDb({ toFixed: () => '71.5000000000' })).toBe(parseQuantity('71.5'));
      expect(quantityFromDb('3.25')).toBe(parseQuantity('3.25'));
    });

    it('allocates a lot cost to a partial sale', () => {
      // 10 units cost 1000.00 EUR; selling 3 allocates 300.00
      expect(proRataMinor(100000n, parseQuantity('3'), parseQuantity('10'))).toBe(30000n);
      // 3 units cost 100.00; selling 1 allocates 33.33
      expect(proRataMinor(10000n, parseQuantity('1'), parseQuantity('3'))).toBe(3333n);
    });
  });
});
