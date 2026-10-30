"""Pictures: size, decorative or informative (rules first), drop-cap letters.

Measured on the illustrated test book: 10 of 24 pictures in a slice were decorative, 6 of them drop
caps whose letter is missing from the text when the picture is dropped ("лагодаря"). The rules below
catch those without a model; doubtful pictures stay informative, so nothing important is lost.
"""

from __future__ import annotations

import hashlib
import io
import re
from collections import Counter
from typing import Iterable, Optional

from worker.tools.reader.ingest.ir import Figure

MIN_SIDE = 120              # px: smaller is an ornament, a bullet or a drop cap
RULE_ASPECT = 8.0           # a long thin strip is a divider
REPEATED = 3                # the same picture this many times is an ornament

DECORATIVE_ALT = re.compile(
    r"(декоративн|буквиц|\bбуква\b|орнамент|виньет|віньєт|заставк|концовк|прикрас|розділювач|разделител"
    r"|ornament|decorat|\binitial\b|dingbat|divider|separator|flourish|fleuron|vignette)", re.I)
_LETTER_IN_ALT = re.compile(r"(?:буква|буквица|буквиця|letter|initial)\s*[«\"'“]?\s*([A-Za-zА-Яа-яЁёЇїІіЄєҐґ])(?![\w])",
                            re.I)
_SINGLE_LETTER = re.compile(r"^\s*[«\"'“]?([A-ZА-ЯЁЇІЄҐ])[»\"'”]?\s*$")

MEDIA_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png", "GIF": "image/gif", "WEBP": "image/webp",
               "BMP": "image/bmp", "TIFF": "image/tiff"}


def digest(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def image_info(data: bytes, media_type: str = "") -> tuple[int, int, str]:
    """(width, height, media type) of image bytes; zeros when the bytes are not a readable image."""
    if media_type == "image/svg+xml" or data[:5] in (b"<?xml", b"<svg ") or b"<svg" in data[:200]:
        match = re.search(rb'<svg[^>]*?\bwidth="([\d.]+)[^"]*"[^>]*?\bheight="([\d.]+)', data[:2000])
        width, height = (int(float(match.group(1))), int(float(match.group(2)))) if match else (0, 0)
        return width, height, "image/svg+xml"
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as image:
            return image.width, image.height, MEDIA_TYPES.get(image.format or "", media_type or "image/png")
    except Exception:  # noqa: BLE001 - not an image Pillow reads: keep it, sizes unknown
        return 0, 0, media_type or "application/octet-stream"


def drop_cap_letter(alt: str) -> str:
    """The letter a drop-cap picture stands for, when its alt text names it ("буква Б", "Б")."""
    for pattern in (_LETTER_IN_ALT, _SINGLE_LETTER):
        match = pattern.search(alt or "")
        if match:
            return match.group(1).upper()
    return ""


def mark_decorative(figures: Iterable[Figure]) -> None:
    """Applies the rules to every figure; a figure already marked (cover, drop cap) keeps its reason."""
    figures = list(figures)
    counts = Counter(f.digest for f in figures if f.digest)
    for figure in figures:
        if figure.decorative:
            continue
        reason = decorative_reason(figure, counts.get(figure.digest, 0))
        if reason:
            figure.decorative, figure.reason = True, reason


def decorative_reason(figure: Figure, repeats: int = 1) -> Optional[str]:
    if figure.width and figure.height:
        if max(figure.width, figure.height) / max(1, min(figure.width, figure.height)) >= RULE_ASPECT:
            return "rule"
        if min(figure.width, figure.height) < MIN_SIDE:
            return "small"
    if DECORATIVE_ALT.search(figure.alt or "") and not figure.caption:
        return "ornament"
    if repeats >= REPEATED:
        return "repeated"
    return None
