/**
 * Exact decimal arithmetic for form previews (the implied rate of a transfer,
 * the amount that will arrive). BigInt only; the API recomputes everything.
 */

const DECIMAL_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;

export interface Scaled {
  value: bigint;
  scale: number;
}

export function parseDecimal(input: string): Scaled | null {
  const match = DECIMAL_RE.exec(input.trim());
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const value = BigInt(whole + fraction);
  return { value: sign === "-" ? -value : value, scale: fraction.length };
}

function rescale(a: Scaled, scale: number): bigint {
  return a.value * 10n ** BigInt(scale - a.scale);
}

export function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? "-" : ""}${whole}${scale > 0 ? `.${fraction}` : ""}`;
}

export function subtract(a: string, b: string): string | null {
  const x = parseDecimal(a);
  const y = parseDecimal(b);
  if (!x || !y) return null;
  const scale = Math.max(x.scale, y.scale);
  return formatScaled(rescale(x, scale) - rescale(y, scale), scale);
}

/** a / b to `scale` places, half up; null when either is not a number or b is zero. */
export function divide(a: string, b: string, scale = 6): string | null {
  const x = parseDecimal(a);
  const y = parseDecimal(b);
  if (!x || !y || y.value === 0n) return null;
  // (x.value / 10^x.scale) / (y.value / 10^y.scale) * 10^scale
  let num = x.value * 10n ** BigInt(y.scale + scale);
  let den = y.value * 10n ** BigInt(x.scale);
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const negative = num < 0n;
  const n = negative ? -num : num;
  let q = n / den;
  if ((n % den) * 2n >= den) q += 1n;
  return formatScaled(negative ? -q : q, scale);
}

export function isPositiveDecimal(input: string): boolean {
  const x = parseDecimal(input);
  return !!x && x.value > 0n;
}
