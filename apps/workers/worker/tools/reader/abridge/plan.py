"""The book's chapters as units of work, in reading order (docs/summarizer-investigation.md 8.4).

Top-down over the contents: a section that fits MAX_UNIT_WORDS is one unit with its subsections
inline (their headings kept as "## ..." lines, so tiny subsections are not lost); a bigger one, or a
part, becomes a divider and its children are planned in turn. Front and back matter is left out.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from worker.tools.reader.ingest.ir import SKIP_KINDS, Document, included
from worker.tools.reader.abridge.text import normalize_heading

MAX_UNIT_WORDS = 12_000
MIN_OWN_WORDS = 150


@dataclass
class Unit:
    id: str
    title: str
    level: int                       # 1 or 2, for the edition's contents
    kind: str                        # chapter | divider
    start: int
    end: int
    words: int = 0
    exclude: list[tuple[int, int]] = field(default_factory=list)   # nested sections left out (notes...)

    def to_json(self) -> dict:
        return {"id": self.id, "title": self.title, "level": self.level, "kind": self.kind, "start": self.start,
                "end": self.end, "words": self.words, "exclude": [list(r) for r in self.exclude]}

    @classmethod
    def from_json(cls, data: dict) -> "Unit":
        return cls(id=data["id"], title=data["title"], level=data["level"], kind=data["kind"], start=data["start"],
                   end=data["end"], words=data.get("words", 0), exclude=[tuple(r) for r in data.get("exclude", [])])


def _subtree_end(doc: Document, index: int) -> int:
    level = doc.sections[index].level
    for later in range(index + 1, len(doc.sections)):
        if doc.sections[later].level <= level:
            return later
    return len(doc.sections)


def _words(doc: Document, start: int, end: int, exclude: list[tuple[int, int]] = ()) -> int:
    return sum(b.words for i, b in enumerate(doc.blocks[start:end], start)
               if not any(a <= i < z for a, z in exclude))


def plan(doc: Document) -> list[Unit]:
    units: list[Unit] = []
    sections = doc.sections
    depth_base = min((s.level for s in sections), default=1)
    index = 0
    while index < len(sections):
        section = sections[index]
        subtree = _subtree_end(doc, index)
        if not included(section):
            index = subtree
            continue
        level = min(2, section.level - depth_base + 1)
        has_children = subtree > index + 1
        if section.kind == "part" or (has_children and section.words > MAX_UNIT_WORDS):
            own_end = sections[index + 1].start if has_children else section.end
            own = _words(doc, section.start, own_end)
            kind = "chapter" if own >= MIN_OWN_WORDS and section.kind != "part" else "divider"
            units.append(Unit(id=f"u{len(units) + 1}", title=section.title, level=level, kind=kind,
                              start=section.start, end=own_end if kind == "chapter" else section.start, words=own))
            index += 1
            continue
        exclude = [(s.start, s.end) for s in sections[index + 1:subtree] if s.kind in SKIP_KINDS]
        units.append(Unit(id=f"u{len(units) + 1}", title=section.title, level=level, kind="chapter",
                          start=section.start, end=section.end, words=_words(doc, section.start, section.end, exclude),
                          exclude=exclude))
        index = subtree
    # a divider followed by nothing of its own (all its chapters were left out), or by a chapter of the
    # same title (a title page over the chapter), is dropped
    return [u for i, u in enumerate(units)
            if u.kind != "divider" or (i + 1 < len(units) and units[i + 1].level > u.level
                                       and normalize_heading(units[i + 1].title) != normalize_heading(u.title))]


def unit_items(doc: Document, unit: Unit, markers: dict[str, str]) -> list[str]:
    """The unit's text as items: paragraphs, "## heading" lines, and figure markers (`markers`:
    figure id -> marker text, for the pictures the edition keeps)."""
    items: list[str] = []
    title = normalize_heading(unit.title)
    for index in range(unit.start, unit.end):
        if any(a <= index < z for a, z in unit.exclude):
            continue
        block = doc.blocks[index]
        if block.type == "figure":
            if block.figure in markers:
                items.append(markers[block.figure])
            continue
        if block.type == "heading":
            heading = normalize_heading(block.text)
            if not items and (heading == title or title.endswith(heading) or heading.endswith(title)):
                continue                                 # the unit's own title, printed by the edition
            items.append(f"## {block.text}")
            continue
        if block.text:
            items.append(block.text)
    while items and items[-1].startswith("## "):
        items.pop()
    return items


def figure_numbers_referenced(text: str) -> set[int]:
    """Numbers of the figures the text refers to: "Fig. 3", "figure 3", "рис. 3", "малюнок 3"."""
    pattern = r"\b(?:fig\.?|figure|plate|рис\.?|рисун\w*|мал\.?|малюн\w*|илл\.?|ілюстр\w*)\s*(\d+)"
    return {int(n) for n in re.findall(pattern, text, re.I)}
