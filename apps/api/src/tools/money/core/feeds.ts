import { addDays, formatDate, parseDate } from './dates';

/**
 * Parsers for the public data the daily jobs fetch: ECB reference rates,
 * NBP table A and Stooq end-of-day prices. Pure: text in, rows out. Rates and
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

function csvLines(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(','));
}

/** A number as Stooq writes it ("129.88"), or null for "N/D" and the like. */
function stooqNumber(value: string | undefined): string | null {
  const v = (value ?? '').trim();
  if (!DECIMAL.test(v) || !/[1-9]/.test(v)) return null;
  return v.replace(/^0+(?=\d)/, '');
}

/**
 * Stooq quote CSV (`/q/l/?s=vwce.de&f=sd2t2ohlcv&h&e=csv`): the latest close.
 * Null when the symbol is unknown (Stooq answers "N/D").
 */
export function parseStooqQuote(csv: string): FeedPrice | null {
  const [header, row] = csvLines(csv);
  if (!header || !row) return null;
  const at = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const date = row[at('date')]?.trim();
  const close = stooqNumber(row[at('close')]);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !close) return null;
  return { date, price: close };
}

/** Stooq daily history CSV (`/q/d/l/?s=vwce.de&i=d`): every close, oldest first. */
export function parseStooqHistory(csv: string): FeedPrice[] {
  const [header, ...rows] = csvLines(csv);
  if (!header) return [];
  const date = header.findIndex((h) => h.trim().toLowerCase() === 'date');
  const close = header.findIndex((h) => h.trim().toLowerCase() === 'close');
  if (date < 0 || close < 0) return [];
  const out: FeedPrice[] = [];
  for (const r of rows) {
    const d = r[date]?.trim();
    const c = stooqNumber(r[close]);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && c) out.push({ date: d, price: c });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The last close of each month (and the latest close), enough for month-end values without storing every day. */
export function monthEndPrices(prices: readonly FeedPrice[]): FeedPrice[] {
  const byMonth = new Map<string, FeedPrice>();
  for (const p of prices) byMonth.set(p.date.slice(0, 7), p);
  return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}
