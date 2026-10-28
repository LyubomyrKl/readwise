import { divRound, pow10, toFraction } from './decimal';

/**
 * Exchange rates for display (rule 5): stored amounts never change, totals in
 * a base currency are computed on the fly. A rate is the latest one on or
 * before the day asked; pairs without a direct rate cross through EUR (ECB)
 * or PLN (NBP), or through both. Exact fractions all the way. Pure.
 */

export type RateSource = 'manual' | 'ecb' | 'nbp';

export interface RateRow {
  /** YYYY-MM-DD */
  date: string;
  from: string;
  to: string;
  /** 1 unit of `from` = rate units of `to` */
  rate: string;
  source: RateSource;
}

/** num/den */
export type Fraction = [bigint, bigint];

export interface FoundRate {
  rate: Fraction;
  /** the oldest date among the rates used */
  date: string;
  sources: RateSource[];
}

const ONE: Fraction = [1n, 1n];
const mul = (a: Fraction, b: Fraction): Fraction => [a[0] * b[0], a[1] * b[1]];
const inv = (a: Fraction): Fraction => [a[1], a[0]];

interface Series {
  dates: string[];
  rates: Fraction[];
}

export class RateBook {
  private readonly series = new Map<string, Series>();
  private readonly cache = new Map<string, FoundRate | null>();

  constructor(rows: readonly RateRow[]) {
    const grouped = new Map<string, RateRow[]>();
    for (const row of rows) {
      const key = `${row.source}|${row.from}|${row.to}`;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    for (const [key, list] of grouped) {
      list.sort((a, b) => a.date.localeCompare(b.date));
      this.series.set(key, { dates: list.map((r) => r.date), rates: list.map((r) => toFraction(r.rate)) });
    }
  }

  /** The latest stored rate of one source and direction on or before `date`. */
  private latest(source: RateSource, from: string, to: string, date: string): { rate: Fraction; date: string } | null {
    const s = this.series.get(`${source}|${from}|${to}`);
    if (!s) return null;
    // last index with dates[i] <= date
    let lo = 0;
    let hi = s.dates.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s.dates[mid] <= date) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found < 0 ? null : { rate: s.rates[found], date: s.dates[found] };
  }

  /** A direct pair in either direction from one source. */
  private pair(source: RateSource, from: string, to: string, date: string): { rate: Fraction; date: string } | null {
    if (from === to) return { rate: ONE, date };
    const direct = this.latest(source, from, to, date);
    if (direct) return direct;
    const reverse = this.latest(source, to, from, date);
    return reverse ? { rate: inv(reverse.rate), date: reverse.date } : null;
  }

  /** `currency` -> `pivot` within one source (ECB quotes EUR -> X, NBP quotes X -> PLN). */
  private toPivot(source: RateSource, currency: string, pivot: string, date: string) {
    return this.pair(source, currency, pivot, date);
  }

  rate(from: string, to: string, date: string): FoundRate | null {
    if (from === to) return { rate: ONE, date, sources: [] };
    const key = `${from}|${to}|${date}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const found = this.find(from, to, date);
    this.cache.set(key, found);
    return found;
  }

  private find(from: string, to: string, date: string): FoundRate | null {
    // 1. a rate entered by hand wins
    const manual = this.pair('manual', from, to, date);
    if (manual) return { rate: manual.rate, date: manual.date, sources: ['manual'] };
    // 2. one source, crossing its own pivot
    for (const [source, pivot] of [
      ['ecb', 'EUR'],
      ['nbp', 'PLN'],
    ] as const) {
      const a = this.toPivot(source, from, pivot, date);
      const b = this.toPivot(source, to, pivot, date);
      if (a && b) return { rate: mul(a.rate, inv(b.rate)), date: a.date < b.date ? a.date : b.date, sources: [source] };
    }
    // 3. two sources: from -> pivot in one, pivot -> to in the other (e.g. UAH -> PLN (NBP), PLN -> USD (ECB))
    for (const pivot of ['PLN', 'EUR']) {
      for (const s1 of ['ecb', 'nbp'] as const) {
        for (const s2 of ['ecb', 'nbp'] as const) {
          if (s1 === s2) continue;
          const a = this.crossTo(s1, from, pivot, date);
          const b = this.crossTo(s2, to, pivot, date);
          if (a && b) return { rate: mul(a.rate, inv(b.rate)), date: a.date < b.date ? a.date : b.date, sources: [s1, s2] };
        }
      }
    }
    return null;
  }

  /** `currency` -> `pivot` in one source, via that source's own pivot when needed. */
  private crossTo(source: 'ecb' | 'nbp', currency: string, pivot: string, date: string) {
    const own = source === 'ecb' ? 'EUR' : 'PLN';
    const a = this.toPivot(source, currency, own, date);
    if (!a) return null;
    if (pivot === own) return a;
    const b = this.toPivot(source, pivot, own, date);
    if (!b) return null;
    return { rate: mul(a.rate, inv(b.rate)), date: a.date < b.date ? a.date : b.date };
  }

  /** `minor` of `from` in minor units of `to`, half up; null without a rate. */
  convert(minor: bigint, from: string, fromDecimals: number, to: string, toDecimals: number, date: string): bigint | null {
    if (from === to && fromDecimals === toDecimals) return minor;
    const found = this.rate(from, to, date);
    if (!found) return null;
    return convertFraction(minor, fromDecimals, found.rate, toDecimals);
  }
}

export function convertFraction(minor: bigint, fromDecimals: number, [num, den]: Fraction, toDecimals: number): bigint {
  return divRound(minor * num * pow10(toDecimals), den * pow10(fromDecimals));
}
