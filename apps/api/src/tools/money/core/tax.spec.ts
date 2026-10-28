import { dividendTax, gainsTax, roundToZloty } from './tax';

describe('PIT-38 arithmetic', () => {
  it('rounds to whole złoty, half up', () => {
    expect([roundToZloty(123_449n), roundToZloty(123_450n), roundToZloty(-49n)]).toEqual([123_400n, 123_500n, 0n]);
  });

  it('taxes the income of the year from sales', () => {
    // revenue 18 999.50, costs 14 490.00 -> income 4 509.50 -> base 4 510 -> tax 856.90 -> 857
    expect(gainsTax(1_899_950n, 1_449_000n)).toEqual({ income: 450_950n, base: 451_000n, tax: 85_700n });
    expect(gainsTax(100_000n, 150_000n)).toEqual({ income: -50_000n, base: 0n, tax: 0n });
  });

  it('counts the tax withheld abroad against the 19% on dividends', () => {
    // gross 45.06 PLN, 15% withheld 6.76: 19% is 8.56, 1.80 left -> 2 PLN
    expect(dividendTax(4_506n, 676n)).toEqual({ tax: 856n, credit: 676n, due: 200n });
    // withheld more than 19% (an unreclaimed 30%): nothing more to pay
    expect(dividendTax(10_000n, 3_000n)).toEqual({ tax: 1_900n, credit: 1_900n, due: 0n });
  });
});
