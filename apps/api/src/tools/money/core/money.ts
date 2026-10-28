import { z } from 'zod';
import { divRound, formatScaled, parseScaled, pow10, toFraction, type RoundingMode } from './decimal';

/**
 * Currency amounts as BigInt minor units (rule 1). `decimals` always comes from
 * the commodity row (money_commodity.decimals), never from a constant here.
 */

/** A user-typed amount: digits, optional sign, "." or "," separator. Validated again by parseMinor. */
export const amountInput = z.string().trim().regex(/^[+-]?\d+(?:[.,]\d+)?$/, 'not an amount');

/** A rate or a price: positive decimal string. */
export const rateInput = z.string().trim().regex(/^\d+(?:[.,]\d+)?$/, 'not a rate');

/** "12.34" with decimals 2 -> 1234n. Throws on more precision than the currency has. */
export function parseMinor(input: string, decimals: number): bigint {
  return parseScaled(input, decimals);
}

/** 1234n with decimals 2 -> "12.34". */
export function formatMinor(minor: bigint, decimals: number): string {
  return formatScaled(minor, decimals);
}

/**
 * Converts an amount at `rate` (1 unit of the source currency = rate units of
 * the target). For display and tax only (rule 5): the result is never stored
 * as a movement.
 */
export function convertMinor(
  minor: bigint,
  fromDecimals: number,
  rate: string,
  toDecimals: number,
  mode: RoundingMode = 'half-up',
): bigint {
  const [rateNum, rateDen] = toFraction(rate);
  return divRound(minor * rateNum * pow10(toDecimals), rateDen * pow10(fromDecimals), mode);
}

/**
 * The rate implied by a cross-currency transfer: how many units of the
 * received currency one unit of the sent currency bought, to `scale` places.
 */
export function impliedRate(
  sentMinor: bigint,
  sentDecimals: number,
  receivedMinor: bigint,
  receivedDecimals: number,
  scale = 6,
): string {
  if (sentMinor <= 0n || receivedMinor <= 0n) throw new RangeError('amounts must be positive');
  const scaled = divRound(receivedMinor * pow10(sentDecimals + scale), sentMinor * pow10(receivedDecimals));
  return formatScaled(scaled, scale);
}

/**
 * Splits `total` into parts proportional to `weights` that sum to exactly
 * `total` (largest remainder; ties go to the earlier part). Used to spread a fee
 * or a lot's cost across sold units without losing a grosz.
 */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.length === 0) throw new RangeError('no weights');
  if (weights.some((w) => w < 0n)) throw new RangeError('negative weight');
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum === 0n) throw new RangeError('weights sum to zero');

  const negative = total < 0n;
  const abs = negative ? -total : total;
  const parts = weights.map((w) => (abs * w) / sum);
  const remainders = weights.map((w, i) => ({ i, r: (abs * w) % sum }));
  let left = abs - parts.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of remainders) {
    if (left === 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  return negative ? parts.map((p) => -p) : parts;
}

/** Sum of minor amounts. Exists so call sites never reach for Number. */
export function sumMinor(amounts: Iterable<bigint>): bigint {
  let total = 0n;
  for (const a of amounts) total += a;
  return total;
}
