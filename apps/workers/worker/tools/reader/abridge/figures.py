"""Pictures in the edition: which ones, their descriptions, and their place in the abridged text.

An informative picture enters its part as "[[FIG n: caption — description]]"; the model keeps the short
marker "[[FIG n]]" where the picture belongs (14 of 14 in the demo), and a marker it dropped is put
back at the same relative position, so no kept picture is lost.
"""

from __future__ import annotations

import io
import re

from worker.tools.reader.ingest.ir import Document, Figure
from worker.tools.reader.abridge.text import FIGURE_MARKER, paragraphs

KEY_MIN_SIDE = 300       # a big picture is kept as a key figure even without a caption


def selected(doc: Document, mode: str, referenced: set[int] | None = None) -> list[Figure]:
    """Informative pictures in reading order: all of them, or the key ones (captioned, described by their
    alt text, referenced by the text, or large)."""
    order = [b.figure for b in doc.blocks if b.type == "figure" and b.figure in doc.figures]
    seen: set[str] = set()
    out = []
    for fid in order:
        figure = doc.figures[fid]
        if fid in seen or figure.decorative or figure.media_type == "image/svg+xml" and not figure.key:
            continue
        seen.add(fid)
        if mode == "none":
            continue
        if mode == "all" or is_key(figure, referenced or set()):
            out.append(figure)
    return out


def is_key(figure: Figure, referenced: set[int]) -> bool:
    number = re.search(r"(\d+)", figure.caption or "")
    return bool(figure.caption) or len((figure.alt or "").split()) >= 3 \
        or (number is not None and int(number.group(1)) in referenced) \
        or (figure.width >= KEY_MIN_SIDE and figure.height >= KEY_MIN_SIDE)


def label(figure: Figure) -> str:
    return (figure.caption or figure.alt or "").strip()


def marker(number: int, figure: Figure, description: str) -> str:
    text = " — ".join(part for part in (label(figure), description.strip()) if part)
    return f"[[FIG {number}: {text}]]" if text else f"[[FIG {number}]]"


def for_vision(data: bytes, max_side: int = 1024) -> bytes:
    """A smaller PNG or JPEG for the vision model (faster, same answer)."""
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as image:
            if max(image.size) <= max_side and image.format in ("PNG", "JPEG"):
                return data
            image = image.convert("RGB")
            image.thumbnail((max_side, max_side))
            out = io.BytesIO()
            image.save(out, format="JPEG", quality=88)
            return out.getvalue()
    except Exception:  # noqa: BLE001 - not readable by Pillow: send as is
        return data


def place(output: str, expected: list[int], source_items: list[str]) -> tuple[str, list[int]]:
    """The output with exactly one "[[FIG n]]" line per expected picture: duplicates and unknown markers
    removed, missing ones inserted at the picture's relative position in the source. Returns (text, put back)."""
    lines = paragraphs(output)
    seen: set[int] = set()
    kept: list[str] = []
    for line in lines:
        match = FIGURE_MARKER.fullmatch(line.strip())
        if match:
            number = int(match.group(1))
            if number in expected and number not in seen:
                seen.add(number)
                kept.append(f"[[FIG {number}]]")
            continue
        inline = [int(n) for n in FIGURE_MARKER.findall(line)]
        text = FIGURE_MARKER.sub("", line).strip()
        if text:
            kept.append(re.sub(r"\s{2,}", " ", text))
        for number in inline:
            if number in expected and number not in seen:
                seen.add(number)
                kept.append(f"[[FIG {number}]]")
    missing = [n for n in expected if n not in seen]
    if missing:
        positions = {}
        for index, item in enumerate(source_items):
            found = FIGURE_MARKER.match(item.strip())
            if found:
                positions[int(found.group(1))] = index / max(1, len(source_items))
        for number in missing:
            share = positions.get(number, 1.0)
            text_lines = [i for i, line in enumerate(kept) if not FIGURE_MARKER.fullmatch(line)]
            at = len(kept) if not text_lines else text_lines[min(len(text_lines) - 1, int(share * len(text_lines)))] + 1
            kept.insert(at, f"[[FIG {number}]]")
    return "\n\n".join(kept), missing
