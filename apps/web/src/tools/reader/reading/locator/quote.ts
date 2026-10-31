import search from "approx-string-match";
import { normalizeText } from "./text";

/** The selected text with up to 32 characters of context on each side, normalized. */
export type Quote = { exact: string; prefix?: string; suffix?: string };

export const CONTEXT = 32;

/**
 * The quote of [start, end) in an already normalized text (UTF-16 indices). Whitespace at the
 * edges of the selection is not part of it, so the same words always give the same quote.
 */
export function buildQuote(text: string, start: number, end: number): { quote: Quote; start: number; end: number } {
  let s = Math.max(0, Math.min(start, text.length));
  let e = Math.max(s, Math.min(end, text.length));
  while (s < e && text[s] === " ") s += 1;
  while (e > s && text[e - 1] === " ") e -= 1;
  return {
    quote: { exact: text.slice(s, e), prefix: text.slice(Math.max(0, s - CONTEXT), s), suffix: text.slice(e, e + CONTEXT) },
    start: s,
    end: e,
  };
}

export type QuoteMatch = { start: number; end: number; score: number };

// Hypothesis's weights (client/src/annotator/anchoring/match-quote.ts): the quote itself matters
// most, then the context on each side, then nearness to where it was before.
const QUOTE_WEIGHT = 50;
const PREFIX_WEIGHT = 20;
const SUFFIX_WEIGHT = 20;
const POSITION_WEIGHT = 2;
const TOTAL = QUOTE_WEIGHT + PREFIX_WEIGHT + SUFFIX_WEIGHT + POSITION_WEIGHT;

/** How closely `actual` matches `expected`: 1 for the same text, 0 for nothing in common. */
function textScore(actual: string, expected: string): number {
  if (expected.length === 0 || actual.length === 0) return 0;
  const matches = search(actual, expected, expected.length);
  if (matches.length === 0) return 0;
  return 1 - matches[0].errors / expected.length;
}

/**
 * Where a quote is in a normalized text (UTF-16 indices), or null. Exact occurrences first; when
 * there is none, approximate ones with up to min(256, length/2) errors. Several candidates are
 * ranked by the quote, its context and the distance to `hint` (where it was last time).
 * `minScore` (0..1) rejects weak matches; 0.5 by default.
 */
export function findQuote(text: string, quote: Quote, hint?: number, minScore = 0.5): QuoteMatch | null {
  const exact = normalizeText(quote.exact).trim();
  if (!exact) return null;
  const prefix = quote.prefix ? normalizeText(quote.prefix) : "";
  const suffix = quote.suffix ? normalizeText(quote.suffix) : "";

  let candidates: { start: number; end: number; errors: number }[] = [];
  for (let i = text.indexOf(exact); i !== -1 && candidates.length < 500; i = text.indexOf(exact, i + 1)) {
    candidates.push({ start: i, end: i + exact.length, errors: 0 });
  }
  if (candidates.length === 0) {
    const maxErrors = Math.min(256, Math.floor(exact.length / 2));
    candidates = search(text, exact, maxErrors);
  }
  if (candidates.length === 0) return null;

  let best: QuoteMatch | null = null;
  for (const c of candidates) {
    const quoteScore = 1 - c.errors / exact.length;
    const prefixScore = prefix ? textScore(text.slice(Math.max(0, c.start - prefix.length), c.start), prefix) : 1;
    const suffixScore = suffix ? textScore(text.slice(c.end, c.end + suffix.length), suffix) : 1;
    const positionScore = hint === undefined || text.length === 0 ? 1 : 1 - Math.abs(c.start - hint) / text.length;
    const score =
      (QUOTE_WEIGHT * quoteScore + PREFIX_WEIGHT * prefixScore + SUFFIX_WEIGHT * suffixScore + POSITION_WEIGHT * positionScore) /
      TOTAL;
    if (!best || score > best.score) best = { start: c.start, end: c.end, score };
  }
  return best && best.score >= minScore ? best : null;
}
