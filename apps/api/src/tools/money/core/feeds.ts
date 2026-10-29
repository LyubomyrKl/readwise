import { addDays, formatDate, parseDate } from './dates';

/**
 * Parsers for the public data the daily jobs fetch: ECB reference rates,
 * NBP table A and Yahoo Finance end-of-day prices. Pure: text in, rows out. Rates and
 * prices stay decimal strings as published; nothing goes through a float.
 */

export interface FeedRate {
  date: string;
  from: string;
  to: string;
  rate: string;
}

export interface FeedPrice {
  date: string;
  price: string;
}

const DECIMAL = /^\d+(\.\d+)?$/;
const positive = (v: string) => DECIMAL.test(v) && /[1-9]/.test(v);

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*["']([^"']*)["']/g)) out[m[1]] = m[2];
  return out;
}

/** ECB eurofxref XML (daily, 90-day or full history): euro to each currency, per day. */
export function parseEcbXml(xml: string): FeedRate[] {
  const out: FeedRate[] = [];
  for (const day of xml.matchAll(/<Cube\s+time\s*=\s*["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g)) {
    for (const cube of day[2].matchAll(/<Cube\b([^>]*)\/?>/g)) {
      const { currency, rate } = attributes(cube[1]);
      if (currency && /^[A-Z]{3}$/.test(currency) && rate && positive(rate)) out.push({ date: day[1], from: 'EUR', to: currency, rate });
    }
  }
  return out;
}

/**
 * NBP table A as JSON (`/exchangerates/tables/A/{from}/{to}/?format=json`):
 * the złoty price of one unit of each currency. Read from the text so the
 * mid rates keep their published digits.
 */
export function parseNbpTables(json: string): FeedRate[] {
  const out: FeedRate[] = [];
  for (const table of json.matchAll(/\{[^{}]*?"effectiveDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"[^{}]*?"rates"\s*:\s*\[([^\]]*)\]/g)) {
    for (const item of table[2].matchAll(/\{([^{}]*)\}/g)) {
      const code = /"code"\s*:\s*"([A-Z]{3})"/.exec(item[1])?.[1];
      const mid = /"mid"\s*:\s*(\d+(?:\.\d+)?)\s*(?:,|$)/.exec(item[1].trim())?.[1];
      if (code && mid && positive(mid)) out.push({ date: table[1], from: code, to: 'PLN', rate: mid });
    }
  }
  return out;
}

/** [from, to] date ranges of at most `maxDays` days covering the span (NBP answers 93 days per query). */
export function dateChunks(from: string, to: string, maxDays = 90): [string, string][] {
  const out: [string, string][] = [];
  let start = parseDate(from);
  const end = parseDate(to);
  while (start <= end) {
    const chunkEnd = addDays(start, maxDays - 1);
    const last = chunkEnd < end ? chunkEnd : end;
    out.push([formatDate(start), formatDate(last)]);
    start = addDays(last, 1);
  }
  return out;
}

/** A decimal as a JSON encoder writes it ("169.3000030517578") rounded half up to `places`, as text; null when it is not a plain positive number. */
export function roundDecimalText(value: string, places: number): string | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const digits = (m[2] ?? '').padEnd(places + 1, '0');
  let scaled = BigInt(m[1] + digits.slice(0, places));
  if (Number(digits[places]) >= 5) scaled += 1n;
  if (scaled === 0n) return null;
  const s = scaled.toString().padStart(places + 1, '0');
  return places > 0 ? `${s.slice(0, -places)}.${s.slice(-places)}` : s;
}

export interface FeedChart {
  currency: string;
  prices: FeedPrice[];
}

/**
 * Yahoo Finance chart JSON (`/v8/finance/chart/VWCE.DE?range=5d&interval=1d`):
 * the daily closes, oldest first, dated in the exchange's time zone and rounded
 * to the exchange's precision (priceHint). The numbers are read from the text,
 * not through JSON.parse, so no close passes through a float. Null when the
 * symbol is unknown.
 */
export function parseYahooChart(json: string): FeedChart | null {
  const currency = /"currency":"([A-Za-z]{3})"/.exec(json)?.[1]?.toUpperCase();
  const offset = Number(/"gmtoffset":(-?\d+)/.exec(json)?.[1] ?? '0');
  const places = Number(/"priceHint":(\d+)/.exec(json)?.[1] ?? '4');
  const stamps = /"timestamp":\[([^\]]*)\]/.exec(json)?.[1]?.split(',') ?? [];
  const closes = /"close":\[([^\]]*)\]/.exec(json)?.[1]?.split(',') ?? [];
  if (!currency || stamps.length === 0 || stamps.length !== closes.length) return null;
  const byDate = new Map<string, string>();
  stamps.forEach((stamp, i) => {
    const price = /^\d/.test(closes[i]) ? roundDecimalText(closes[i], places) : null;
    if (!/^\d+$/.test(stamp) || !price) return;
    byDate.set(formatDate(new Date((Number(stamp) + offset) * 1000)), price);
  });
  const prices = [...byDate.entries()].map(([date, price]) => ({ date, price })).sort((a, b) => a.date.localeCompare(b.date));
  return prices.length > 0 ? { currency, prices } : null;
}

/** The last close of each month (and the latest close), enough for month-end values without storing every day. */
export function monthEndPrices(prices: readonly FeedPrice[]): FeedPrice[] {
  const byMonth = new Map<string, FeedPrice>();
  for (const p of prices) byMonth.set(p.date.slice(0, 7), p);
  return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}
