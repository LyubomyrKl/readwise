"""The document IR: what every later step reads instead of the file.

Blocks in reading order (headings, paragraphs, quotes, list items, tables, figures), sections that
point into the block list (the book's own table of contents when it has one), and the pictures with
what is known about them. Stored gzipped in the extractions bucket under the file's SHA-256, so the
same file uploaded twice is parsed once.
"""

from __future__ import annotations

import gzip
import json
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

IR_VERSION = 1

# Kinds of section the edition leaves out (front and back matter that is not the author's text).
SKIP_KINDS = frozenset({
    "cover", "title", "toc", "copyright", "dedication", "index", "bibliography", "notes",
    "acknowledgments", "about", "also_by", "praise", "glossary", "colophon", "license",
})

# A section shorter than this is a title page or a stray heading, not something to abridge.
MIN_SECTION_WORDS = 40
# Untitled matter before the first entry of the contents goes in only when it is substantial.
MIN_FRONT_WORDS = 1000

_WORD = re.compile(r"\w+(?:[-’']\w+)*", re.UNICODE)


def count_words(text: str) -> int:
    return len(_WORD.findall(text or ""))


def ir_prefix(sha256: str) -> str:
    return f"ir/{sha256}/"


def ir_key(sha256: str) -> str:
    return f"{ir_prefix(sha256)}ir-v{IR_VERSION}.json.gz"


def structure_key(sha256: str) -> str:
    return f"{ir_prefix(sha256)}structure-v{IR_VERSION}.json"


@dataclass
class Block:
    type: str                       # heading | paragraph | quote | item | table | pre | figure
    text: str = ""
    level: int = 0                  # headings: 1..6
    figure: Optional[str] = None    # type figure: the figure id
    page: Optional[int] = None      # PDF: 1-based page
    href: Optional[str] = None      # EPUB: document inside the container

    @property
    def words(self) -> int:
        return 0 if self.type == "figure" else count_words(self.text)


@dataclass
class Figure:
    id: str
    media_type: str
    width: int
    height: int
    alt: str = ""
    caption: str = ""
    digest: str = ""                # sha1 of the bytes: a picture repeated many times is an ornament
    decorative: bool = False
    reason: str = ""                # why decorative: small, repeated, ornament, rule, drop-cap, cover, background
    drop_cap: str = ""              # the letter a drop-cap picture stands for, restored to its paragraph
    key: str = ""                   # object key of the bytes in the extractions bucket
    page: Optional[int] = None
    data: bytes = field(default=b"", repr=False, compare=False)  # not serialized

    @property
    def extension(self) -> str:
        return {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
                "image/svg+xml": "svg", "image/bmp": "bmp", "image/tiff": "tif"}.get(self.media_type, "bin")


@dataclass
class Section:
    id: str
    title: str
    level: int                      # 1 = top level of the book's contents
    kind: str                       # chapter | part | front | appendix | one of SKIP_KINDS
    start: int                      # first block index
    end: int                        # one past the last block (children included)
    words: int = 0                  # words of [start, end)
    figures: int = 0


def included(section: "Section") -> bool:
    """Whether the edition has this section: parts as dividers, the author's text when not too short."""
    if section.kind in SKIP_KINDS:
        return False
    if section.kind == "part":
        return True
    if section.kind == "front":
        return section.words >= MIN_FRONT_WORDS
    return section.words >= MIN_SECTION_WORDS


@dataclass
class Document:
    sha256: str
    mime: str
    size: int
    title: str = ""
    authors: list[str] = field(default_factory=list)
    language: str = "en"
    blocks: list[Block] = field(default_factory=list)
    sections: list[Section] = field(default_factory=list)
    figures: dict[str, Figure] = field(default_factory=dict)
    cover: str = ""                 # figure id of the cover picture, when the file names one
    structure_source: str = ""      # toc | outline | headings | documents | pages | none
    pages: int = 0                  # PDF page count
    ocr_pages: list[int] = field(default_factory=list)  # PDF pages without a usable text layer
    warnings: list[str] = field(default_factory=list)

    # ---- derived ---------------------------------------------------------------------------

    @property
    def words(self) -> int:
        return sum(b.words for b in self.blocks)

    def text_of(self, start: int, end: int) -> str:
        return "\n\n".join(b.text for b in self.blocks[start:end] if b.type != "figure" and b.text)

    def finish_sections(self) -> None:
        """Fills in each section's end, word and figure counts from the block list."""
        total = len(self.blocks)
        for index, section in enumerate(self.sections):
            end = total
            for later in self.sections[index + 1:]:
                if later.level <= section.level:
                    end = later.start
                    break
            section.end = max(section.start, end)
            blocks = self.blocks[section.start:section.end]
            section.words = sum(b.words for b in blocks)
            section.figures = sum(1 for b in blocks if b.type == "figure" and b.figure in self.figures
                                  and not self.figures[b.figure].decorative)

    def structure(self) -> dict[str, Any]:
        """The small view the API serves: contents, sizes, kinds, language."""
        return {
            "irVersion": IR_VERSION,
            "sha256": self.sha256,
            "title": self.title,
            "authors": self.authors,
            "language": self.language,
            "words": self.words,
            "pages": self.pages,
            "structureSource": self.structure_source,
            "figures": len(self.figures),
            "informativeFigures": sum(1 for f in self.figures.values() if not f.decorative),
            "ocrPages": len(self.ocr_pages),
            "sections": [{"id": s.id, "title": s.title, "level": s.level, "kind": s.kind,
                          "words": s.words, "figures": s.figures,
                          "included": included(s)} for s in self.sections],
            "warnings": self.warnings[:20],
        }

    # ---- serialization ---------------------------------------------------------------------

    def to_json(self) -> dict[str, Any]:
        figures = {}
        for fid, figure in self.figures.items():
            data = asdict(figure)
            data.pop("data", None)
            figures[fid] = data
        return {
            "irVersion": IR_VERSION,
            "source": {"sha256": self.sha256, "mime": self.mime, "bytes": self.size},
            "meta": {"title": self.title, "authors": self.authors, "language": self.language},
            "structureSource": self.structure_source,
            "cover": self.cover,
            "pages": self.pages,
            "ocrPages": self.ocr_pages,
            "warnings": self.warnings,
            "sections": [asdict(s) for s in self.sections],
            "blocks": [{k: v for k, v in asdict(b).items() if v not in (None, "", 0) or k == "type"}
                       for b in self.blocks],
            "figures": figures,
        }

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "Document":
        source, meta = data.get("source", {}), data.get("meta", {})
        return cls(
            sha256=source.get("sha256", ""), mime=source.get("mime", ""), size=source.get("bytes", 0),
            title=meta.get("title", ""), authors=list(meta.get("authors", [])), language=meta.get("language", "en"),
            blocks=[Block(**b) for b in data.get("blocks", [])],
            sections=[Section(**s) for s in data.get("sections", [])],
            figures={fid: Figure(**f) for fid, f in data.get("figures", {}).items()},
            cover=data.get("cover", ""), structure_source=data.get("structureSource", ""), pages=data.get("pages", 0),
            ocr_pages=list(data.get("ocrPages", [])), warnings=list(data.get("warnings", [])),
        )

    def dumps(self) -> bytes:
        return gzip.compress(json.dumps(self.to_json(), ensure_ascii=False).encode("utf-8"), compresslevel=6)

    @classmethod
    def loads(cls, raw: bytes) -> "Document":
        return cls.from_json(json.loads(gzip.decompress(raw).decode("utf-8")))
