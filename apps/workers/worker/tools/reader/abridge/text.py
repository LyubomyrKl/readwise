"""Text helpers: words, sentences, parts at paragraph boundaries, and cleaning what a model returns."""

from __future__ import annotations

import re
from typing import Iterable

from worker.tools.reader.ingest.ir import count_words

_SENTENCE = re.compile(r"(?<=[.!?…][»\"”’)\]])\s+|(?<=[.!?…])\s+")
# a period after these does not end a sentence ("Д. Чаплинський", "т. зв.", "J. M. Keynes", "Fig. 3")
_ABBREVIATIONS = {"т", "р", "рр", "ст", "с", "див", "напр", "проф", "акад", "св", "г", "гг", "им", "см", "ул", "вул",
                  "тис", "млн", "млрд", "e.g", "i.e", "mr", "mrs", "ms", "dr", "st", "prof", "vs", "etc", "fig", "рис",
                  "мал", "no", "vol", "pp", "p", "ed", "cf", "gen", "col", "lt", "sgt", "jr", "sr"}
_INITIAL = re.compile(r"(?:^|\s)[A-ZА-ЯЁЇІЄҐ]\.$")
FIGURE_MARKER = re.compile(r"\[\[\s*(?:FIG|РИС|МАЛ)\.?\s*(\d+)\s*(?::[^\]]*)?\]\]", re.I)
_PREAMBLE = re.compile(
    r"^\s*(here is|here's|below is|sure|certainly|okay|ok|of course|вот|ось|конечно|звісно)\b[^\n]{0,160}?:\s*$", re.I)
_LABEL = re.compile(r"^\s*(\*\*)?\s*(abridged( text| version| part)?|abridgement|summary|part \d+( of \d+)?"
                    r"|сокращ[её]нн\w+ (текст|версия)|скорочен\w+ (текст|версія)|резюме|краткое содержание"
                    r"|короткий зміст)\s*(\*\*)?\s*:?\s*$", re.I)
_TRAILER = re.compile(r"^\s*[\[(]?\s*(word count|words|слов|слів)\s*[:≈~]?\s*\d+.*$|^\s*\(?(note|примечание|примітка):",
                      re.I)


def words(text: str) -> int:
    return count_words(FIGURE_MARKER.sub(" ", text or ""))


def sentences(text: str) -> list[str]:
    out: list[str] = []
    for piece in _SENTENCE.split(text or ""):
        piece = (piece or "").strip()
        if not piece:
            continue
        if out:
            previous = out[-1]
            last = previous.rsplit(None, 1)[-1]
            if previous.endswith(".") and (_INITIAL.search(previous) or last.rstrip(".").lower() in _ABBREVIATIONS) \
                    or piece[:1].islower():
                out[-1] = f"{previous} {piece}"
                continue
        out.append(piece)
    return out


def last_sentences(text: str, n: int = 2) -> str:
    return " ".join(sentences(text)[-n:])


def split_parts(items: list[str], size: int = 1200, heading_break: int = 400) -> list[list[str]]:
    """Groups paragraphs into parts of about `size` words; a heading ("## ...") starts a new part once
    the current one has `heading_break` words; a short tail joins the part before it."""
    parts: list[list[str]] = []
    current: list[str] = []
    count = 0
    for item in items:
        n = words(item)
        is_heading = item.startswith("## ")
        if current and (count + n > size or (is_heading and count >= heading_break)):
            parts.append(current)
            current, count = [], 0
        current.append(item)
        count += n
    if current:
        if parts and count < size // 3 and not current[0].startswith("## "):
            parts[-1].extend(current)
        else:
            parts.append(current)
    return parts


def normalize_heading(text: str) -> str:
    return re.sub(r"[\W_]+", " ", text.lower()).strip()


def clean_output(text: str, headings: Iterable[str] = ()) -> str:
    """What the model was asked for, without fences, labels, preambles, word counts or stray headings.
    Lines starting with ## survive only when they are one of the part's own headings."""
    keep = {normalize_heading(h) for h in headings}
    text = (text or "").strip()
    text = re.sub(r"^```\w*\s*|\s*```$", "", text).strip()
    lines = text.split("\n")
    while lines and (not lines[0].strip() or _PREAMBLE.match(lines[0]) or _LABEL.match(lines[0])):
        lines.pop(0)
    while lines and (not lines[-1].strip() or _TRAILER.match(lines[-1])):
        lines.pop()
    out = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#"):
            title = stripped.lstrip("#").strip().strip("*").strip()
            if keep and normalize_heading(title) in keep:
                out.append(f"## {title}")
            continue
        if _LABEL.match(stripped):
            continue
        stripped = re.sub(r"^\*\*(.+)\*\*$", r"\1", stripped)
        out.append(stripped)
    cleaned = "\n".join(out)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned


def keep_whole_sentences(text: str) -> str:
    """A reply cut by the token cap ends mid-sentence: drop the unfinished one."""
    cut = max(text.rfind(". "), text.rfind("! "), text.rfind("? "), text.rfind(".\n"), text.rfind("…"),
              text.rfind(".»"), text.rfind(".\""))
    if text.rstrip().endswith((".", "!", "?", "…", "»", "\"", "”")):
        return text
    return text[:cut + 1].rstrip() if cut > 0 else text


def paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n|\n", text or "") if p.strip()]
