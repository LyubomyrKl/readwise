"""Deterministic checks of an abridged part, in milliseconds (docs/summarizer-investigation.md section 17).

- Length: inside a band around the part's target, else one retry that states the numbers.
- Language purity: no Russian letters or function words in Ukrainian, no Ukrainian letters in Russian.
- Mixed scripts: a Latin letter inside a Cyrillic word ("розгроmano"). Pure look-alikes (a, e, o, p,
  c, x, y, i...) are replaced; anything else goes to the sentence fix.
- Names and numbers: every capitalized name and every number should occur in the source. A near miss
  ("Вишнецького" for "Вишневецького") is replaced by the source's form; the rest is flagged, not
  changed (a derived number like "1796" from "nine years after 1787" can be right).
- Leftovers: labels and preambles a model sometimes adds ("Here is the abridged text:").
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field

from worker.tools.reader.abridge.text import FIGURE_MARKER

CYRILLIC = "А-Яа-яЁёЇїІіЄєҐґ"
RU_ONLY = re.compile(r"[ыэъё]", re.I)
UK_ONLY_IN_RU = re.compile(r"[іїєґ]", re.I)
RU_FUNCTION_WORDS = {"что", "это", "который", "которая", "которое", "которые", "когда", "если", "также", "только",
                     "после", "более", "очень", "ещё", "еще", "был", "была", "были", "его", "её", "она", "они", "мы",
                     "как", "чтобы", "или", "между", "однако"}
UK_WORDS_IN_RU = {"що", "це", "який", "яка", "які", "також", "тільки", "після", "дуже", "він", "вона", "вони", "ми",
                  "між", "однак", "проте", "щоб"}
_TOKEN = re.compile(rf"[{CYRILLIC}A-Za-z’'-]+")
_MIXED = re.compile(rf"\b[{CYRILLIC}A-Za-z’']*(?:[A-Za-z][{CYRILLIC}]|[{CYRILLIC}][A-Za-z])[{CYRILLIC}A-Za-z’']*\b")
HOMOGLYPHS = {"a": "а", "e": "е", "o": "о", "p": "р", "c": "с", "x": "х", "y": "у", "i": "і", "k": "к",
              "A": "А", "B": "В", "E": "Е", "K": "К", "M": "М", "H": "Н", "O": "О", "P": "Р", "C": "С", "T": "Т",
              "X": "Х", "I": "І"}
_CAPITALIZED = re.compile(r"\b[A-ZА-ЯЁЇІЄҐ][a-zа-яёїієґ’'-]{2,}")
_NUMBER = re.compile(r"\b\d{2,}\b")


def names(text: str) -> list[str]:
    """Capitalized words that are not the first word of a sentence or a line."""
    found = []
    for match in _CAPITALIZED.finditer(text):
        before = text[:match.start()].rstrip(" \t\u00a0«\"“'(—–-")
        if not before or before.endswith(("\n", ".", "!", "?", "…", ":", "[[")) or before[-1] in ".!?…:":
            continue
        found.append(match.group(0))
    return found


@dataclass
class Report:
    words: int
    ratio: float
    in_band: bool
    band: tuple[float, float]
    language: list[str] = field(default_factory=list)          # language purity problems (with examples)
    mixed_fixed: list[str] = field(default_factory=list)       # look-alike letters replaced
    mixed_unfixed: list[str] = field(default_factory=list)     # words for the sentence fix
    corrected: list[tuple[str, str]] = field(default_factory=list)  # (model's form, source's form)
    unsupported_names: list[str] = field(default_factory=list)
    unsupported_numbers: list[str] = field(default_factory=list)

    def flags(self) -> list[str]:
        out = []
        if not self.in_band:
            out.append(f"length {self.ratio:.0%} outside {self.band[0]:.0%}-{self.band[1]:.0%}")
        out += [f"language: {p}" for p in self.language]
        out += [f"mixed scripts: {w}" for w in self.mixed_unfixed]
        out += [f"name not in source: {n}" for n in self.unsupported_names]
        out += [f"number not in source: {n}" for n in self.unsupported_numbers]
        return out


def band(target: float) -> tuple[float, float]:
    """Accepted share of the part's words: around the target, never outside 10-60%."""
    return max(0.10, target * 0.55), min(0.60, target * 1.5 + 0.03)


def language_problems(text: str, lang: str) -> list[str]:
    lower = text.lower()
    tokens = _TOKEN.findall(lower)
    problems = []
    if lang == "uk":
        letters = sorted(set(RU_ONLY.findall(lower)))
        words = sorted({t for t in tokens if t in RU_FUNCTION_WORDS})
        if letters:
            examples = sorted({t for t in tokens if RU_ONLY.search(t)})[:5]
            problems.append(f"Russian letters {', '.join(letters)} in: {', '.join(examples)}")
        if len(words) >= 2:
            problems.append(f"Russian words: {', '.join(words[:6])}")
    elif lang == "ru":
        letters = sorted(set(UK_ONLY_IN_RU.findall(lower)))
        words = sorted({t for t in tokens if t in UK_WORDS_IN_RU})
        old = sorted({t for t in tokens if re.search(r"[ѣѳѵ]|[бвгджзклмнпрстфхцчшщ]ъ$", t)})
        if letters:
            examples = sorted({t for t in tokens if UK_ONLY_IN_RU.search(t)})[:5]
            problems.append(f"Ukrainian letters {', '.join(letters)} in: {', '.join(examples)}")
        if old:
            problems.append(f"pre-1918 spelling: {', '.join(old[:5])}")
        if len(words) >= 2:
            problems.append(f"Ukrainian words: {', '.join(words[:6])}")
    elif lang == "en":
        cyrillic = len(re.findall(rf"[{CYRILLIC}]", text))
        letters = max(1, len(re.findall(r"[A-Za-z]", text)))
        if cyrillic / letters > 0.05:
            problems.append("Cyrillic text in an English abridgement")
    return problems


def fix_mixed_scripts(text: str, lang: str) -> tuple[str, list[str], list[str]]:
    """Replaces Latin look-alikes inside Cyrillic words; returns (text, fixed, unfixed)."""
    if lang not in ("ru", "uk"):
        return text, [], []
    fixed, unfixed = [], []

    def repair(match: re.Match) -> str:
        word = match.group(0)
        cyrillic = sum(1 for ch in word if re.match(rf"[{CYRILLIC}]", ch))
        latin = [ch for ch in word if ch.isascii() and ch.isalpha()]
        if cyrillic < len(latin):
            return word                                  # a Latin word with one odd letter: leave it
        if all(ch in HOMOGLYPHS for ch in latin):
            mapping = dict(HOMOGLYPHS)
            if lang == "ru":
                mapping["i"], mapping["I"] = "и", "И"   # no "і" in Russian; the closest is a misprint anyway
            new = "".join(mapping.get(ch, ch) if ch.isascii() else ch for ch in word)
            fixed.append(f"{word} → {new}")
            return new
        unfixed.append(word)
        return word

    return _MIXED.sub(repair, text), fixed, unfixed


def names_and_numbers(source: str, output: str, lang: str = "") -> tuple[list[tuple[str, str]], list[str], list[str]]:
    """(corrections, unsupported names, unsupported numbers) of `output` against `source`.

    Inflection changes a name's ending, a slip changes its middle. So: the same word in the source is
    fine; a source name with the same first letter and the same ending that is at least 80% alike is
    the right spelling of a slip ("Вишнецький" -> "Вишневецький"); a source word sharing all but the
    last three letters is the name in another case; anything else is flagged.
    """
    source_tokens = set(_TOKEN.findall(source))
    lower_tokens = {t.lower() for t in source_tokens}
    capitalized = {t for t in source_tokens if t[:1].isupper() and len(t) >= 4}
    corrections, unsupported = [], []
    for name in sorted(set(names(output))):
        name = re.sub(r"[’']s$", "", name)
        lower = name.lower()
        if lower in lower_tokens:
            continue
        candidates = [t for t in capitalized if t[:1] == name[:1] and t[-2:].lower() == lower[-2:]]
        best = max(candidates, key=lambda t: difflib.SequenceMatcher(None, t.lower(), lower).ratio(), default=None)
        if best and difflib.SequenceMatcher(None, best.lower(), lower).ratio() >= 0.8:
            if not language_problems(best, lang):   # never bring back a spelling the language rule forbids
                corrections.append((name, best))
            continue
        prefix = lower[:max(4, len(lower) - 3)]
        if any(t.startswith(prefix) for t in lower_tokens):
            continue
        unsupported.append(name)
    source_numbers = set(_NUMBER.findall(source))
    numbers = sorted({n for n in _NUMBER.findall(output) if n not in source_numbers})
    return corrections, unsupported, numbers


def apply_corrections(text: str, corrections: list[tuple[str, str]]) -> str:
    for wrong, right in corrections:
        text = re.sub(rf"(?<![\w-]){re.escape(wrong)}(?![\w-])", right, text)
    return text


def check_part(source: str, output: str, lang: str, target: float, source_words: int, output_words: int) -> Report:
    ratio = output_words / max(1, source_words)
    low, high = band(target)
    return Report(words=output_words, ratio=round(ratio, 3), in_band=low <= ratio <= high, band=(round(low, 3), round(high, 3)),
                  language=language_problems(output, lang))


def repair(source: str, output: str, lang: str, report: Report) -> str:
    """The deterministic fixes: look-alike letters and near-miss names; fills the report's flags."""
    output, report.mixed_fixed, report.mixed_unfixed = fix_mixed_scripts(output, lang)
    corrections, report.unsupported_names, report.unsupported_numbers = names_and_numbers(
        source, FIGURE_MARKER.sub(" ", output), lang)
    report.corrected = corrections
    return apply_corrections(output, corrections)
