"""Deterministic density score of a part -> its word target.

No model involved: asked to judge their own parts, Gemma 4 called every part NORMAL and Qwen 3.6 called
most of them DENSE (Appendix B). Countable features, each scaled to 0..1, a weighted sum, then a
linear map onto the length band. With the "standard" length, round 3 landed at 26-36% against
27-39% targets and the owner rated the lengths right.

The abstract-noun feature (-tion/-ity, -ость/-ние, -ість/-ння) is new: the score under-rated
abstract philosophy, which has few names and numbers. It only adds to the score (at most about five
points of target), so text the owner already rated keeps its lengths.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_WORD = re.compile(r"[A-Za-zА-Яа-яІіЇїЄєҐґЁё’'-]+")
LONG_WORD = {"en": 8, "ru": 9, "uk": 9}
REASONING = {
    "en": r"\b(therefore|thus|hence|because|however|consequently|that is|i\.e\.|means|is called|defined"
          r"|in other words|it follows)\b",
    "ru": r"(следовательно|поэтому|потому что|так как|однако|то есть|т\. е\.|означает|называется|иными словами|отсюда)",
    "uk": r"(отже|тому що|оскільки|однак|проте|тобто|означає|називається|іншими словами|звідси)",
}
ABSTRACT = {
    "en": r"\b[a-z]{3,}(?:tion|sion|ity|ness|ism|ment|ence|ance|ship|hood)s?\b",
    "ru": r"\b[а-яё]{3,}(?:ость|ости|ние|ния|нию|нием|ство|ства|изм|изма|ация|ации)\b",
    "uk": r"\b[а-яіїєґ’']{3,}(?:ість|ості|ння|нню|нням|ство|ства|ізм|ізму|ація|ації)\b",
}
WEIGHTS = {"facts": 0.30, "complexity": 0.25, "reasoning": 0.20, "distinct": 0.25, "dialogue": -0.35, "abstract": 0.15}

# length setting -> (target at score 0, target at score 1); "standard" is the owner's 15-35% (up to 50%)
LENGTHS = {"short": (0.12, 0.38), "standard": (0.15, 0.50), "long": (0.20, 0.55)}


@dataclass
class Density:
    score: float
    target: float
    features: dict
    scaled: dict

    @property
    def facts_per_100_words(self) -> float:
        return self.features["facts"]


def _stems(text: str) -> set[str]:
    return {w.lower()[:6] for w in _WORD.findall(text) if len(w) >= 5}


def features(part: str, other_parts: list[str], lang: str) -> dict:
    lang = lang if lang in LONG_WORD else "en"
    tokens = _WORD.findall(part)
    n = max(1, len(tokens))
    sentences = [s for s in re.split(r"(?<=[.!?…])\s+", part) if _WORD.search(s)]
    numbers = len(re.findall(r"\b\d[\d.,]*\b", part))
    names = sum(sum(1 for t in _WORD.findall(s)[1:] if t[:1].isupper()) for s in sentences)
    lines = [p for p in part.split("\n") if p.strip()]
    spoken = sum(len(p) for p in lines if p.lstrip()[:1] in "—–-")
    quoted = sum(len(q) for q in re.findall(r"«[^»]{1,400}»|“[^”]{1,400}”|\"[^\"]{1,400}\"", part))
    own = _stems(part)
    others = set().union(*(_stems(p) for p in other_parts)) if other_parts else set()
    return {
        "facts": (numbers + names) / n * 100,
        "sentence": n / max(1, len(sentences)),
        "long": sum(len(w) >= LONG_WORD[lang] for w in tokens) / n,
        "reasoning": len(re.findall(REASONING[lang], part.lower())) / n * 100,
        "distinct": len(own - others) / max(1, len(own)),
        "dialogue": min(1.0, (spoken + quoted) / max(1, len(part))),
        "abstract": len(re.findall(ABSTRACT[lang], part.lower())) / n * 100,
    }


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def score(f: dict, length: str = "standard") -> tuple[float, float, dict]:
    scaled = {
        "facts": _clamp((f["facts"] - 1) / 8),
        "complexity": 0.5 * _clamp((f["sentence"] - 12) / 18) + 0.5 * _clamp((f["long"] - 0.10) / 0.15),
        "reasoning": _clamp((f["reasoning"] - 0.2) / 1.3),
        "distinct": _clamp((f["distinct"] - 0.35) / 0.30),
        "dialogue": _clamp(f["dialogue"] / 0.40),
        "abstract": _clamp((f["abstract"] - 1.5) / 6),
    }
    s = _clamp(sum(WEIGHTS[k] * v for k, v in scaled.items()))
    low, high = LENGTHS.get(length, LENGTHS["standard"])
    return s, low + (high - low) * s, scaled


def density(part: str, other_parts: list[str], lang: str, length: str = "standard") -> Density:
    f = features(part, other_parts, lang)
    s, target, scaled = score(f, length)
    return Density(score=round(s, 3), target=round(target, 3), features={k: round(v, 3) for k, v in f.items()},
                   scaled={k: round(v, 3) for k, v in scaled.items()})
