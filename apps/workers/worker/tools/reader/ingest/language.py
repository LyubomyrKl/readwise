"""Language of a text, by letters and function words: English, Russian or Ukrainian (modern books).

Deterministic and cheap. Ukrainian-only letters (і ї є ґ) against Russian-only ones (ы э ъ ё);
Latin script is English when English function words are frequent enough. Pre-1918 Russian also uses
"і" and would look Ukrainian; it is told apart by "ѣ" and word-final "ъ" (old books are out of scope,
but they are recognized rather than mislabeled).
"""

from __future__ import annotations

import re

LANGUAGE_NAMES = {"en": "English", "ru": "Russian", "uk": "Ukrainian"}

_UK_ONLY = re.compile(r"[іїєґІЇЄҐ]")
_RU_ONLY = re.compile(r"[ыэъёЫЭЪЁ]")
_OLD_RU = re.compile(r"[ѣѢѳѲѵѴ]|ъ\b")
_CYRILLIC = re.compile(r"[Ѐ-ӿ]")
_LATIN = re.compile(r"[A-Za-z]")
_EN_WORDS = re.compile(r"\b(the|and|of|to|in|is|that|it|was|for|with|as|on|be|by|this|which)\b", re.I)


def detect_language(text: str, sample: int = 60_000) -> str:
    """'en', 'ru', 'uk' or 'other' (another Latin-script language, or too little text)."""
    text = (text or "")[:sample]
    cyrillic, latin = len(_CYRILLIC.findall(text)), len(_LATIN.findall(text))
    if cyrillic + latin < 40:
        return "other"
    if cyrillic >= latin:
        uk, ru = len(_UK_ONLY.findall(text)), len(_RU_ONLY.findall(text))
        if _OLD_RU.search(text) and len(_OLD_RU.findall(text)) * 4 >= uk:
            return "ru"
        return "uk" if uk > ru else "ru"
    words = max(1, len(text.split()))
    return "en" if len(_EN_WORDS.findall(text)) / words >= 0.06 else "other"


def language_name(code: str) -> str:
    return LANGUAGE_NAMES.get(code, "the language of the source text")
