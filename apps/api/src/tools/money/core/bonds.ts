import { addMonths, addYears, daysBetween, monthKey, parseDate } from './dates';
import { divRound, pow10, toFraction } from './decimal';
import { parseMinor } from './money';

/**
 * Value of savings bonds that capitalise interest once a year, like the Polish
 * 10-year inflation-linked EDO: the first year at a fixed rate, every later
 * year at the margin plus inflation (never below the margin), interest added
 * to the capital at each anniversary and accrued day by day within the year.
 * Everything that differs between series is data in the asset's
 * valuationConfig, not code. Pure.
 */

export interface BondSeries {
  /** purchases on or after this day (YYYY-MM-DD) belong to the series */
  from: string;
  /** percent per year in the first year, e.g. "5.60" */
  firstYearRate: string;
  /** percent added to inflation from the second year, e.g. "2.00" */
  margin: string;
}

export interface BondConfig {
  /** nominal value of one bond in the quote currency, e.g. "100.00" */
  nominal: string;
  termYears: number;
  series: BondSeries[];
  /** year-on-year inflation in percent by month ("2026-08": "2.9"), as the statistics office publishes it */
  inflation?: Record<string, string>;
  /** a later year uses the inflation of the month this many months before it starts (EDO: 2) */
  inflationLagMonths?: number;
  /** fixed-rate bonds: every year at firstYearRate */
  fixed?: boolean;
}

export interface BondValue {
  /** value of one bond in minor units of the quote currency */
  minor: bigint;
  /** a year's rate used the latest inflation known instead of the month it needs */
  estimated: boolean;
  matured: boolean;
  /** percent per year of the current year */
  currentRate: string;
}

export class BondConfigError extends Error {}

export function parseBondConfig(raw: unknown): BondConfig {
  if (!raw || typeof raw !== 'object') throw new BondConfigError('bond config missing');
  const c = raw as Partial<BondConfig>;
  if (typeof c.nominal !== 'string' || !/^\d+(\.\d+)?$/.test(c.nominal)) throw new BondConfigError('nominal: a decimal like "100.00"');
  if (typeof c.termYears !== 'number' || c.termYears < 1 || c.termYears > 40) throw new BondConfigError('termYears: 1 to 40');
  if (!Array.isArray(c.series) || c.series.length === 0) throw new BondConfigError('series: at least one');
  for (const s of c.series) {
    if (!s || typeof s.from !== 'string' || !/^\d+(\.\d+)?$/.test(s.firstYearRate ?? '') || !/^\d+(\.\d+)?$/.test(s.margin ?? '')) {
      throw new BondConfigError('series: { from: "YYYY-MM-DD", firstYearRate: "5.60", margin: "2.00" }');
    }
    parseDate(s.from);
  }
  for (const [month, value] of Object.entries(c.inflation ?? {})) {
    if (!/^\d{4}-\d{2}$/.test(month) || !/^-?\d+(\.\d+)?$/.test(value)) throw new BondConfigError(`inflation: "${month}": "${value}"`);
  }
  return {
    nominal: c.nominal,
    termYears: c.termYears,
    series: [...c.series].sort((a, b) => a.from.localeCompare(b.from)),
    inflation: c.inflation ?? {},
    inflationLagMonths: c.inflationLagMonths ?? 2,
    fixed: c.fixed ?? false,
  };
}

/** A percent string as an exact fraction of 1: "5.60" -> 56/1000. */
function percentFraction(percent: string): [bigint, bigint] {
  const [n, d] = toFraction(percent);
  return [n, d * 100n];
}

function addPercent(a: string, b: string): string {
  const [an, ad] = toFraction(a);
  const [bn, bd] = toFraction(b);
  const scale = ad > bd ? ad : bd;
  const sum = an * (scale / ad) + bn * (scale / bd);
  const digits = scale.toString().length - 1;
  const negative = sum < 0n;
  const s = (negative ? -sum : sum).toString().padStart(digits + 1, '0');
  return `${negative ? '-' : ''}${digits > 0 ? `${s.slice(0, -digits)}.${s.slice(-digits)}` : s}`;
}

function rateForYear(
  config: BondConfig,
  series: BondSeries,
  start: Date,
  year: number,
): { rate: string; estimated: boolean } {
  if (year === 0 || config.fixed) return { rate: series.firstYearRate, estimated: false };
  const month = monthKey(addMonths(start, -(config.inflationLagMonths ?? 2), 1));
  const table = config.inflation ?? {};
  let inflation = table[month];
  let estimated = false;
  if (inflation === undefined) {
    const known = Object.keys(table)
      .filter((m) => m <= month)
      .sort();
    const latest = known[known.length - 1] ?? Object.keys(table).sort().pop();
    inflation = latest ? table[latest] : '0';
    estimated = true;
  }
  const floored = inflation.startsWith('-') ? '0' : inflation;
  return { rate: addPercent(series.margin, floored), estimated };
}

export function bondValue(config: BondConfig, acquiredAt: Date, at: Date, decimals: number): BondValue {
  const series = [...config.series].reverse().find((s) => parseDate(s.from) <= acquiredAt) ?? config.series[0];
  let value = parseMinor(config.nominal, decimals);
  let estimated = false;
  let currentRate = series.firstYearRate;
  if (at < acquiredAt) return { minor: value, estimated, matured: false, currentRate };

  for (let year = 0; year < config.termYears; year++) {
    const start = addYears(acquiredAt, year);
    const end = addYears(acquiredAt, year + 1);
    const { rate, estimated: guessed } = rateForYear(config, series, start, year);
    estimated ||= guessed;
    currentRate = rate;
    const [rn, rd] = percentFraction(rate);
    if (at >= end) {
      value += divRound(value * rn, rd);
      continue;
    }
    const elapsed = BigInt(daysBetween(start, at));
    const length = BigInt(daysBetween(start, end));
    value += divRound(value * rn * elapsed, rd * length);
    return { minor: value, estimated, matured: false, currentRate };
  }
  return { minor: value, estimated, matured: true, currentRate };
}

/** Value of `units` (scaled by 10^10) bonds, each worth `perUnitMinor`. */
export function unitsValue(perUnitMinor: bigint, units: bigint): bigint {
  return divRound(perUnitMinor * units, pow10(10));
}
