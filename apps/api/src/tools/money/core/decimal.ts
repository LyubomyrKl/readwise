/**
 * Exact decimal strings <-> scaled BigInt. The single parser behind money.ts
 * (currency minor units) and quantity.ts (asset units). No floating point.
 */

const DECIMAL_RE = /^([+-])?(\d+)(?:[.,](\d+))?$/;

export class DecimalFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecimalFormatError';
  }
}

/**
 * Parses "-1234.5" into an integer scaled by 10^scale (scale 2 -> -123450n).
 * Accepts "." or "," as the separator, no thousands separators, no exponent.
 * More fraction digits than `scale` is an error unless they are zeros: silently
 * dropping a digit would create or destroy money.
 */
export function parseScaled(input: string, scale: number): bigint {
  const match = DECIMAL_RE.exec(input.trim());
  if (!match) throw new DecimalFormatError(`not a decimal number: "${input}"`);
  const [, sign, whole, fraction = ''] = match;
  const significant = fraction.replace(/0+$/, '');
  if (significant.length > scale) {
    throw new DecimalFormatError(`"${input}" has more than ${scale} decimal places`);
  }
  const digits = whole + fraction.slice(0, scale).padEnd(scale, '0');
  const value = BigInt(digits);
  return sign === '-' ? -value : value;
}

/** Formats a scaled integer back to a plain decimal string with exactly `scale` places. */
export function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${whole}${scale > 0 ? `.${fraction}` : ''}`;
}

/** Exact sum of decimal strings, at the largest scale among them: addDecimals("1.5", "-0.25") is "1.25". */
export function addDecimals(...values: string[]): string {
  const scale = Math.max(0, ...values.map((v) => v.trim().split(/[.,]/)[1]?.length ?? 0));
  return formatScaled(
    values.reduce((sum, v) => sum + parseScaled(v, scale), 0n),
    scale,
  );
}

export type RoundingMode = 'half-up' | 'half-even';

/**
 * numerator / denominator rounded to an integer. 'half-up' rounds halves away
 * from zero (what banks and brokers print); 'half-even' is banker's rounding.
 */
export function divRound(numerator: bigint, denominator: bigint, mode: RoundingMode = 'half-up'): bigint {
  if (denominator === 0n) throw new RangeError('division by zero');
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  let q = n / denominator;
  const twiceRemainder = (n % denominator) * 2n;
  if (twiceRemainder > denominator || (twiceRemainder === denominator && (mode === 'half-up' || q % 2n === 1n))) {
    q += 1n;
  }
  return negative ? -q : q;
}

/** A decimal string as an exact fraction: "1.2345" -> [12345n, 10000n]. */
export function toFraction(input: string): [bigint, bigint] {
  const match = DECIMAL_RE.exec(input.trim());
  if (!match) throw new DecimalFormatError(`not a decimal number: "${input}"`);
  const fraction = match[3] ?? '';
  return [parseScaled(input, fraction.length), 10n ** BigInt(fraction.length)];
}

export const pow10 = (n: number): bigint => 10n ** BigInt(n);
