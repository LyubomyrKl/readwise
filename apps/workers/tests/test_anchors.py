"""Locators and IR blocks both ways: a highlight made in the reader finds its block in the IR, and an IR
block gives a locator that opens the original there. The real-book cases run when READER_BOOKS
points at a folder with the books and an anchors.json of locators saved by the browser tests."""
import json
import os
from pathlib import Path

import pytest

from books import sample_epub, sample_pdf
from worker.tools.reader.ingest.anchors import blocks_for, locator_for
from worker.tools.reader.ingest.epub_reader import read_epub
from worker.tools.reader.ingest.ir import Block, Document
from worker.tools.reader.ingest.pdf_reader import read_pdf
from worker.tools.reader.locator import build_quote, normalize_text


def reader_locator(doc: Document, index: int, start: int, end: int, **fields) -> dict:
    """What the reader stores for a selection of [start, end) inside block `index`: the quote with
    context from the text it shows (here the page's or chapter's blocks), and its position."""
    block = doc.blocks[index]
    same = [b for b in doc.blocks if b.type != "figure" and b.text
            and ((b.page and b.page == block.page) or (b.href and b.href == block.href))]
    texts = [normalize_text(b.text).strip() for b in same]
    offset = sum(len(t) + 1 for t in texts[:same.index(block)]) + start
    quote, s, e = build_quote(" ".join(texts), offset, offset + (end - start))
    base = {"v": 2, "format": "pdf", "page": block.page - 1} if block.page else {"v": 2, "format": "epub", "href": block.href}
    return {**base, "quote": {"exact": quote.exact, "prefix": quote.prefix, "suffix": quote.suffix},
            "position": {"start": s, "end": e}, **fields}


@pytest.fixture(scope="module")
def pdf() -> Document:
    return read_pdf(sample_pdf(), sha256="pdf")


@pytest.fixture(scope="module")
def book() -> Document:
    return read_epub(sample_epub(), sha256="epub")


def _paragraphs(doc: Document, **where) -> list[int]:
    return [i for i, b in enumerate(doc.blocks) if b.type == "paragraph"
            and all(getattr(b, k) == v for k, v in where.items())]


def test_a_pdf_highlight_finds_its_paragraph_among_repeated_sentences(pdf):
    # the sample's paragraphs repeat one sentence: the context and the position decide
    for index in _paragraphs(pdf, page=2):
        assert blocks_for(pdf, reader_locator(pdf, index, 40, 90)) == [index]


def test_an_epub_highlight_finds_its_paragraph_by_chapter_and_quote(book):
    chapter = next(b.href for b in book.blocks if b.type == "heading" and b.text.startswith("Chapter 2"))
    for index in _paragraphs(book, href=chapter):
        assert blocks_for(book, reader_locator(book, index, 10, 70)) == [index]
    # the chapter as the reader names it: a fragment or escaped characters change nothing
    index = _paragraphs(book, href=chapter)[1]
    located = reader_locator(book, index, 10, 70)
    assert blocks_for(book, {**located, "href": chapter.replace(".xhtml", "%2Exhtml") + "#c2"}) == [index]


def test_a_selection_over_two_paragraphs_covers_both(pdf):
    first, second = _paragraphs(pdf, page=1)[:2]
    length = len(normalize_text(pdf.blocks[first].text).strip())
    located = reader_locator(pdf, first, length - 30, length + 1 + 25)
    assert blocks_for(pdf, located) == [first, second]


def test_a_paragraph_continued_from_the_previous_page_is_found_on_its_second_page():
    doc = Document(sha256="x", mime="application/pdf", size=1, blocks=[
        Block(type="paragraph", text="The storm came in the night and broke the old pier", page=3),
        Block(type="paragraph", text="that the town had built in 1890, and nobody was on it.", page=3),
        Block(type="paragraph", text="In the morning the engineers counted the damage.", page=4),
    ])
    # on page 4 the reader shows the end of the paragraph that the IR keeps on page 3
    located = {"v": 2, "format": "pdf", "page": 3, "quote": {"exact": "nobody was on it."}}
    assert blocks_for(doc, located) == [1]


def test_text_that_differs_a_little_is_still_found(pdf):
    index = _paragraphs(pdf, page=4)[-1]
    text = normalize_text(pdf.blocks[index].text)
    assert "long report about the storm." in text
    # the reader's text layer keeps the hyphen the IR joined
    located = {"v": 2, "format": "pdf", "page": 3, "quote": {"exact": "wrote a long re- port about the storm"}}
    assert blocks_for(pdf, located) == [index]


def test_without_a_quote_the_progression_or_the_page_start_decides(pdf, book):
    page_two = _paragraphs(pdf, page=2)
    assert blocks_for(pdf, {"v": 2, "format": "pdf", "page": 1}) == [i for i, b in enumerate(pdf.blocks)
                                                                       if b.page == 2 and b.text][:1]
    chapter = next(b.href for b in book.blocks if b.type == "heading" and b.text.startswith("Chapter 2"))
    last = [i for i, b in enumerate(book.blocks) if b.href == chapter and b.text][-1]
    assert blocks_for(book, {"v": 2, "format": "epub", "href": chapter, "progression": 0.999}) == [last]
    assert page_two


def test_text_that_is_not_in_the_ir_maps_to_nothing(pdf, book):
    assert blocks_for(pdf, {"v": 2, "format": "pdf", "page": 0, "quote": {"exact": "A TEST BOOK"}}) == []
    assert blocks_for(pdf, {"v": 2, "format": "pdf", "page": 40, "quote": {"exact": "harbour"}}) == []
    assert blocks_for(book, {"v": 2, "format": "epub", "href": "OEBPS/missing.xhtml", "quote": {"exact": "x"}}) == []
    assert blocks_for(book, {"v": 2, "format": "epub"}) == []


def test_locator_for_a_block_leads_back_to_it(pdf, book):
    for doc in (pdf, book):
        for index, block in enumerate(doc.blocks):
            if block.type == "figure" or not block.text:
                continue
            located = locator_for(doc, index)
            assert len(located["quote"]["exact"]) <= 120
            found = blocks_for(doc, located)
            # paragraphs that open with the same words: the first one is as good a place to open
            assert found and normalize_text(doc.blocks[found[0]].text).startswith(located["quote"]["exact"])
    first_pdf = next(i for i, b in enumerate(pdf.blocks) if b.text)
    assert locator_for(pdf, first_pdf) == {"v": 2, "format": "pdf", "page": 0, "quote": {"exact": "Chapter One"}}
    first_epub = next(i for i, b in enumerate(book.blocks) if b.text)
    assert set(locator_for(book, first_epub)) == {"v", "format", "href", "quote"}

def test_locator_for_a_labelled_pdf_page_carries_the_label():
    doc = read_pdf(sample_pdf(page_labels=True), sha256="pdf")
    index = _paragraphs(doc, page=3)[0]
    assert locator_for(doc, index)["pageLabel"] == "1"


# ---- real books, opt-in ------------------------------------------------------------------------

BOOKS = Path(os.environ.get("READER_BOOKS", "/nonexistent"))
ANCHORS = BOOKS / "anchors.json"


@pytest.mark.skipif(not ANCHORS.exists(), reason="READER_BOOKS has no anchors.json")
def test_highlights_saved_by_the_browser_find_their_blocks_in_real_books():
    anchors: dict[str, list[dict]] = json.loads(ANCHORS.read_text())
    checked = 0
    for name, locators in anchors.items():
        data = (BOOKS / name).read_bytes()
        doc = read_pdf(data, sha256=name) if name.endswith(".pdf") else read_epub(data, sha256=name)
        for located in locators:
            exact = normalize_text(located["quote"]["exact"]).strip()
            found = blocks_for(doc, located)
            if not found and len(exact) <= 4 and exact.isdigit():
                continue                                   # a page number: running furniture is not in the IR
            text = normalize_text(" ".join(doc.blocks[i].text for i in found))
            words = exact.split()
            assert found, f"{name}: no block for {exact[:40]!r}"
            assert sum(w in text for w in words) >= 0.8 * len(words), f"{name}: {found} does not hold {exact[:40]!r}"
            checked += 1
    print(f"{checked} real highlights found their blocks")
    assert checked
