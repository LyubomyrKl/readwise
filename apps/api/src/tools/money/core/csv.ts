/**
 * Reading statement and export files: bytes to text (UTF-8, or Windows-1250
 * as Polish banks still write it), text to rows (RFC 4180 quoting, the
 * delimiter detected). Pure.
 */

export interface DecodedText {
  text: string;
  encoding: 'utf-8' | 'windows-1250' | 'utf-16le';
}

export function decodeBytes(bytes: Uint8Array): DecodedText {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1250').decode(bytes), encoding: 'windows-1250' };
  }
}

const CANDIDATES = [',', ';', '\t', '|'] as const;

/** The delimiter that splits the first lines into the most equal, non-trivial numbers of cells. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best: string = ',';
  let bestScore = -1;
  for (const d of CANDIDATES) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const max = Math.max(0, ...counts);
    if (max === 0) continue;
    // lines that agree with the most common count, weighted by that count
    const freq = new Map<number, number>();
    for (const c of counts) if (c > 0) freq.set(c, (freq.get(c) ?? 0) + 1);
    const [common, n] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = n * 10 + common;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) count++;
  }
  return count;
}

/** Rows of cells. Quoted cells may hold the delimiter, newlines and doubled quotes. Empty lines are dropped. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let quotedCell = false;
  const pushCell = () => {
    row.push(quotedCell ? cell : cell.trim());
    cell = '';
    quotedCell = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.some((c) => c !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      inQuotes = true;
      quotedCell = true;
      cell = '';
    } else if (ch === delimiter) {
      pushCell();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      if (text[i + 1] !== '\n') pushRow();
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) pushRow();
  return rows;
}
