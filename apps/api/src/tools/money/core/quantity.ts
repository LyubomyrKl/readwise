import { divRound, formatScaled, parseScaled, type RoundingMode } from './decimal';

/**
 * Asset quantities (units of VWCE, bonds of EDO) as BigInt scaled by 10^10,
 * matching the Decimal(28, 10) columns (rule 1). Arithmetic happens on the
 * scaled integers; Prisma Decimals are crossed only through these functions.
 */
export const QUANTITY_SCALE = 10;

/** "71.5" -> 715000000000n. Throws on more than 10 decimal places. */
export function parseQuantity(input: string): bigint {
  return parseScaled(input, QUANTITY_SCALE);
}

/** For the Decimal(28, 10) columns: full precision, e.g. "71.5000000000". */
export function quantityToDb(units: bigint): string {
  return formatScaled(units, QUANTITY_SCALE);
}

/** From a Prisma Decimal (or its string). Decimal.toFixed never uses exponent notation. */
export function quantityFromDb(value: { toFixed(dp: number): string } | string): bigint {
  return parseQuantity(typeof value === 'string' ? value : value.toFixed(QUANTITY_SCALE));
}

/** For people: trailing zeros dropped, "71.5". */
export function formatQuantity(units: bigint): string {
  const full = formatScaled(units, QUANTITY_SCALE);
  return full.replace(/\.?0+$/, '');
}

/**
 * The share of `totalMinor` (the cost of `ofUnits`) that belongs to `units`:
 * the cost allocated to a partial sale of a lot.
 */
export function proRataMinor(totalMinor: bigint, units: bigint, ofUnits: bigint, mode: RoundingMode = 'half-up'): bigint {
  if (ofUnits === 0n) throw new RangeError('ofUnits is zero');
  return divRound(totalMinor * units, ofUnits, mode);
}

