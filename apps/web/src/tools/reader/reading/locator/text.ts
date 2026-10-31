/**
 * The one normalization of book text for quotes and offsets, shared with the workers
 * (worker/tools/reader/locator.py) and tested on both sides with
 * packages/contracts/locator/normalize.cases.json: Unicode NFC, soft hyphens dropped, every run
 * of whitespace (this exact set, so both languages agree) one space. Offsets that leave the
 * browser count code points; inside it the UTF-16 indices of the normalized string are used.
 */

/** Tab, LF, VT, FF, CR, space, no-break space, Ogham space, U+2000-U+200A, line and paragraph
 * separators, narrow no-break space, medium mathematical space, ideographic space, BOM. */
const SPACE_CODES = new Set<number>([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
]);
const SOFT_HYPHEN = 0xad;
const COMBINING = /\p{M}/u;

function isSpace(ch: string): boolean {
  return SPACE_CODES.has(ch.charCodeAt(0));
}

function isSoftHyphen(ch: string): boolean {
  return ch.charCodeAt(0) === SOFT_HYPHEN;
}

export function normalizeText(text: string): string {
  const nfc = text.normalize("NFC");
  let out = "";
  let inSpace = false;
  for (let i = 0; i < nfc.length; i += 1) {
    const ch = nfc[i];
    if (isSoftHyphen(ch)) continue;
    if (isSpace(ch)) {
      if (!inSpace) out += " ";
      inSpace = true;
      continue;
    }
    inSpace = false;
    out += ch;
  }
  return out;
}

/**
 * Normalized text with a map back to the raw string: `toRaw[i]` is the raw UTF-16 index of the
 * normalized index `i` (and `toRaw[text.length]` is `raw.length`). Lets a DOM selection, measured
 * in raw text-node offsets, become offsets in the normalized text, and back. The text equals
 * `normalizeText(raw)` for Latin, Cyrillic and Greek (bases with combining marks compose as units).
 */
export function normalizeWithMap(raw: string): { text: string; toRaw: number[] } {
  const out: string[] = [];
  const toRaw: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (isSoftHyphen(ch)) {
      i += 1;
      continue;
    }
    if (isSpace(ch)) {
      const start = i;
      while (i < raw.length && (isSpace(raw[i]) || isSoftHyphen(raw[i]))) i += 1;
      if (out.length === 0 || out[out.length - 1] !== " ") {
        out.push(" ");
        toRaw.push(start);
      }
      continue;
    }
    let end = i + 1;
    if (isHighSurrogate(ch) && end < raw.length) end += 1;
    while (end < raw.length && COMBINING.test(raw[end])) end += 1;
    const cluster = raw.slice(i, end).normalize("NFC");
    for (let k = 0; k < cluster.length; k += 1) {
      out.push(cluster[k]);
      toRaw.push(i + Math.min(k, end - i - 1));
    }
    i = end;
  }
  toRaw.push(raw.length);
  return { text: out.join(""), toRaw };
}

/** The normalized index for a raw index (the first normalized position at or after it). */
export function rawToNormalized(toRaw: number[], rawIndex: number): number {
  let lo = 0;
  let hi = toRaw.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (toRaw[mid] < rawIndex) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Code points in a string (what the stored offsets count). */
export function codePoints(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) if (!isLowSurrogateAfterHigh(text, i)) n += 1;
  return n;
}

/** UTF-16 index -> code point index. */
export function toCodePointIndex(text: string, index: number): number {
  return codePoints(text.slice(0, index));
}

/** Code point index -> UTF-16 index. */
export function toUtf16Index(text: string, codePointIndex: number): number {
  let cp = 0;
  let i = 0;
  while (i < text.length && cp < codePointIndex) {
    i += isHighSurrogate(text[i]) && i + 1 < text.length ? 2 : 1;
    cp += 1;
  }
  return i;
}

function isHighSurrogate(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 0xd800 && c <= 0xdbff;
}

function isLowSurrogateAfterHigh(text: string, i: number): boolean {
  const c = text.charCodeAt(i);
  return i > 0 && c >= 0xdc00 && c <= 0xdfff && isHighSurrogate(text[i - 1]);
}
