"""PDF -> Document with PyMuPDF: outline or fonts for the structure, page furniture removed, pictures.

- Structure: the outline (bookmarks) when there is one; else headings recognized by size, weight and
  numbering (90-100% recall on the generated test PDFs), skipping the contents page; else equal parts.
- Running headers, footers and page numbers: lines in the top or bottom band that repeat across pages.
- Paragraphs: PyMuPDF's blocks, split at indents and short last lines, hyphenated words rejoined,
  a paragraph cut by a page break joined again.
- Pictures: raster images with their caption ("Fig. 3", "Рис. 3", "Малюнок 3"), the nearest one on
  the page rather than the first one.
- Pages without a usable text layer (scans, broken font encodings) are listed for OCR.

PyMuPDF is AGPL; acceptable for this private, self-hosted tool (docs/summarizer-investigation.md 16.2).
"""

from __future__ import annotations

import difflib
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional

import pymupdf

from worker.tools.reader.ingest import figures as figure_rules
from worker.tools.reader.ingest.ir import Block, Document, Figure, Section
from worker.tools.reader.ingest.language import detect_language
from worker.tools.reader.ingest.structure import equal_parts, finalize_sections, sections_from_headings

TEXT_FLAGS = (pymupdf.TEXT_PRESERVE_LIGATURES | pymupdf.TEXT_PRESERVE_WHITESPACE | pymupdf.TEXT_MEDIABOX_CLIP
              | pymupdf.TEXT_DEHYPHENATE)
TERMINAL = (".", "!", "?", "…", ":", ";", "»", "\"", "”", "’", ")")
FURNITURE_BAND = 0.08          # top and bottom share of the page where running heads live
NUMBERING = re.compile(r"^(chapter|part|book|section|appendix|глава|часть|книга|раздел|приложение|розділ|частина"
                       r"|додаток)\b|^[IVXLC]{1,6}\.?(\s|$)|^\d{1,2}\.\s+\S", re.I)
CAPTION = re.compile(r"^\s*(fig\.|figure|plate|table|map|chart|diagram|рис\.|рисунок|илл\.|табл\.|таблица|схема|карта"
                     r"|мал\.|малюнок|таблиця|діаграма)\s*[\dIVXLCА-Я]", re.I)
CONTENTS_LINE = re.compile(r"(\.{3,}|…{2,}|\s{2,})\s*\d{1,4}\s*$|\s\d{1,4}$")
JUNK_TITLES = re.compile(r"(microsoft word|untitled|latex|\.docx?$|\.pdf$|^document\d*$|^\s*$)", re.I)


@dataclass
class _Line:
    text: str
    size: float
    bold: bool
    bbox: tuple[float, float, float, float]


@dataclass
class _Para:
    text: str
    size: float
    bold: bool
    top: float
    bottom: float
    lines: int
    page: int
    heading: int = 0                 # 0 = body text, else the heading level


@dataclass
class _Page:
    number: int
    width: float
    height: float
    lines_by_block: list[list[_Line]] = field(default_factory=list)
    block_boxes: list[tuple[float, float, float, float]] = field(default_factory=list)
    chars: int = 0
    images: list[tuple[int, tuple[float, float, float, float], int, int, int]] = field(default_factory=list)
    needs_ocr: bool = False


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\d+", "#", text.lower())).strip()


def _join_lines(lines: list[_Line]) -> str:
    out = ""
    for line in lines:
        text = line.text.strip()
        if not text:
            continue
        if out.endswith(("-", "­")) and text[:1].islower():
            out = out.rstrip("-­") + text
        elif out:
            out += " " + text
        else:
            out = text
    return re.sub(r"\s+", " ", out.replace("­", "")).strip()


def _read_page(page: pymupdf.Page) -> _Page:
    result = _Page(number=page.number + 1, width=page.rect.width, height=page.rect.height)
    data = page.get_text("dict", flags=TEXT_FLAGS)
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        lines = []
        for line in block.get("lines", []):
            spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
            if not spans:
                continue
            text = "".join(s["text"] for s in line["spans"]).strip()
            size = max(s["size"] for s in spans)
            bold = all((s["flags"] & 16) or "bold" in s.get("font", "").lower() for s in spans)
            lines.append(_Line(text, round(size, 1), bold, tuple(line["bbox"])))
            result.chars += len(text)
        if lines:
            result.lines_by_block.append(lines)
            result.block_boxes.append(tuple(block["bbox"]))
    page_area = max(1.0, page.rect.width * page.rect.height)
    covered = 0.0
    for info in page.get_images(full=True):
        xref, width, height = info[0], info[2], info[3]
        try:
            rects = page.get_image_rects(xref)
        except Exception:  # noqa: BLE001 - a broken image reference: skip it
            continue
        for rect in rects[:1]:
            covered = max(covered, rect.get_area() / page_area)
            result.images.append((xref, (rect.x0, rect.y0, rect.x1, rect.y1), width, height, info[1]))
    letters = sum(1 for lines in result.lines_by_block for line in lines for ch in line.text if ch.isalpha())
    mojibake = sum(1 for lines in result.lines_by_block for line in lines for ch in line.text if "À" <= ch <= "ÿ")
    if result.chars < 40 and covered >= 0.3:
        result.needs_ocr = True                      # a scanned page
    elif letters >= 200 and mojibake / letters >= 0.3:
        result.needs_ocr = True                      # a text layer in a broken font encoding
    return result


def _page_labels(pdf: pymupdf.Document) -> list[str]:
    """The printed page labels (/PageLabels: "i", "ii", ... "1", "2"), or [] when the file defines none
    or they are just the page numbers."""
    try:
        if not pdf.get_page_labels():
            return []
        labels = [pdf[number].get_label() or "" for number in range(pdf.page_count)]
    except Exception:  # noqa: BLE001 - a broken label tree: the numbers will do
        return []
    return [] if all(label in ("", str(index + 1)) for index, label in enumerate(labels)) else labels


def _furniture(pages: list[_Page]) -> set[str]:
    """Normalized texts of lines repeated in the top or bottom band across pages (running heads, folios)."""
    if len(pages) < 4:
        return set()
    seen: Counter = Counter()
    for page in pages:
        keys = set()
        for lines in page.lines_by_block:
            for line in lines:
                if line.bbox[3] <= page.height * FURNITURE_BAND or line.bbox[1] >= page.height * (1 - FURNITURE_BAND):
                    keys.add(_norm(line.text))
        seen.update(keys)
    threshold = max(3, int(len(pages) * 0.2))
    return {key for key, count in seen.items() if count >= threshold}


def _is_furniture(line: _Line, page: _Page, furniture: set[str]) -> bool:
    in_band = line.bbox[3] <= page.height * FURNITURE_BAND or line.bbox[1] >= page.height * (1 - FURNITURE_BAND)
    if not in_band:
        return False
    key = _norm(line.text)
    return key in furniture or (len(line.text) <= 10 and re.fullmatch(r"[#\s\-–—.ivxlcIVXLC]+", key) is not None)


def _paragraphs(page: _Page, furniture: set[str]) -> list[_Para]:
    out: list[_Para] = []
    for lines, box in zip(page.lines_by_block, page.block_boxes):
        lines = [line for line in lines if not _is_furniture(line, page, furniture)]
        if not lines:
            continue
        left, right = min(line.bbox[0] for line in lines), max(line.bbox[2] for line in lines)
        width = max(1.0, right - left)
        current: list[_Line] = []

        def emit() -> None:
            if current:
                text = _join_lines(current)
                if text and any(ch.isalnum() for ch in text) and not text.isdigit():
                    out.append(_Para(text=text, size=max(l.size for l in current), bold=all(l.bold for l in current),
                                     top=current[0].bbox[1], bottom=current[-1].bbox[3], lines=len(current),
                                     page=page.number))

        for line in lines:
            if current:
                previous = current[-1]
                indent = line.bbox[0] - left
                short = previous.bbox[2] < right - 0.15 * width
                ends = previous.text.rstrip().endswith(TERMINAL)
                size_change = abs(line.size - previous.size) >= 1.0
                if size_change or (ends and (indent > 1.2 * max(6.0, line.size) or short)):
                    emit()
                    current = []
            current.append(line)
        emit()
    return out


def _body_size(paragraphs: list[_Para]) -> float:
    weights: Counter = Counter()
    for para in paragraphs:
        weights[para.size] += len(para.text)
    return weights.most_common(1)[0][0] if weights else 10.0


def _contents_pages(pages: list[_Page]) -> set[int]:
    """Pages that list titles with page numbers: their lines are not headings."""
    found = set()
    for page in pages[: max(1, min(len(pages), 40))]:
        lines = [line.text for block in page.lines_by_block for line in block]
        numbered = sum(1 for text in lines if CONTENTS_LINE.search(text))
        if len(lines) >= 5 and numbered >= 5 and numbered / len(lines) >= 0.4:
            found.add(page.number)
    return found


def _mark_font_headings(paragraphs: list[_Para], body: float, skip_pages: set[int], total_pages: int) -> int:
    candidates = []
    for index, para in enumerate(paragraphs):
        words = len(para.text.split())
        if para.page in skip_pages or not 1 <= words <= 16 or para.lines > 3:
            continue
        if total_pages > 20 and para.page == 1:
            continue                                   # the title page
        larger = para.size >= body * 1.15
        numbered = bool(NUMBERING.match(para.text))
        plain_end = not para.text.endswith((",", ";", "."))
        if larger or (para.bold and para.size >= body and words <= 12 and plain_end) \
                or (numbered and para.size >= body and words <= 12 and plain_end):
            candidates.append(index)
    # a page full of "headings" early in the book is its contents page
    per_page = Counter(paragraphs[i].page for i in candidates)
    early = max(3, int(total_pages * 0.15))
    candidates = [i for i in candidates if not (per_page[paragraphs[i].page] >= 6 and paragraphs[i].page <= early)]
    if len(candidates) < 2:
        return 0
    sizes = sorted({paragraphs[i].size for i in candidates}, reverse=True)
    for index in candidates:
        rank = sizes.index(paragraphs[index].size)
        paragraphs[index].heading = 1 if rank == 0 and len(sizes) > 1 else (2 if len(sizes) > 1 else 1)
    # stacked lines of one heading ("CHAPTER I" over "APPEARANCE AND REALITY") become one
    merged = 0
    for index in range(len(paragraphs) - 1, 0, -1):
        this, before = paragraphs[index], paragraphs[index - 1]
        if this.heading and before.heading and this.page == before.page and abs(this.size - before.size) < 0.6 \
                and this.top - before.bottom < this.size * 3:
            before.text = f"{before.text} {this.text}"
            before.bottom = this.bottom
            del paragraphs[index]
            merged += 1
    return len(candidates) - merged


def _merge_across_pages(paragraphs: list[_Para]) -> list[_Para]:
    out: list[_Para] = []
    for para in paragraphs:
        if out and not para.heading and not out[-1].heading and para.page == out[-1].page + 1 \
                and not out[-1].text.endswith(TERMINAL) and para.text[:1].islower():
            joined = out[-1].text.rstrip("-­") + para.text if out[-1].text.endswith(("-", "­")) \
                else f"{out[-1].text} {para.text}"
            out[-1].text = joined
            out[-1].bottom = para.bottom
            continue
        out.append(para)
    return out


def _figure_bytes(pdf: pymupdf.Document, xref: int, smask: int) -> tuple[bytes, str]:
    info = pdf.extract_image(xref)
    ext = (info.get("ext") or "").lower()
    if ext in ("jpeg", "jpg") and not smask:
        return info["image"], "image/jpeg"
    if ext == "png" and not smask:
        return info["image"], "image/png"
    pix = pymupdf.Pixmap(pdf, xref)
    if smask:
        try:
            pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(pdf, smask))
        except Exception:  # noqa: BLE001 - keep the picture without its transparency
            pass
    if pix.n - pix.alpha >= 4:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    return pix.tobytes("png"), "image/png"


def _caption_for(rect, paragraphs: list[_Para], height: float) -> Optional[int]:
    """Index (in `paragraphs`, one page) of the caption nearest to the picture, below first."""
    best, best_gap = None, height * 0.2
    for index, para in enumerate(paragraphs):
        if not CAPTION.match(para.text) or len(para.text.split()) > 80:
            continue
        gap = para.top - rect[3] if para.top >= rect[3] - 2 else rect[1] - para.bottom + height * 0.02
        if 0 <= gap < best_gap:
            best, best_gap = index, gap
    return best


def _outline_sections(doc: Document, paragraphs: list[_Para], outline: list, first_block_of_page: dict[int, int]
                      ) -> list[Section]:
    sections: list[Section] = []
    last = -1
    for level, title, page in outline:
        title = re.sub(r"\s+", " ", str(title)).strip()
        if not title or page < 1:
            continue
        start = first_block_of_page.get(page)
        if start is None:
            later = [i for p, i in first_block_of_page.items() if p > page]
            if not later:
                continue
            start = min(later)
        best = None
        for index in range(start, min(len(doc.blocks), start + 40)):
            block = doc.blocks[index]
            if block.page != page and index > start:
                break
            if block.type == "figure":
                continue
            text = block.text.lower()
            if text.startswith(title.lower()[:40]) or difflib.SequenceMatcher(None, text[:len(title) + 10],
                                                                               title.lower()).ratio() >= 0.75:
                best = index
                break
        position = best if best is not None else start
        if best is not None and doc.blocks[best].type == "paragraph" and len(doc.blocks[best].text) <= len(title) + 40:
            doc.blocks[best].type, doc.blocks[best].level = "heading", min(6, level)
        if position < last:
            continue
        sections.append(Section(id=f"s{len(sections) + 1}", title=title[:200], level=max(1, level), kind="",
                                start=position, end=position))
        last = position
    return sections


def _ocr_paragraphs(page: int, text: str, body: float) -> list[_Para]:
    """Paragraphs of a page read by OCR: blank lines separate them, "# " marks a heading."""
    out = []
    for chunk in re.split(r"\n\s*\n", text or ""):
        lines = [line.strip() for line in chunk.strip().splitlines() if line.strip()]
        if not lines:
            continue
        if lines[0].startswith("#"):
            out.append(_Para(text=lines[0].lstrip("#").strip(), size=round(body * 1.5, 1), bold=True, top=0, bottom=0,
                             lines=1, page=page))
            lines = lines[1:]
        if lines:
            joined = _join_lines([_Line(line, body, False, (0, 0, 0, 0)) for line in lines])
            if any(ch.isalnum() for ch in joined):
                out.append(_Para(text=joined, size=body, bold=False, top=0, bottom=0, lines=len(lines), page=page))
    return out


def read_pdf(data: bytes, sha256: str = "", mime: str = "application/pdf",
             ocr_text: Optional[dict[int, str]] = None) -> Document:
    """`ocr_text`: page -> text for pages without a usable text layer, read by a vision model."""
    pdf = pymupdf.open(stream=data, filetype="pdf")
    try:
        meta = pdf.metadata or {}
        title = (meta.get("title") or "").strip()
        author = (meta.get("author") or "").strip()
        doc = Document(sha256=sha256, mime=mime, size=len(data),
                       title="" if JUNK_TITLES.search(title) else title,
                       authors=[a.strip() for a in re.split(r"[;,&]| and ", author) if a.strip()] if author else [])
        doc.pages = pdf.page_count
        doc.page_labels = _page_labels(pdf)
        pages = [_read_page(page) for page in pdf]
        doc.ocr_pages = [page.number for page in pages if page.needs_ocr]
        furniture = _furniture(pages)
        page_paragraphs: dict[int, list[_Para]] = {}
        for page in pages:
            if not page.needs_ocr:
                page_paragraphs[page.number] = _paragraphs(page, furniture)
        body = _body_size([p for found in page_paragraphs.values() for p in found])
        for page in pages:
            if page.needs_ocr and ocr_text and ocr_text.get(page.number):
                page_paragraphs[page.number] = _ocr_paragraphs(page.number, ocr_text[page.number], body)
        if ocr_text:
            doc.warnings.append(f"{sum(1 for p in doc.ocr_pages if ocr_text.get(p))} pages read by OCR")
        paragraphs: list[_Para] = [p for number in sorted(page_paragraphs) for p in page_paragraphs[number]]
        outline = [entry for entry in pdf.get_toc(simple=True) if len(entry) >= 3]
        font_headings = 0
        if len(outline) < 2:
            font_headings = _mark_font_headings(paragraphs, body, _contents_pages(pages), len(pages))
        paragraphs = _merge_across_pages(paragraphs)

        # blocks, page by page, with the pictures placed after the text above them
        by_page: dict[int, list[_Para]] = {}
        for para in paragraphs:
            by_page.setdefault(para.page, []).append(para)
        first_block_of_page: dict[int, int] = {}
        for page in pages:
            page_paras = by_page.get(page.number, [])
            placed: list[tuple[int, Figure]] = []
            captions_used: set[int] = set()
            for xref, rect, width, height, smask in page.images:
                area = (rect[2] - rect[0]) * (rect[3] - rect[1]) / max(1.0, page.width * page.height)
                if page.needs_ocr or (area > 0.85 and page.chars > 200):
                    continue                               # a scan, or the background of a page with an OCR layer
                if min(width, height) < figure_rules.MIN_SIDE or area < 0.01:
                    continue
                try:
                    raw, media_type = _figure_bytes(pdf, xref, smask)
                except Exception as error:  # noqa: BLE001 - one unreadable picture does not stop the book
                    doc.warnings.append(f"page {page.number}: picture {xref} unreadable ({type(error).__name__})")
                    continue
                caption_index = _caption_for(rect, page_paras, page.height)
                caption = ""
                if caption_index is not None and caption_index not in captions_used:
                    caption = page_paras[caption_index].text
                    captions_used.add(caption_index)
                figure = Figure(id=f"f{len(doc.figures) + 1}", media_type=media_type, width=width, height=height,
                                caption=caption, digest=figure_rules.digest(raw), page=page.number, data=raw)
                doc.figures[figure.id] = figure
                above = sum(1 for para in page_paras if para.bottom <= rect[1] + 4)
                placed.append((above, figure))
            first_block_of_page[page.number] = len(doc.blocks)
            figures_by_slot: dict[int, list[Figure]] = {}
            for slot, figure in placed:
                figures_by_slot.setdefault(slot, []).append(figure)
            for index, para in enumerate(page_paras + [None]):  # type: ignore[list-item]
                for figure in figures_by_slot.get(index, []):
                    doc.blocks.append(Block(type="figure", figure=figure.id, page=page.number))
                if para is None or index in captions_used:
                    continue
                if para.heading:
                    doc.blocks.append(Block(type="heading", text=para.text, level=para.heading, page=para.page))
                else:
                    doc.blocks.append(Block(type="paragraph", text=para.text, page=para.page))
        figure_rules.mark_decorative(doc.figures.values())

        texts = [b.text for b in doc.blocks if b.type == "paragraph"]
        doc.language = detect_language("\n".join(texts[len(texts) // 5:]) or "\n".join(texts))

        sections: list[Section] = []
        if len(outline) >= 2:
            sections = _outline_sections(doc, paragraphs, outline, first_block_of_page)
            doc.structure_source = "outline"
        if len(sections) < 2 and font_headings >= 2:
            sections, doc.structure_source = sections_from_headings(doc), "headings"
        if len(sections) < 2:
            if not font_headings and len(outline) >= 2:
                doc.warnings.append("the outline did not match the text; split into equal parts")
            sections, doc.structure_source = equal_parts(doc), "pages"
        if not doc.blocks:
            doc.structure_source = "none"
        finalize_sections(doc, sections)
        return doc
    finally:
        pdf.close()


def render_page_png(data: bytes, page_number: int, dpi: int = 150) -> bytes:
    """One page as a PNG, for OCR by a vision model."""
    pdf = pymupdf.open(stream=data, filetype="pdf")
    try:
        page = pdf[page_number - 1]
        return page.get_pixmap(dpi=dpi).tobytes("png")
    finally:
        pdf.close()
