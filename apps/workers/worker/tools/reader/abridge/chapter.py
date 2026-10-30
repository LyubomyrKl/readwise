"""The chapter pass: a summary, then the chapter abridged part by part (docs/summarizer-investigation.md 8.4a).

Each part of about 1,200 words gets the chapter summary and the end of the abridgement so far as
context, and an explicit word target from its density score. The deterministic checks run on every
part; a part outside its length band or breaking the language rule gets one retry in the same
conversation that states the problem, and the better of the two answers is kept.
"""

from __future__ import annotations

import math
import time
from dataclasses import asdict, dataclass, field
from typing import Optional

from worker.tools.reader.ingest.language import language_name
from worker.tools.reader.abridge import checks, prompts
from worker.tools.reader.abridge.density import density
from worker.tools.reader.abridge.engine import Engine, tokens_per_word
from worker.tools.reader.abridge.figures import place
from worker.tools.reader.abridge.proofread import proofread
from worker.tools.reader.abridge.text import (FIGURE_MARKER, clean_output, keep_whole_sentences, last_sentences,
                                              split_parts, words)

PART_WORDS = 1200
# With ABRIDGE_CALIBRATE_LENGTH the writer is asked for this many times a part's target: on every run so far
# Gemma 4 wrote Ukrainian about 20% and Russian about 8% shorter than asked, English on target (§20).
ASK_FACTOR = {"uk": 1.25, "ru": 1.08}


@dataclass
class PartResult:
    index: int
    source: str
    output: str
    words_in: int
    words_out: int
    density: float
    target: float
    target_words: int
    facts: float                                   # names and numbers per 100 words (fact-check gating)
    figures: list[int] = field(default_factory=list)
    figures_put_back: list[int] = field(default_factory=list)
    retried: list[str] = field(default_factory=list)
    truncated: bool = False
    flags: list[str] = field(default_factory=list)
    corrected: list[list[str]] = field(default_factory=list)
    mixed_unfixed: list[str] = field(default_factory=list)
    unsupported_names: list[str] = field(default_factory=list)
    unsupported_numbers: list[str] = field(default_factory=list)
    seconds: float = 0.0
    checked: bool = False
    check_flags: list[dict] = field(default_factory=list)
    changes: list[dict] = field(default_factory=list)
    proofread: list[dict] = field(default_factory=list)

    @property
    def ratio(self) -> float:
        return self.words_out / max(1, self.words_in)


@dataclass
class ChapterResult:
    unit: str
    title: str
    language: str
    summary: str
    parts: list[PartResult]
    words_in: int
    seconds: float
    summary_checked: bool = False
    summary_changes: list[dict] = field(default_factory=list)

    @property
    def words_out(self) -> int:
        return sum(p.words_out for p in self.parts)

    @property
    def text(self) -> str:
        return "\n\n".join(p.output for p in self.parts if p.output)

    def to_json(self) -> dict:
        data = asdict(self)
        data["words_out"] = self.words_out
        return data

    @classmethod
    def from_json(cls, data: dict) -> "ChapterResult":
        data = dict(data)
        data.pop("words_out", None)
        data["parts"] = [PartResult(**p) for p in data.get("parts", [])]
        return cls(**data)


def _distance(ratio: float, target: float) -> float:
    return abs(math.log(max(ratio, 1e-3) / max(target, 1e-3)))


def _summary(engine: Engine, book: str, author: str, title: str, text: str, lang: str) -> str:
    reply = engine.call(engine.models.writer, prompts.SUMMARY.format(
        book=book, author=author, chapter=title, language=language_name(lang),
        rule=prompts.LANG_RULES.get(lang, prompts.OTHER_RULE), text=FIGURE_MARKER.sub("", text)), num_predict=700)
    return keep_whole_sentences(clean_output(reply.text))


def summarize(engine: Engine, book: str, author: str, title: str, parts: list[list[str]], lang: str
              ) -> tuple[str, list[str]]:
    """The chapter summary and, per part, the summary its context uses (a segment's own for long chapters)."""
    texts = ["\n\n".join(p) for p in parts]
    budget = engine.summary_budget_words(lang)
    total = sum(words(t) for t in texts)
    if total <= budget:
        summary = _summary(engine, book, author, title, "\n\n".join(texts), lang)
        return summary, [summary] * len(parts)
    segments: list[list[int]] = [[]]
    count = 0
    for index, text in enumerate(texts):
        if segments[-1] and count + words(text) > budget:
            segments.append([])
            count = 0
        segments[-1].append(index)
        count += words(text)
    segment_summaries = [_summary(engine, book, author, title, "\n\n".join(texts[i] for i in seg), lang)
                         for seg in segments]
    reply = engine.call(engine.models.writer, prompts.SEGMENTS_SUMMARY.format(
        book=book, author=author, chapter=title, language=language_name(lang),
        rule=prompts.LANG_RULES.get(lang, prompts.OTHER_RULE),
        segments="\n\n".join(f"Segment {i + 1}: {s}" for i, s in enumerate(segment_summaries))), num_predict=700)
    per_part = [""] * len(parts)
    for seg, seg_summary in zip(segments, segment_summaries):
        for index in seg:
            per_part[index] = seg_summary
    return keep_whole_sentences(clean_output(reply.text)), per_part


def abridge_part(engine: Engine, *, book: str, author: str, chapter: str, lang: str, length: str, items: list[str],
                 index: int, count: int, others: list[str], context_summary: str, previous: Optional[str]) -> PartResult:
    started = time.perf_counter()
    text = "\n\n".join(items)
    plain = FIGURE_MARKER.sub("", text)
    d = density(plain, [FIGURE_MARKER.sub("", o) for o in others], lang, length)
    words_in = words(text)
    target_words = max(30, round(words_in * d.target))
    if getattr(engine.settings, "abridge_calibrate_length", False):
        target_words = max(30, round(target_words * ASK_FACTOR.get(lang, 1.0)))
    headings = [item[3:] for item in items if item.startswith("## ")]
    figure_numbers = [int(n) for n in FIGURE_MARKER.findall(text)]
    extras = (prompts.HEADINGS_RULE if headings else "") + (prompts.FIGURES_RULE if figure_numbers else "")
    rule, language = prompts.LANG_RULES.get(lang, prompts.OTHER_RULE), language_name(lang)
    prompt = prompts.PART.format(
        book=book, author=author, chapter=chapter, index=index + 1, count=count, language=language, rule=rule,
        summary=context_summary,
        previous=prompts.PREVIOUS.format(ending=last_sentences(previous)) if previous else "",
        target_words=target_words, sentences=max(2, round(target_words / 18)), extras=extras, text=text)
    cap = int(target_words * tokens_per_word(lang) * 2.2) + 200 + 40 * len(figure_numbers)

    def attempt(messages) -> tuple[str, bool, checks.Report, str]:
        reply = engine.call(engine.models.writer, messages, num_predict=cap)
        out = clean_output(reply.text, headings)
        if reply.truncated:
            out = keep_whole_sentences(out)
        report = checks.check_part(plain, out, lang, d.target, words_in, words(out))
        return out, reply.truncated, report, reply.text

    output, truncated, report, raw = attempt(prompt)
    retried: list[str] = []
    if not report.in_band or report.language:
        low, high = report.band
        if report.language:
            follow = prompts.RETRY_LANGUAGE.format(problems="; ".join(report.language), language=language)
            retried.append("language")
        else:
            follow = prompts.RETRY_LENGTH.format(words=report.words, target_words=target_words,
                                                 low=round(words_in * low), high=round(words_in * high))
            retried.append("length")
        conversation = [{"role": "user", "content": prompt}, {"role": "assistant", "content": raw},
                        {"role": "user", "content": follow}]
        second, second_truncated, second_report, _ = attempt(conversation)

        def badness(r: checks.Report) -> tuple:
            return (len(r.language), not r.in_band, _distance(r.ratio, d.target))

        if second and badness(second_report) < badness(report):
            output, truncated, report = second, second_truncated, second_report

    output = checks.repair(plain, output, lang, report)
    proofread_changes: list[dict] = []
    if getattr(engine.settings, "abridge_proofread", False):
        output, proofread_changes = proofread(engine, output, lang, plain)
    output, put_back = place(output, figure_numbers, items)
    return PartResult(
        index=index, source=text, output=output, words_in=words_in, words_out=words(output), density=d.score,
        target=d.target, target_words=target_words, facts=round(d.facts_per_100_words, 2), figures=figure_numbers,
        figures_put_back=put_back, retried=retried, truncated=truncated, flags=report.flags(),
        corrected=[list(c) for c in report.corrected], mixed_unfixed=report.mixed_unfixed,
        unsupported_names=report.unsupported_names, unsupported_numbers=report.unsupported_numbers,
        proofread=proofread_changes, seconds=round(time.perf_counter() - started, 2))


def abridge_chapter(engine: Engine, *, unit: str, book: str, author: str, title: str, lang: str, length: str,
                    items: list[str], on_part=None) -> ChapterResult:
    """`on_part(done, total)` is called after each part, for progress."""
    started = time.perf_counter()
    parts = split_parts(items, PART_WORDS)
    summary, contexts = summarize(engine, book, author, title, parts, lang)
    results: list[PartResult] = []
    texts = ["\n\n".join(p) for p in parts]
    for index, part_items in enumerate(parts):
        previous = results[-1].output if results else None
        results.append(abridge_part(engine, book=book, author=author, chapter=title, lang=lang, length=length,
                                    items=part_items, index=index, count=len(parts),
                                    others=texts[:index] + texts[index + 1:], context_summary=contexts[index],
                                    previous=previous))
        if on_part:
            on_part(index + 1, len(parts))
    summary = checks.apply_corrections(summary, checks.names_and_numbers("\n\n".join(texts), summary, lang)[0])
    return ChapterResult(unit=unit, title=title, language=lang, summary=summary, parts=results,
                         words_in=sum(words(t) for t in texts), seconds=round(time.perf_counter() - started, 1))
