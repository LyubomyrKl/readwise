import { createHash } from 'crypto';
import { formatDate, parseDate } from './dates';

/**
 * Cell parsers for imports: dates and amounts as exports write them, into the
 * ledger's formats ("YYYY-MM-DD", exact decimal strings). Pure.
 */

export type DateFormat = 'auto' | 'YYYY-MM-DD' | 'DD.MM.YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'DD-MM-YYYY' | 'YYYY/MM/DD';
export const DATE_FORMATS: DateFormat[] = ['auto', 'YYYY-MM-DD', 'DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'YYYY/MM/DD'];

const PATTERNS: Record<Exclude<DateFormat, 'auto'>, RegExp> = {
  'YYYY-MM-DD': /^(\d{4})-(\d{1,2})-(\d{1,2})/,
  'YYYY/MM/DD': /^(\d{4})\/(\d{1,2})\/(\d{1,2})/,
  'DD.MM.YYYY': /^(\d{1,2})\.(\d{1,2})\.(\d{4})/,
  'DD/MM/YYYY': /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,
  'MM/DD/YYYY': /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,
  'DD-MM-YYYY': /^(\d{1,2})-(\d{1,2})-(\d{4})/,
};

/** "YYYY-MM-DD", or null when the cell is not a date in this format. A time after the date is ignored. */
export function parseDateCell(value: string, format: Exclude<DateFormat, 'auto'>): string | null {
  const match = PATTERNS[format].exec(value.trim());
  if (!match) return null;
  const [a, b, c] = [match[1], match[2], match[3]];
  let y: string, m: string, d: string;
  if (format.startsWith('YYYY')) [y, m, d] = [a, b, c];
  else if (format === 'MM/DD/YYYY') [m, d, y] = [a, b, c];
  else [d, m, y] = [a, b, c];
  try {
    return formatDate(parseDate(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`));
  } catch {
    return null;
  }
}

/** The format that reads the most samples (a bad cell does not spoil detection); null when none reads any. */
export function detectDateFormat(samples: string[]): Exclude<DateFormat, 'auto'> | null {
  const candidates = DATE_FORMATS.filter((f): f is Exclude<DateFormat, 'auto'> => f !== 'auto');
  const values = samples.map((s) => s.trim()).filter(Boolean).slice(0, 500);
  let best: Exclude<DateFormat, 'auto'> | null = null;
  let bestCount = 0;
  for (const format of candidates) {
    const count = values.filter((v) => parseDateCell(v, format) !== null).length;
    if (count > bestCount) {
      best = format;
      bestCount = count;
    }
  }
  return best;
}

export type DecimalSeparator = 'auto' | '.' | ',';

/**
 * An amount cell as an exact signed decimal string: "1 234,56" -> "1234.56",
 * "-1.234,56 PLN" -> "-1234.56", "(12.34)" -> "-12.34", "12.34-" -> "-12.34".
 * Null when the cell holds no number.
 */
export function parseAmountCell(value: string, separator: DecimalSeparator = 'auto'): string | null {
  let s = value.trim().replace(/[\u00a0\u202f\s']/g, '').replace(/\u2212/g, '-');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,+-]/g, ''); // currency symbols and codes
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  let decimal: '.' | ',' | null;
  if (separator !== 'auto') {
    decimal = separator;
  } else {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) decimal = lastDot > lastComma ? '.' : ',';
    else if (lastComma >= 0) decimal = s.length - lastComma - 1 === 3 && s.indexOf(',') !== lastComma ? null : ',';
    else if (lastDot >= 0) decimal = s.length - lastDot - 1 === 3 && s.indexOf('.') !== lastDot ? null : '.';
    else decimal = null;
    // "1,234" alone is ambiguous: thousands in English, decimals in Polish; three digits after one
    // separator read as thousands only when the separator repeats, so "1,234" stays 1.234 here.
  }
  const thousands = decimal === '.' ? ',' : decimal === ',' ? '.' : null;
  let digits = s;
  if (thousands) digits = digits.split(thousands).join('');
  if (decimal === null) digits = digits.replace(/[.,]/g, '');
  else digits = digits.replace(decimal, '.');
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  digits = digits.replace(/^0+(?=\d)/, '');
  return negative && /[1-9]/.test(digits) ? `-${digits}` : digits;
}

/** Stable fingerprint of a movement for duplicate detection; the ordinal separates identical rows of one file. */
export function fingerprint(parts: readonly (string | number | null | undefined)[], ordinal = 0): string {
  const normalized = parts.map((p) => (p === null || p === undefined ? '' : String(p).trim().toLowerCase().replace(/\s+/g, ' ')));
  return createHash('sha256').update(JSON.stringify([...normalized, ordinal])).digest('hex');
}

/** Adds ordinals so identical keys in one file get distinct fingerprints, in file order. */
export function withOrdinals<T>(items: readonly T[], key: (item: T) => string): { item: T; ordinal: number }[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const k = key(item);
    const ordinal = seen.get(k) ?? 0;
    seen.set(k, ordinal + 1);
    return { item, ordinal };
  });
}

/** Guesses which column holds which field from header names (English and Polish). */
export function guessColumns(header: readonly string[]): Partial<Record<GuessField, number>> {
  const norm = header.map((h) =>
    h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[#*]/g, '')
      .trim(),
  );
  const out: Partial<Record<GuessField, number>> = {};
  for (const [field, patterns] of GUESSES) {
    const index = norm.findIndex((h, i) => patterns.some((p) => p.test(h)) && !Object.values(out).includes(i));
    if (index >= 0) out[field] = index;
  }
  return out;
}

export type GuessField =
  | 'date'
  | 'amount'
  | 'currency'
  | 'account'
  | 'toAccount'
  | 'toAmount'
  | 'toCurrency'
  | 'type'
  | 'category'
  | 'subcategory'
  | 'note';

const GUESSES: [GuessField, RegExp[]][] = [
  ['date', [/^date$/, /^data$/, /^data operacji$/, /^date\b/, /\bdate$/, /^data\b/, /^day$/, /^period$/]],
  ['toAccount', [/^to account/, /^to wallet/, /^account to$/, /^target account/, /^na konto/, /^konto docelowe/]],
  ['toAmount', [/^amount 2$/, /^amount received/, /^to amount/, /^kwota 2/]],
  ['toCurrency', [/^currency 2$/, /^to currency/, /^waluta 2/]],
  ['account', [/^account$/, /^from account/, /^accounts?$/, /^wallet$/, /^konto$/, /^rachunek$/, /^account name/]],
  ['amount', [/^amount$/, /^kwota$/, /^value$/, /^sum$/, /^amount\b/, /^kwota\b/]],
  ['currency', [/^currency$/, /^waluta$/, /^currency code/]],
  ['type', [/^type$/, /^typ$/, /^income\/expense$/, /^income \/ expense/, /^transaction type/, /^rodzaj/]],
  ['subcategory', [/^subcategory$/, /^podkategoria$/, /^sub-category$/]],
  ['category', [/^category$/, /^kategoria$/, /^category name/, /^to category/]],
  ['note', [/^note$/, /^notes$/, /^description$/, /^opis/, /^notatka/, /^memo$/, /^comment/, /^payee/, /^title$/, /^tytul/]],
];
