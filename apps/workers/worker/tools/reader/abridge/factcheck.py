"""The part-level fact-check (Appendix B.11): one model lists suspected errors, a noise filter drops
non-errors, the writer model confirms each remaining claim (YES/NO) and rewrites only the sentence.

On the owner's round-3 chapters this fixed 10 sentences, 4 of them real errors (2 of the owner's own
annotations), and none for the worse; the owner rated faithfulness 4.3 with the check against 3.7
without. It costs about three times the generation, so by default only parts dense in names and
numbers (or with a name or number the deterministic check could not find in the source) are checked.

The stages run book-wide, one model at a time (all checks, then all confirmations and fixes), because
the two models do not fit the Mac's memory together and every switch reloads one of them.
"""

from __future__ import annotations

import difflib
import re
from typing import Callable, Optional

from worker.tools.reader.ingest.language import language_name
from worker.tools.reader.abridge import prompts
from worker.tools.reader.abridge.chapter import ChapterResult, PartResult
from worker.tools.reader.abridge.engine import Engine
from worker.tools.reader.abridge.proofread import LANGUAGES as PROOFREAD_LANGUAGES
from worker.tools.reader.abridge.proofread import proofread
from worker.tools.reader.abridge.text import FIGURE_MARKER, keep_whole_sentences, sentences, verdict, words

DENSE_FACTS = 1.0     # names and numbers per 100 words from which a part is checked in "dense" mode

NOISE = re.compile(r"(this is (accurate|faithful|correct)|is (accurate|faithful)|no error|faithful(ly)?\b|accurately"
                   r"|stylistic|omission|omits|omitted|not listed per instructions|^none\.?$|minor (change|shift)"
                   r"|matches the source|consistent with the source)", re.I)


def should_check(part: PartResult, mode: str) -> bool:
    if mode == "off":
        return False
    if mode == "all":
        return True
    return part.facts >= DENSE_FACTS or bool(part.unsupported_names or part.unsupported_numbers)


def parse_flags(text: str) -> list[dict]:
    if text.strip().upper().startswith("NONE"):
        return []
    flags = []
    for line in text.splitlines():
        match = re.search(r"QUOTE:\s*(.*?)\s*\|\s*PROBLEM:\s*(.*?)(?:\s*\|\s*SOURCE:\s*(.*))?$", line, re.I)
        if match:
            flags.append({"quote": match.group(1).strip(' "«»'), "problem": match.group(2).strip(),
                          "source": (match.group(3) or "").strip()})
    return flags


def locate(text: str, quote: str) -> Optional[str]:
    """The sentence of `text` containing the quote, or the closest one when the quote is not exact."""
    best, best_score = None, 0.0
    lowered = (quote or "").lower()
    for paragraph in text.split("\n"):
        if FIGURE_MARKER.fullmatch(paragraph.strip()):
            continue
        for sentence in sentences(paragraph):
            if lowered and lowered in sentence.lower():
                return sentence
            score = difflib.SequenceMatcher(None, lowered, sentence.lower()).ratio()
            if score > best_score:
                best, best_score = sentence, score
    return best if best_score >= 0.6 else None


def header(book: str, author: str, chapter: str) -> str:
    """What the writer was told besides the text: without it the checker flags "Russell" or "this
    preface" as facts the source does not contain."""
    return f"Book: {book} by {author}\nChapter: {chapter}\n\n" if book or chapter else ""


def check(engine: Engine, source: str, abridgement: str, context: str = "") -> list[dict]:
    reply = engine.call(engine.models.checker, prompts.CHECK.format(source=context + FIGURE_MARKER.sub("", source),
                                                                     abridgement=FIGURE_MARKER.sub("", abridgement)),
                        num_predict=2000, temperature=0.1)
    return parse_flags(reply.text)


def _replace(text: str, sentence: str, new: Optional[str]) -> str:
    if new is None:
        text = text.replace(sentence, "")
        return re.sub(r"[ \t]{2,}", " ", re.sub(r" +\n", "\n", text)).strip()
    return text.replace(sentence, new)


def confirm_and_fix(engine: Engine, text: str, flags: list[dict], source: str, lang: str,
                    mixed_words: list[str] = (), context: str = "") -> tuple[str, list[dict]]:
    """Applies the confirmed fixes; returns the new text and what happened to each flag."""
    rule, language = prompts.LANG_RULES.get(lang, prompts.OTHER_RULE), language_name(lang)
    plain_source = context + FIGURE_MARKER.sub("", source)
    changes: list[dict] = []
    for flag in flags:
        problem = flag.get("problem", "")
        if not problem.strip() or NOISE.search(problem):
            changes.append({"quote": flag.get("quote"), "problem": problem, "action": "dropped as noise"})
            continue
        sentence = locate(text, flag.get("quote", ""))
        if not sentence:
            changes.append({"quote": flag.get("quote"), "problem": problem, "action": "not located"})
            continue
        answer = engine.call(engine.models.writer, prompts.CONFIRM.format(sentence=sentence, problem=problem,
                                                                          source=plain_source),
                             num_predict=12, temperature=0.0).text
        if verdict(answer, ("YES", "NO")) != "YES":
            changes.append({"quote": flag.get("quote"), "problem": problem, "action": "not confirmed"})
            continue
        new = engine.call(engine.models.writer, prompts.FIX.format(language=language, rule=rule, problem=problem,
                                                                   sentence=sentence, source=plain_source),
                          num_predict=400, temperature=0.1).text.strip().strip('"«»')
        if new.upper().startswith("DELETE"):
            text = _replace(text, sentence, None)
            changes.append({"old": sentence, "new": None, "problem": problem, "action": "deleted"})
            continue
        new = keep_whole_sentences(new.split("\n")[0].strip())
        if not new or words(new) > 3 * max(8, words(sentence)):
            changes.append({"old": sentence, "new": new, "problem": problem, "action": "fix rejected: malformed"})
        elif not better(engine, sentence, new, plain_source):
            # a rewrite with an error of its own would make the edition worse than no check at all
            changes.append({"old": sentence, "new": new, "problem": problem, "action": "fix rejected: not better"})
        else:
            text = _replace(text, sentence, new)
            changes.append({"old": sentence, "new": new, "problem": problem, "action": "fixed"})
    for word in mixed_words:
        sentence = next((s for p in text.split("\n") for s in sentences(p) if word in s), None)
        if not sentence:
            continue
        new = engine.call(engine.models.writer, prompts.FIX_SPELLING.format(language=language, rule=rule, words=word,
                                                                            sentence=sentence, source=plain_source),
                          num_predict=400, temperature=0.1).text.strip().strip('"«»').split("\n")[0].strip()
        if new and word not in new and words(new) <= 2 * max(8, words(sentence)) \
                and better(engine, sentence, new, plain_source, spelling=True):
            text = _replace(text, sentence, new)
            changes.append({"old": sentence, "new": new, "problem": f"mixed scripts: {word}", "action": "fixed"})
    return text, changes


def better(engine: Engine, old: str, new: str, source: str, spelling: bool = False) -> bool:
    """The rewrite replaces the sentence only if the writer finds it more faithful in both orders (models lean
    towards one position); a spelling fix only has to be no less faithful, so one order preferring it is enough
    when the other is a tie."""
    votes = []
    for first, second, rewrite in ((old, new, "B"), (new, old, "A")):
        answer = engine.call(engine.models.writer, prompts.COMPARE.format(source=source, first=first, second=second),
                             num_predict=12, temperature=0.0).text
        votes.append(verdict(answer, ("A", "B")) == rewrite)
    return all(votes) or (spelling and any(votes))


def proofreading(engine: Engine, chapter: ChapterResult) -> bool:
    return bool(getattr(engine.settings, "abridge_proofread", False) and engine.models.checker
                and chapter.language in PROOFREAD_LANGUAGES)


def check_chapter(engine: Engine, chapter: ChapterResult, mode: str, source_text: str, context: str = "",
                  on_part: Optional[Callable[[int, int], None]] = None) -> None:
    """Stage 1 (checker model): proofreading when it is on, then flags for the summary and every part that
    qualifies (the flags quote the proofread text)."""
    proofread_on = proofreading(engine, chapter)
    if proofread_on and chapter.summary and not chapter.summary_proofread:
        chapter.summary, chapter.summary_proofread = proofread(engine, chapter.summary, chapter.language, source_text)
    if mode != "off" and chapter.summary and words(source_text) <= engine.summary_budget_words(chapter.language):
        chapter.summary_changes = [{"flag": f} for f in check(engine, source_text, chapter.summary, context)]
        chapter.summary_checked = True
    for index, part in enumerate(chapter.parts, 1):
        if proofread_on and part.target < 1.0 and not part.proofread:
            part.output, part.proofread = proofread(engine, part.output, chapter.language, part.source)
            part.words_out = words(part.output)
        if should_check(part, mode) and part.target < 1.0:
            part.check_flags = check(engine, part.source, part.output, context)
            part.checked = True
        if on_part:
            on_part(index, len(chapter.parts))


def fix_chapter(engine: Engine, chapter: ChapterResult, source_text: str, context: str = "",
                on_part: Optional[Callable[[int, int], None]] = None) -> None:
    """Stage 2 (writer model): confirmation and fixes of the flags from stage 1, and spelling fixes."""
    if chapter.summary_checked and chapter.summary_changes and "flag" in chapter.summary_changes[0]:
        flags = [c["flag"] for c in chapter.summary_changes]
        chapter.summary, chapter.summary_changes = confirm_and_fix(engine, chapter.summary, flags, source_text,
                                                                   chapter.language, context=context)
    for index, part in enumerate(chapter.parts, 1):
        if not part.changes and (part.check_flags or part.mixed_unfixed):
            part.output, part.changes = confirm_and_fix(engine, part.output, part.check_flags, part.source,
                                                        chapter.language, part.mixed_unfixed, context=context)
            part.words_out = words(part.output)
            if not part.changes:
                part.changes = [{"action": "nothing to fix"}]
        if on_part:
            on_part(index, len(chapter.parts))
