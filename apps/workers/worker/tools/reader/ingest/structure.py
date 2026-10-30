"""Sections when the file has no usable contents, and the finishing pass every reader shares."""

from __future__ import annotations

from worker.tools.reader.ingest.classify import is_part_title, kind_of
from worker.tools.reader.ingest.ir import Document, Section, count_words

PART_WORDS = {"en": "Part", "ru": "Часть", "uk": "Частина"}


def sections_from_headings(doc: Document) -> list[Section]:
    levels = sorted({b.level for b in doc.blocks if b.type == "heading"})
    if not levels:
        return []
    counts = {level: sum(1 for b in doc.blocks if b.type == "heading" and b.level == level) for level in levels}
    usable = [level for level in levels if counts[level] >= 2] or levels
    top = usable[:2]
    sections = []
    for index, block in enumerate(doc.blocks):
        if block.type == "heading" and block.level in top:
            sections.append(Section(id=f"s{len(sections) + 1}", title=block.text[:200], level=top.index(block.level) + 1,
                                    kind="", start=index, end=index))
    return sections


def equal_parts(doc: Document, size: int = 3000) -> list[Section]:
    """No structure at all: parts of about `size` words at paragraph boundaries."""
    sections, start, words = [], 0, 0
    word = PART_WORDS.get(doc.language, "Part")
    for index, block in enumerate(doc.blocks):
        words += block.words
        if words >= size and index + 1 < len(doc.blocks):
            sections.append(Section(id=f"s{len(sections) + 1}", title=f"{word} {len(sections) + 1}", level=1,
                                    kind="chapter", start=start, end=index + 1))
            start, words = index + 1, 0
    if start < len(doc.blocks):
        if sections and words < size // 3:
            sections[-1].end = len(doc.blocks)
        else:
            sections.append(Section(id=f"s{len(sections) + 1}", title=f"{word} {len(sections) + 1}", level=1,
                                    kind="chapter", start=start, end=len(doc.blocks)))
    return sections


def finalize_sections(doc: Document, sections: list[Section]) -> None:
    """Leading untitled matter, end positions, counts and kinds (shared with the PDF reader)."""
    if sections and sections[0].start > 0:
        lead = doc.blocks[:sections[0].start]
        heading = next((b.text for b in lead if b.type == "heading"), "") or doc.title or next(
            (b.text for b in lead if b.type == "paragraph" and 2 <= count_words(b.text) <= 15), "")
        sections.insert(0, Section(id="s0", title=heading[:200] or "—", level=1, kind="front",
                                   start=0, end=sections[0].start))
    doc.sections = sections
    doc.finish_sections()
    for index, section in enumerate(doc.sections):
        nested = index + 1 < len(doc.sections) and doc.sections[index + 1].level > section.level \
            and doc.sections[index + 1].start < section.end
        own_end = doc.sections[index + 1].start if nested else section.end
        own_text = doc.text_of(section.start, own_end)
        hint = section.kind if section.kind not in ("", "front", "chapter") else ""
        kind = kind_of(section.title, hint, own_text[:6000], count_words(own_text))
        if kind == "chapter" and section.kind == "front":
            kind = "front"
        if kind in ("chapter", "front") and nested and count_words(own_text) < 150:
            kind = "part"
        elif kind == "chapter" and is_part_title(section.title) and count_words(own_text) < 150:
            kind = "part"
        section.kind = kind
    # everything after a licence (Project Gutenberg's, at the very end) belongs to it
    licence = next((i for i, s in enumerate(doc.sections) if s.kind == "license"), None)
    if licence is not None:
        for section in doc.sections[licence + 1:]:
            section.kind = "license"
