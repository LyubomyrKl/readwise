import { divRound } from './decimal';

/**
 * The Polish yearly return for investments (PIT-38), in grosz. Pure.
 *
 *  - gains: revenue and costs of sales in PLN; the income is taxed at 19%, the
 *    base and the tax rounded to whole złoty (Ordynacja podatkowa art. 63)
 *  - foreign dividends and interest: 19% of the gross, less the tax already
 *    withheld abroad (never below zero), rounded to whole złoty
 */

export const TAX_RATE_PERCENT = 19n;

/** Half a złoty and more up, less down. */
export function roundToZloty(minor: bigint): bigint {
  return divRound(minor, 100n) * 100n;
}

export interface GainsTax {
  income: bigint;
  base: bigint;
  tax: bigint;
}

export function gainsTax(revenue: bigint, costs: bigint): GainsTax {
  const income = revenue - costs;
  const base = income > 0n ? roundToZloty(income) : 0n;
  return { income, base, tax: roundToZloty(divRound(base * TAX_RATE_PERCENT, 100n)) };
}

export interface DividendTax {
  /** 19% of the gross, to the grosz */
  tax: bigint;
  /** the tax withheld abroad that counts against it */
  credit: bigint;
  /** left to pay in Poland, whole złoty */
  due: bigint;
}

export function dividendTax(gross: bigint, withheld: bigint): DividendTax {
  const tax = divRound(gross * TAX_RATE_PERCENT, 100n);
  const credit = withheld < tax ? withheld : tax;
  return { tax, credit, due: roundToZloty(tax - credit) };
}
