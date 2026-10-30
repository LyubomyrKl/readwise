"""Spelling and grammar slips in Russian and Ukrainian abridgements ("Реччю" for "Річчю", "У груді" for
"У грудні"), which no deterministic check catches. The writer lists them as wrong -> right pairs, a short
answer, and a pair is applied only when it is a spelling-sized edit: the words exist in the text, the
correction resembles them and keeps the numbers, the words are not all in the source (then they are real
words of the language, or its own spelling of a name), and the correction passes the language rule, and the model prefers the corrected sentence in both orders. Runs in the check stage with the
checker model. Off unless ABRIDGE_PROOFREAD is set (§21).
"""

from __future__ import annotations

import difflib
import re

from worker.tools.reader.ingest.language import language_name
from worker.tools.reader.abridge import checks, prompts
from worker.tools.reader.abridge.engine import Engine
from worker.tools.reader.abridge.text import sentences, verdict

LANGUAGES = ("uk", "ru")
_PAIR = re.compile(r"WRONG:\s*(.*?)\s*\|\s*RIGHT:\s*(.*)", re.I)


def _word(words: str) -> str:
    """The words as whole words; a hyphen is a boundary ("греко-колицькі" holds "колицькі")."""
    return rf"(?<!\w){re.escape(words)}(?!\w)"


def pairs_of(text: str) -> list[tuple[str, str]]:
    out = []
    for line in (text or "").splitlines():
        match = _PAIR.search(line)
        if match:
            out.append((match.group(1).strip(' "«»*'), match.group(2).strip(' "«»*')))
    return out


def acceptable(wrong: str, right: str, text: str, source: str, lang: str) -> str:
    """'' when the pair may be applied, else why not."""
    if not wrong or not right or wrong == right:
        return "empty or unchanged"
    if not re.search(_word(wrong), text):
        return "not in the text"
    if re.findall(r"\d+", wrong) != re.findall(r"\d+", right):
        return "changes a number"
    if len(right.split()) > len(wrong.split()) + 1 or len(right) > 2 * len(wrong) + 6:
        return "a rewrite, not a spelling fix"
    if difflib.SequenceMatcher(None, wrong.lower(), right.lower()).ratio() < 0.5:
        return "too different"
    words = re.findall(r"\w+", wrong.lower())
    if source and words and all(re.search(_word(w), source.lower()) for w in words):
        return "the source has these words"          # real words of the language (and its names) stay
    if checks.language_problems(right, lang) or checks.fix_mixed_scripts(right, lang)[2]:
        return "breaks the language rule"
    return ""


def better_language(engine: Engine, model: str, old: str, new: str, language: str) -> bool:
    """The corrected sentence must win in both orders: on its own list Gemma once turned a correct
    "Річчю Посполитою" into "Речі Посполитої", which breaks the sentence."""
    for first, second, wanted in ((old, new, "B"), (new, old, "A")):
        answer = engine.call(model, prompts.GRAMMAR_COMPARE.format(language=language, first=first, second=second),
                             num_predict=12, temperature=0.0).text
        if verdict(answer, ("A", "B")) != wanted:
            return False
    return True


def proofread(engine: Engine, text: str, lang: str, source: str = "", model: str = "") -> tuple[str, list[dict]]:
    """The text with the accepted corrections, and every proposed pair with what happened to it.

    `model` defaults to the checker: on the Ukrainian outputs so far Qwen 3.6 made 13 corrections, all of
    them right, where Gemma 4 made 8 with 2 that broke a sentence (§21.2); it is also the model the check
    stage has loaded."""
    if lang not in LANGUAGES or not text.strip():
        return text, []
    model = model or engine.models.checker or engine.models.writer
    language = language_name(lang)
    reply = engine.call(model, prompts.PROOFREAD.format(language=language, text=text), num_predict=400,
                        temperature=0.0)
    changes = []
    for wrong, right in pairs_of(reply.text):
        reason = acceptable(wrong, right, text, source, lang)
        if not reason:
            sentence = next((s for p in text.split("\n") for s in sentences(p) if re.search(_word(wrong), s)), "")
            if sentence and not better_language(engine, model, sentence, re.sub(_word(wrong), right, sentence), language):
                reason = "not better in context"
        if not reason:
            text = re.sub(_word(wrong), right, text)
        changes.append({"wrong": wrong, "right": right, "action": f"skipped: {reason}" if reason else "fixed"})
    return text, changes
