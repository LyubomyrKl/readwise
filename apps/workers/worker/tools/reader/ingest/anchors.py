"""Locators and IR blocks, both ways (docs/document-architecture.md, The map).

- `blocks_for(doc, locator)`: the IR blocks a Locator v2 (a highlight, a note, a reading position)
  covers. Its quote is looked for in the text blocks of its page (PDF; with the page before, where a
  paragraph cut by the page break starts) or of its chapter (EPUB: the document at `href`), the
  stored position being the hint between repeats. Without a quote: the block at the locator's
  progression, else the page's or chapter's first block.
- `locator_for(doc, index)`: a Locator v2 for an IR block, for "open the original here": its page or
  chapter, and its opening words as the quote the reader finds there.

The IR's text is not the reader's (running heads removed, hyphens joined, note markers dropped), so
the match is by the quote, fuzzy when it has to be, never by offsets.
"""

from __future__ import annotations

from typing import Any, Optional
from urllib.parse import unquote

from worker.tools.reader.ingest.ir import Document
from worker.tools.reader.locator import Quote, find_quote, normalize_text

# opening characters of a block that make the quote of locator_for
QUOTE_CHARS = 120


def _path(href: Any) -> str:
    return unquote(str(href or "")).split("#")[0].lstrip("/")


def _page(value: Any) -> Optional[int]:
    """A locator's 0-based page as the IR's 1-based one."""
    return value + 1 if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def _candidates(doc: Document, locator: dict[str, Any]) -> tuple[list[int], int]:
    """The text blocks to search, and the index (into them) where the locator's own page starts."""
    text_blocks = [i for i, b in enumerate(doc.blocks) if b.type != "figure" and b.text]
    if locator.get("format") == "pdf":
        page = _page(locator.get("page"))
        if page is None:
            return [], 0
        pages = {page} | {p for p in (_page(c.get("page")) for c in locator.get("continuation") or []
                                      if isinstance(c, dict)) if p}
        found = [i for i in text_blocks if doc.blocks[i].page in pages or doc.blocks[i].page == page - 1]
        own = next((n for n, i in enumerate(found) if doc.blocks[i].page in pages), 0)
        return found, own
    href = _path(locator.get("href"))
    return ([i for i in text_blocks if _path(doc.blocks[i].href) == href] if href else []), 0


def blocks_for(doc: Document, locator: dict[str, Any]) -> list[int]:
    """Indices of the IR blocks the locator covers, in order; [] when its text is not in the IR
    (a scanned page without OCR, a figure, a running head)."""
    candidates, own = _candidates(doc, locator)
    if not candidates:
        return []
    spans: list[tuple[int, int, int]] = []
    parts: list[str] = []
    at = 0
    for index in candidates:
        text = normalize_text(doc.blocks[index].text).strip()
        spans.append((at, at + len(text), index))
        parts.append(text)
        at += len(text) + 1
    text = " ".join(parts)

    quote = locator.get("quote") if isinstance(locator.get("quote"), dict) else None
    if quote and str(quote.get("exact") or "").strip():
        position = locator.get("position") if isinstance(locator.get("position"), dict) else {}
        start = position.get("start") if isinstance(position.get("start"), int) else None
        hint = spans[own][0] + start if start is not None else None
        match = find_quote(text, Quote(str(quote["exact"]), str(quote.get("prefix") or ""),
                                       str(quote.get("suffix") or "")), hint)
        if match is None:
            return []
        return [index for s, e, index in spans if s < match.end and e > match.start]

    progression = locator.get("progression")
    if isinstance(progression, (int, float)) and not isinstance(progression, bool) and 0 <= progression <= 1:
        offset = progression * len(text)
        return [next((index for s, e, index in spans if offset < e), spans[-1][2])]
    return [spans[own][2]]


def locator_for(doc: Document, index: int) -> dict[str, Any]:
    """A Locator v2 that opens the original at IR block `index`."""
    block = doc.blocks[index]
    locator: dict[str, Any] = {"v": 2, "format": "pdf" if block.page else "epub"}
    if block.page:
        locator["page"] = block.page - 1
        if doc.page_labels:
            locator["pageLabel"] = doc.page_label(block.page)
    else:
        locator["href"] = block.href
    exact = normalize_text(block.text).strip()
    if len(exact) > QUOTE_CHARS:
        exact = exact[:QUOTE_CHARS].rsplit(" ", 1)[0] or exact[:QUOTE_CHARS]
    if exact:
        locator["quote"] = {"exact": exact}
    return locator
