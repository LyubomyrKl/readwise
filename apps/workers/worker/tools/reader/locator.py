"""The workers' half of Locator v2 (docs/document-architecture.md): the one text normalization
shared with the web reader (apps/web/src/tools/reader/reading/locator/text.ts; both test
packages/contracts/locator/normalize.cases.json), and finding a stored quote in extracted text, so
a highlight made in the reader can be matched to the IR block it covers.

Offsets are code points, which is what Python strings index.
"""

from __future__ import annotations

import difflib
import unicodedata
from dataclasses import dataclass
from typing import Optional

# Tab, LF, VT, FF, CR, space, no-break space, Ogham space, U+2000-U+200A, line and paragraph
# separators, narrow no-break space, medium mathematical space, ideographic space, BOM.
SPACE_CODES = frozenset([0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, *range(0x2000, 0x200B),
                         0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF])
SOFT_HYPHEN = 0xAD
CONTEXT = 32
# shorter quotes are found exactly or not at all: with a few errors allowed they match anything
MIN_FUZZY_LENGTH = 10


def normalize_text(text: str) -> str:
    out: list[str] = []
    in_space = False
    for ch in unicodedata.normalize("NFC", text):
        code = ord(ch)
        if code == SOFT_HYPHEN:
            continue
        if code in SPACE_CODES:
            if not in_space:
                out.append(" ")
            in_space = True
            continue
        in_space = False
        out.append(ch)
    return "".join(out)


@dataclass
class Quote:
    exact: str
    prefix: str = ""
    suffix: str = ""


def build_quote(text: str, start: int, end: int) -> tuple[Quote, int, int]:
    """The quote of text[start:end] (normalized text), without edge spaces, with context."""
    s, e = max(0, min(start, len(text))), max(0, min(end, len(text)))
    e = max(s, e)
    while s < e and text[s] == " ":
        s += 1
    while e > s and text[e - 1] == " ":
        e -= 1
    return Quote(text[s:e], text[max(0, s - CONTEXT):s], text[e:e + CONTEXT]), s, e


@dataclass
class QuoteMatch:
    start: int
    end: int
    score: float


# the web reader's weights (Hypothesis's): the quote, its context, then nearness to the hint
_WEIGHTS = (50, 20, 20, 2)


def _ratio(actual: str, expected: str) -> float:
    if not expected or not actual:
        return 0.0
    return difflib.SequenceMatcher(None, actual, expected, autojunk=False).ratio()


def find_quote(text: str, quote: Quote, hint: Optional[int] = None, min_score: float = 0.5) -> Optional[QuoteMatch]:
    """Where `quote` is in normalized `text`, or None. Exact occurrences are ranked by their
    context and the distance to `hint`; without one, the closest window of the quote's length."""
    exact = normalize_text(quote.exact).strip()
    if not exact:
        return None
    prefix, suffix = normalize_text(quote.prefix or ""), normalize_text(quote.suffix or "")

    candidates: list[tuple[int, int, float]] = []
    i = text.find(exact)
    while i != -1 and len(candidates) < 500:
        candidates.append((i, i + len(exact), 1.0))
        i = text.find(exact, i + 1)
    if not candidates and len(exact) >= MIN_FUZZY_LENGTH:
        candidates = _fuzzy_candidates(text, exact)
    best: Optional[QuoteMatch] = None
    for start, end, quote_score in candidates:
        prefix_score = _ratio(text[max(0, start - len(prefix)):start], prefix) if prefix else 1.0
        suffix_score = _ratio(text[end:end + len(suffix)], suffix) if suffix else 1.0
        position_score = 1.0 if hint is None or not text else 1 - abs(start - hint) / len(text)
        w_quote, w_prefix, w_suffix, w_position = _WEIGHTS
        score = (w_quote * quote_score + w_prefix * prefix_score + w_suffix * suffix_score
                 + w_position * position_score) / sum(_WEIGHTS)
        if best is None or score > best.score:
            best = QuoteMatch(start, end, score)
    return best if best is not None and best.score >= min_score else None


def _fuzzy_candidates(text: str, exact: str) -> list[tuple[int, int, float]]:
    """Windows of about the quote's length whose similarity is at least one half: a coarse pass
    in steps of a quarter of the quote, then the best window refined around it."""
    n = len(exact)
    if n == 0 or len(text) == 0:
        return []
    step = max(1, n // 4)
    scored = [(_ratio(text[i:i + n], exact), i) for i in range(0, max(1, len(text) - n + 1), step)]
    scored.sort(reverse=True)
    out: list[tuple[int, int, float]] = []
    for ratio, i in scored[:3]:
        if ratio < 0.5:
            break
        best_ratio, best_start, best_end = ratio, i, i + n
        for s in range(max(0, i - step), min(len(text), i + step) + 1):
            for length in (n - 2, n - 1, n, n + 1, n + 2, n + n // 10):
                if length <= 0:
                    continue
                r = _ratio(text[s:s + length], exact)
                if r > best_ratio:
                    best_ratio, best_start, best_end = r, s, s + length
        out.append((best_start, min(best_end, len(text)), best_ratio))
    return out
