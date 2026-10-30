"""reader.abridge end to end with a scripted LLM: chapters, parts with targets, pictures, the fact-check,
the EPUB, resume and idempotency. No Ollama involved."""
import io
import re
import zipfile

import pytest

from books import epub, paragraph, png, sample_epub, xhtml
from conftest import make_envelope
from worker.platform import llm as platform_llm
from worker.platform.jobs import JobFailed
from worker.tools.reader.abridge import checks, density
from worker.tools.reader.abridge.figures import place
from worker.tools.reader.abridge.handler import AbridgeHandler, output_key
from worker.tools.reader.abridge.llm import LLMUnavailable, Reply, Usage
from worker.tools.reader.abridge.text import clean_output, split_parts


class ScriptedLLM:
    """Answers each kind of prompt the way a well-behaved model would, deterministically."""

    def __init__(self, models=("writer", "checker"), fail_on=None, flag_word=None, drop_markers=False,
                 unavailable_once=False, unfaithful_fixes=False):
        self.available = set(models)
        self.calls: list[tuple[str, str]] = []
        self.num_ctx = 32768
        self.usage: dict[str, Usage] = {}
        self.fail_on = fail_on
        self.flag_word = flag_word
        self.drop_markers = drop_markers
        self.unavailable_once = unavailable_once
        self.unfaithful_fixes = unfaithful_fixes

    def models(self):
        return set(self.available)

    def close(self):
        pass

    def usage_json(self):
        return {m: u.to_json() for m, u in self.usage.items()}

    def chat(self, model, messages, *, num_predict, temperature=0.2, top_p=0.9, images=None):
        if self.unavailable_once:
            self.unavailable_once = False
            raise LLMUnavailable("connection refused")
        prompt = messages if isinstance(messages, str) else messages[0]["content"]
        last = messages if isinstance(messages, str) else messages[-1]["content"]
        self.calls.append((model, prompt))
        if self.fail_on and self.fail_on in prompt:
            raise RuntimeError("the worker stopped")
        text = self._answer(prompt, last, images)
        reply = Reply(text=text, model=model, prompt_tokens=len(prompt.split()), output_tokens=len(text.split()),
                      seconds=0.01, done_reason="stop")
        self.usage.setdefault(model, Usage()).add(reply)
        return reply

    def _answer(self, prompt, last, images):
        if "Write a 120-180 word summary" in prompt:
            chapter = re.search(r"Chapter: (.*)", prompt).group(1)
            return f"Here is the summary:\n{chapter} is summarized here in a few faithful sentences."
        if "Abridge ONLY the part below" in prompt:
            target = int(re.search(r"to about (\d+) words", prompt).group(1))
            part = prompt.split("<part>")[1].split("</part>")[0]
            lines = [line for line in part.strip().split("\n\n")]
            out, count = [], 0
            for line in lines:
                if line.startswith("[[FIG"):
                    if not self.drop_markers:
                        out.append(re.sub(r"\[\[FIG (\d+):.*\]\]", r"[[FIG \1]]", line))
                    continue
                if line.startswith("## "):
                    out.append(line)
                    continue
                if count < target:
                    take = line.split()[: max(1, target - count)]
                    out.append(" ".join(take).rstrip(".,") + ".")
                    count += len(take)
            return "\n\n".join(out)
        if "You are checking an abridgement" in prompt:
            abridgement = prompt.split("<abridgement>")[1]
            if self.flag_word and self.flag_word in abridgement:
                sentence = next(s for s in re.split(r"(?<=\.)\s+", abridgement) if self.flag_word in s)
                return f"QUOTE: {sentence.strip()} | PROBLEM: the source says the pier was finished in June | SOURCE: June"
            return "NONE"
        if "Which one is more faithful to the source" in prompt:
            rewrite_first = re.search(r"\nA: (.*)\nB:", prompt).group(1) == "The pier was finished in June."
            prefers_rewrite = not self.unfaithful_fixes
            letter = ("A" if rewrite_first else "B") if prefers_rewrite else ("B" if rewrite_first else "A")
            return f"The correct answer is **{letter}**.\n\n**Reasoning:** {'A' if letter == 'B' else 'B'} adds a date"
        if "Answer with one word: YES or NO" in prompt:
            return "**YES**"
        if "Rewrite only that sentence" in prompt:
            return "The pier was finished in June."
        if "say what the picture shows" in prompt:
            assert images, "a description needs the picture"
            return "A map of a small harbour with a long pier."
        if "Write an overview of the whole book" in prompt:
            return "An overview of the whole book in a few sentences."
        if "single letter" in prompt:
            return "Б"
        if prompt.startswith("Below is a text in"):
            return "NONE"
        if prompt.startswith("Two versions of one sentence"):
            return "A"
        raise AssertionError(f"unexpected prompt: {prompt[:120]}")


@pytest.fixture(autouse=True)
def reachable_host(monkeypatch):
    monkeypatch.setattr(platform_llm, "probe_ollama", lambda url, timeout=5.0: True)
    monkeypatch.setattr(platform_llm.time, "sleep", lambda s: None)


def _settings(settings, **overrides):
    values = {"abridge_model": "writer", "abridge_check_model": "checker", "abridge_factcheck": "all", **overrides}
    return settings.model_copy(update=values)


def _payload(**extra):
    return {"bookId": "b1", "editionId": "ed1", "fileStorageKey": "user-1-book.epub", "mime": "application/epub+zip",
            "title": "A Test Book", "author": "A. Author", **extra}


def _run(settings, storage, make_ctx, llm, payload=None):
    handler = AbridgeHandler(settings, storage, client_factory=lambda: llm, sleep=lambda s: None)
    return handler(make_ctx(make_envelope(type="reader.abridge", payload=payload or _payload())))


def _epub_pages(data: bytes) -> dict[str, str]:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        return {name: zf.read(name).decode("utf-8") for name in zf.namelist() if name.endswith(".xhtml")}


def test_a_book_becomes_an_epub_edition_with_summaries_abridged_chapters_and_its_pictures(settings, storage, make_ctx):
    storage.store[("books", "user-1-book.epub")] = sample_epub()
    llm = ScriptedLLM()

    result = _run(_settings(settings), storage, make_ctx, llm)

    assert result["storageKey"] == output_key("user-1", "ed1") == "user-1-edition-ed1.epub"
    assert result["chapters"] == 3 and result["language"] == "en" and result["pictures"] == 1
    assert 0.1 <= result["ratio"] <= 0.6
    assert result["title"] == "A Test Book (abridged)"
    data = storage.store[("books", result["storageKey"])]
    assert result["bytes"] == len(data)
    pages = _epub_pages(data)
    chapters = [html for name, html in sorted(pages.items()) if "chapter-" in name]
    assert [re.search(r"<h[12]>(.*?)</h[12]>|<h1 class=\"part\">(.*?)</h1>", c).group(0) for c in chapters] == [
        '<h1 class="part">Part One</h1>', "<h2>Chapter 1. The Harbour</h2>", "<h2>Chapter 2. The Storm</h2>",
        "<h1>Глава 3. Зимовье</h1>"]
    assert "In short" in chapters[1] and "Chapter 1. The Harbour is summarized here" in chapters[1]
    assert "Here is the summary" not in chapters[1]
    assert 'alt="A map of a small harbour with a long pier."' in chapters[1]
    assert "<figcaption>Fig. 1. The harbour in 1890</figcaption>" in chapters[1]
    assert "An overview of the whole book" in pages["EPUB/about.xhtml"]
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        assert any(name.startswith("EPUB/images/fig1.") for name in zf.namelist())
        assert any("cover" in name for name in zf.namelist())
    assert result["metrics"]["calls"] == len(llm.calls)
    assert set(result["metrics"]["llm"]) == {"writer", "checker"}


def test_progress_only_moves_forward_and_names_the_books_own_chapter_numbers(settings, storage, make_ctx, publisher):
    storage.store[("books", "user-1-book.epub")] = sample_epub()

    _run(_settings(settings), storage, make_ctx, ScriptedLLM())

    progress = [(e.stage, e.progress) for e in publisher.events if e.event == "progress"]
    values = [p for _, p in progress]
    assert values == sorted(values) and values[-1] >= 98
    stages = [stage for stage, _ in progress]
    assert "chapter 2 of 3: part 1 of 1" in stages
    assert "fact-checking chapter 3 of 3: part 1 of 1" in stages and "fixing chapter 1 of 3" in stages
    # writing ends near a third of the bar when the fact-check is on: the shares follow the time
    first_check = next(p for stage, p in progress if stage.startswith("fact-checking"))
    assert 30 <= first_check <= 40


def test_each_part_gets_its_own_word_target_and_the_chapter_summary_as_context(settings, storage, make_ctx):
    long_chapter = "".join(f"<p>{paragraph(i, words=120)}</p>" for i in range(1, 26))   # ~3,000 words
    storage.store[("books", "user-1-book.epub")] = epub(
        [("c1.xhtml", xhtml("<h1>One</h1>" + long_chapter)), ("c2.xhtml", xhtml("<h1>Two</h1>" + long_chapter))],
        toc=[("One", "c1.xhtml", []), ("Two", "c2.xhtml", [])])
    llm = ScriptedLLM()

    _run(_settings(settings, abridge_factcheck="off", abridge_check_model=""), storage, make_ctx, llm)

    parts = [prompt for _, prompt in llm.calls if "Abridge ONLY" in prompt]
    assert len(parts) == 6                                         # three parts of ~1,000-1,200 words per chapter
    assert all("Summary of the whole chapter" in p and "is summarized here" in p for p in parts)
    assert "The abridgement so far ends with" not in parts[0] and "The abridgement so far ends with" in parts[1]
    targets = [int(re.search(r"to about (\d+) words", p).group(1)) for p in parts]
    assert all(150 <= t <= 600 for t in targets)


def test_the_fact_check_flags_with_the_checker_and_fixes_with_the_writer(settings, storage, make_ctx):
    storage.store[("books", "user-1-book.epub")] = sample_epub()
    llm = ScriptedLLM(flag_word="harbour office")

    result = _run(_settings(settings), storage, make_ctx, llm)

    checks_by = {model for model, prompt in llm.calls if "You are checking an abridgement" in prompt}
    fixes_by = {model for model, prompt in llm.calls if "Rewrite only that sentence" in prompt}
    assert checks_by == {"checker", "writer"} and fixes_by == {"writer"}      # the writer checks too (second check)
    assert result["fixedSentences"] >= 1 and result["checkedParts"] >= 3
    chapter = next(html for name, html in _epub_pages(storage.store[("books", result["storageKey"])]).items()
                   if "The Harbour" in html)
    assert "The pier was finished in June." in chapter
    # every call of the checker came before the writer's stage: each model is loaded once
    models = [model for model, _ in llm.calls]
    first_fix = next(i for i, (_, p) in enumerate(llm.calls) if "Rewrite only that sentence" in p)
    assert max(i for i, m in enumerate(models) if m == "checker") < first_fix


def test_an_error_only_the_writers_own_check_finds_is_fixed_and_shared_flags_are_confirmed_once(
        settings, storage, make_ctx):
    storage.store[("books", "user-1-book.epub")] = sample_epub()

    class WriterSees(ScriptedLLM):
        """The checker finds nothing; the writer's own check flags the harbour office sentence."""

        def _answer(self, prompt, last, images):
            if "You are checking an abridgement" in prompt and self.calls[-1][0] == "checker":
                return "NONE"
            return super()._answer(prompt, last, images)

    llm = WriterSees(flag_word="harbour office")
    result = _run(_settings(settings), storage, make_ctx, llm)

    assert result["fixedSentences"] >= 1 and result["fixedByWriterCheck"] == result["fixedSentences"]

    both = ScriptedLLM(flag_word="harbour office")                 # both checkers flag the same sentence
    storage.store.clear()
    storage.store[("books", "user-1-book.epub")] = sample_epub()
    _run(_settings(settings), storage, make_ctx, both)
    flagged_parts = sum(1 for _, p in both.calls if "You are checking" in p and "harbour office" in p.split("<abridgement>")[1])
    confirmations = sum(1 for _, p in both.calls if "Answer with one word: YES or NO" in p)
    assert flagged_parts >= 2 and confirmations == flagged_parts // 2   # one confirmation per flagged sentence


def test_merge_keeps_the_checkers_flags_and_adds_the_writers_new_ones():
    from worker.tools.reader.abridge.factcheck import merge_flags

    text = "The pier was finished in May. The storm came in June. The mayor resigned."
    first = [{"quote": "The pier was finished in May", "problem": "June in the source"}]
    second = [{"quote": "The pier was finished in May.", "problem": "wrong month"},
              {"quote": "The mayor resigned", "problem": "the source says he stayed"}]
    merged = merge_flags(text, first, second)

    assert [f["problem"] for f in merged] == ["June in the source", "the source says he stayed"]
    assert merged[1]["by"] == "writer" and "by" not in merged[0]


def test_a_rewrite_that_is_not_faithful_either_is_not_applied(settings, storage, make_ctx):
    storage.store[("books", "user-1-book.epub")] = sample_epub()

    result = _run(_settings(settings), storage, make_ctx, ScriptedLLM(flag_word="harbour office", unfaithful_fixes=True))

    assert result["fixedSentences"] == 0
    chapter = next(html for name, html in _epub_pages(storage.store[("books", result["storageKey"])]).items()
                   if "The Harbour" in html)
    assert "The pier was finished in June." not in chapter and "harbour office" in chapter


@pytest.mark.parametrize("answer, expected", [
    ("B", "B"), ("The correct answer is **B**.\n\n**Reasoning:** A is wrong", "B"), ("**A**", "A"),
    ("Answer: A", "A"), ("Neither", ""),
])
def test_a_wrapped_one_letter_answer_is_read(answer, expected):
    from worker.tools.reader.abridge.factcheck import verdict

    assert verdict(answer, ("A", "B")) == expected


@pytest.mark.parametrize("answer, expected", [("YES", "YES"), ("**YES**", "YES"), ("The answer is NO.", "NO"),
                                              ("Yes, it adds a date.", "YES"), ("", "")])
def test_a_wrapped_yes_or_no_is_read(answer, expected):
    from worker.tools.reader.abridge.factcheck import verdict

    assert verdict(answer, ("YES", "NO")) == expected


def test_sentences_do_not_end_at_initials_or_abbreviations():
    from worker.tools.reader.abridge.text import sentences

    assert sentences("Поштовхом став напад Д. Чаплинського на Суботів. Він писав: «Годі.» Потім J. M. Keynes, "
                     "e.g. this. Fig. 3 shows it.") == [
        "Поштовхом став напад Д. Чаплинського на Суботів.", "Він писав: «Годі.»", "Потім J. M. Keynes, e.g. this.",
        "Fig. 3 shows it."]


def test_a_drop_cap_without_its_letter_in_the_alt_text_is_read_by_the_vision_model(settings, storage, make_ctx):
    chapter = xhtml('<h1>Глава 1</h1><p><img src="../img/cap.png" alt=""/>лагодаря капитану зимовье построили.</p>'
                    + "".join(f"<p>{paragraph(i, lang='ru')}</p>" for i in range(1, 5)))
    storage.store[("books", "user-1-book.epub")] = epub([("text/c1.xhtml", chapter), ("text/c2.xhtml", chapter)],
                                                        toc=[("Глава 1", "text/c1.xhtml", []), ("Глава 2", "text/c2.xhtml", [])],
                                                        images={"img/cap.png": png(90, 90, (0, 0, 0))})
    llm = ScriptedLLM()

    _run(_settings(settings, abridge_factcheck="off"), storage, make_ctx, llm)

    parts = [prompt for _, prompt in llm.calls if "Abridge ONLY" in prompt]
    assert all("Благодаря капитану" in prompt for prompt in parts)
    assert sum(1 for _, prompt in llm.calls if "single letter" in prompt) == 2


def test_a_missing_marker_is_put_back_so_no_kept_picture_is_lost(settings, storage, make_ctx):
    storage.store[("books", "user-1-book.epub")] = sample_epub()

    result = _run(_settings(settings, abridge_factcheck="off"), storage, make_ctx, ScriptedLLM(drop_markers=True))

    assert result["pictures"] == 1 and result["picturesPutBack"] == 1


def test_a_stopped_job_resumes_with_the_chapters_it_finished(settings, storage, make_ctx):
    storage.store[("books", "user-1-book.epub")] = sample_epub()
    first = ScriptedLLM(fail_on="Chapter: Chapter 2. The Storm")
    with pytest.raises(RuntimeError):
        _run(_settings(settings), storage, make_ctx, first)

    second = ScriptedLLM()
    result = _run(_settings(settings), storage, make_ctx, second)

    generated = [p for _, p in second.calls if "Write a 120-180 word summary" in p or "Abridge ONLY" in p]
    assert not any("Chapter: Chapter 1. The Harbour" in p for p in generated)
    assert any("Chapter: Chapter 2. The Storm" in p for p in generated)
    assert result["chapters"] == 3


def test_a_delivery_after_the_edition_exists_does_nothing(settings, storage, make_ctx):
    storage.store[("books", "user-1-book.epub")] = sample_epub()
    _run(_settings(settings), storage, make_ctx, ScriptedLLM())
    again = ScriptedLLM()

    result = _run(_settings(settings), storage, make_ctx, again)

    assert result["skipped"] is True and again.calls == []


def test_the_host_going_away_mid_call_waits_and_goes_on(settings, storage, make_ctx, publisher):
    storage.store[("books", "user-1-book.epub")] = sample_epub()

    result = _run(_settings(settings, abridge_factcheck="off"), storage, make_ctx, ScriptedLLM(unavailable_once=True))

    assert result["chapters"] == 3


def test_a_writer_model_missing_on_the_host_fails_for_good_and_a_missing_checker_only_skips_the_check(
        settings, storage, make_ctx):
    storage.store[("books", "user-1-book.epub")] = sample_epub()
    with pytest.raises(JobFailed) as error:
        _run(_settings(settings), storage, make_ctx, ScriptedLLM(models=("checker",)))
    assert error.value.retryable is False and "ollama pull writer" in str(error.value)

    result = _run(_settings(settings), storage, make_ctx, ScriptedLLM(models=("writer",)))
    assert result["factcheck"] == "off" and any("fact-check skipped" in w for w in result["warnings"])


def test_bad_settings_in_the_payload_fail_without_retry(settings, storage, make_ctx):
    with pytest.raises(JobFailed) as error:
        _run(_settings(settings), storage, make_ctx, ScriptedLLM(), payload=_payload(length="tiny"))
    assert error.value.retryable is False


# ---- the pieces --------------------------------------------------------------------------------

def test_density_gives_dense_text_a_larger_target_than_dialogue():
    dense = ("In 1648 Khmelnytsky defeated Potocki at Zhovti Vody and Korsun; in 1649 the Treaty of Zboriv gave the "
             "Hetmanate 40,000 registered Cossacks, therefore the Commonwealth's authority over Kyiv, Bratslav and "
             "Chernihiv was limited. ") * 8
    dialogue = "\n".join(["— Where are you going? she asked.", "— Home, he said.", "— Why so early?",
                          "— Because it is late.", "— Is it?"] * 12)
    assert density.density(dense, [], "en").target > density.density(dialogue, [], "en").target
    assert density.density(dense, [], "en", "short").target < density.density(dense, [], "en", "long").target
    for length, (low, high) in density.LENGTHS.items():
        assert low <= density.density(dialogue, [], "en", length).target <= high


def test_parts_split_at_paragraphs_and_start_at_subheadings():
    items = [f"p{i} " + "word " * 299 for i in range(6)] + ["## Section B"] + [f"q{i} " + "word " * 299 for i in range(3)]
    parts = split_parts(items, size=1200, heading_break=400)
    assert [len(p) for p in parts] == [4, 2, 4]
    assert parts[2][0] == "## Section B"


def test_model_output_is_cleaned_of_labels_preambles_and_stray_headings():
    raw = ("Here is the abridged text:\n\n## Section B\n\nFirst paragraph.\n\n# Invented heading\n\n"
           "**Second paragraph.**\n\n(Word count: 212)")
    assert clean_output(raw, headings=["Section B"]) == "## Section B\n\nFirst paragraph.\n\nSecond paragraph."


def test_markers_are_deduplicated_and_missing_ones_placed_proportionally():
    output = "One.\n\nTwo [[FIG 2]] inline.\n\n[[FIG 2]]\n\n[[FIG 9]]\n\nThree.\n\nFour."
    source = ["a", "[[FIG 1: x]]", "b", "c", "[[FIG 2: y]]", "d"]
    text, missing = place(output, [1, 2], source)
    assert missing == [1]
    assert text.split("\n\n") == ["One.", "[[FIG 1]]", "Two inline.", "[[FIG 2]]", "Three.", "Four."]


def test_checks_band_follows_the_target():
    assert checks.band(0.25) == (pytest.approx(0.1375), pytest.approx(0.405))
    report = checks.check_part("source", "out", "en", 0.25, 1000, 600)
    assert not report.in_band and report.flags() == ["length 60% outside 14%-40%"]


def test_png_helper_used_here_is_valid():
    assert png(4, 4).startswith(b"\x89PNG")


# ---- proofreading (Russian and Ukrainian slips) ---------------------------------------------------

def test_proofreading_applies_spelling_sized_fixes_only():
    from worker.tools.reader.abridge.proofread import acceptable, pairs_of

    text = "Війна послабила контроль над землями Реччю Посполитою. У груді 1653 року греко-колицькі священники пішли."
    source = "Річ Посполита втратила контроль. У грудні 1653 року греко-католицькі священники пішли. Хмельницький."
    answer = ("WRONG: Реччю | RIGHT: Річчю\nWRONG: У груді 1653 | RIGHT: У грудні 1653\nWRONG: колицькі | RIGHT: католицькі\n"
              "WRONG: 1653 | RIGHT: 1654\nWRONG: послабила контроль над землями | RIGHT: змусила Польщу відступити з усіх її володінь\n"
              "WRONG: Хмельницький | RIGHT: Хмельницкий\nWRONG: пішли | RIGHT: ушли")
    verdicts = {wrong: acceptable(wrong, right, text, source, "uk") for wrong, right in pairs_of(answer)}

    assert verdicts["Реччю"] == "" and verdicts["У груді 1653"] == "" and verdicts["колицькі"] == ""
    assert verdicts["1653"] == "changes a number"
    assert verdicts["послабила контроль над землями"] == "a rewrite, not a spelling fix"
    assert verdicts["Хмельницький"] == "not in the text"
    assert verdicts["пішли"] == "the source has these words"      # a real word, whatever the model thinks


def test_proofreading_keeps_the_sources_own_spelling_of_a_name():
    from worker.tools.reader.abridge.proofread import acceptable

    assert acceptable("Гельмес", "Гельмс", "Переводчик Гельмес пришёл.", "Переводчик Гельмес пришёл.", "ru") == \
        "the source has these words"


def test_proofreading_runs_on_every_ukrainian_part_when_switched_on(settings, storage, make_ctx):
    chapter = xhtml("<h1>Розділ 1</h1>" + "".join(f"<p>{paragraph(i, lang='uk')}</p>" for i in range(1, 5)))
    storage.store[("books", "user-1-book.epub")] = epub([("c1.xhtml", chapter), ("c2.xhtml", chapter)],
                                                        toc=[("Розділ 1", "c1.xhtml", []), ("Розділ 2", "c2.xhtml", [])])

    class Proofreading(ScriptedLLM):
        """Writes "Сечі" for the source's "Січі", and as the proofreader spots it."""

        def _answer(self, prompt, last, images):
            if prompt.startswith("Below is a text in Ukrainian"):
                return "WRONG: Сечі | RIGHT: Січі" if "Сечі" in prompt else "NONE"
            if prompt.startswith("Two versions of one sentence"):
                return "The correct answer is **B**." if "Січі" in prompt.split("\nB: ")[1] else "A"
            answer = super()._answer(prompt, last, images)
            return answer.replace("Січі", "Сечі") if "Abridge ONLY" in prompt else answer

    llm = Proofreading()
    result = _run(_settings(settings, abridge_factcheck="off", abridge_proofread=True), storage, make_ctx, llm)

    proofreads = [model for model, p in llm.calls if p.startswith("Below is a text in Ukrainian")]
    assert proofreads == ["checker"] * 4                       # two summaries and two parts, by the checker
    assert not any("You are checking an abridgement" in p for _, p in llm.calls)   # the fact-check stays off
    assert result["proofreadFixes"] == 2                       # once per part; the summaries had no slip
    pages = _epub_pages(storage.store[("books", result["storageKey"])])
    assert not any("Сечі" in html for html in pages.values()) and any("Січі" in html for html in pages.values())
