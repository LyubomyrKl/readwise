"""reader.summarize: waiting for the LLM host, resuming, cancelling, storing the result."""
import json
import re
from unittest.mock import MagicMock

import httpx
import pytest

from conftest import make_envelope
from worker.platform import llm
from worker.platform.jobs import JobCancelled, JobFailed, JobInterrupted
from worker.tools.reader.summarize.handler import SummarizeHandler, ensure_subsections, extracted_content
from worker.tools.reader.summarize.llm.async_client import AsyncLLMClient

EXTRACTION = "# Book Extraction: book-1\n\n## Content\n\nOnce upon a time there was a text.\n"
EXTRACTION_KEY = ("extractions", "extraction/book-1_extraction.md")
SUMMARY_KEY = ("summaries", "summary/book-1/sum-1.json")
CHECKPOINT_KEY = ("checkpoints", "checkpoint/book-1_abstractive.json")
PARAGRAPHS = [f"P{i} " + f"Paragraph {i} tells part {i} of the story in plain words. " * 3 for i in range(1, 7)]
BOOK = "# Book Extraction: book-1\n\n## Content\n\n" + " ".join(PARAGRAPHS)


def _payload(**overrides):
    base = {"bookId": "book-1", "summaryId": "sum-1", "extractionStorageKey": "extraction/book-1_extraction.md",
            "summaryType": "abstractive", "strategy": "two_pass", "summaryPercent": 0.4, "title": "A Book"}
    base.update(overrides)
    return base


def _ctx(make_ctx, **overrides):
    return make_ctx(make_envelope(type="reader.summarize", payload=_payload(**overrides)))


def _fake_pipeline(sections=("one", "two")):
    def run(ctx, json_data, book_id, summary_type, strategy, percent, title, checkpoint=None):
        total = len(json_data["sections"])
        for i, title_ in enumerate(json_data["sections"], start=1):
            ctx.progress(f"section {i}/{total} done", 5 + int(90 * i / total))
            ctx.check_cancelled()
        return {"sections": [{"id": s, "title": s, "content": f"summary of {s}"} for s in sections]}, {
            "original_tokens": 100, "summary_tokens": 30, "compression_ratio": 0.3}
    return run


def _segment(text):
    return {"sections": [
        {"id": "one", "title": "one", "level": "chapter", "content": text, "subsections": []},
        {"id": "two", "title": "two", "level": "chapter", "content": text, "subsections": []},
    ]}


def _sections(*cuts):
    """A segmenter cutting BOOK's paragraphs at these indices: _sections(0, 2, 6) is P1-P2 | P3-P6."""
    def segment(text):
        return {"sections": [{"id": f"s{i}", "title": f"S{i}", "level": "chapter",
                              "content": " ".join(PARAGRAPHS[a:b]), "subsections": []}
                             for i, (a, b) in enumerate(zip(cuts, cuts[1:]))]}
    return segment


class _LLM(AsyncLLMClient):
    """Summarizes a chunk as the paragraph markers it saw; can fail one call or act on each."""

    def __init__(self, fail_call=None, on_call=None):
        super().__init__(base_url="http://ollama.invalid:11434", model="m", embed_model="e")
        self.prompts: list[str] = []
        self.fail_call, self.on_call = fail_call, on_call

    async def complete(self, prompt, system_prompt=None, max_tokens=1000, temperature=0.3):
        self.prompts.append(prompt)
        if len(self.prompts) == self.fail_call:
            raise httpx.ConnectError("All connection attempts failed")
        if self.on_call:
            self.on_call(len(self.prompts))
        return " ".join(dict.fromkeys(re.findall(r"\bP\d\b", prompt)))


def _real_pipeline(settings, storage, segment, client):
    """The handler with its real pipeline (fast preset) talking to `client`."""
    handler = SummarizeHandler(settings.model_copy(update={"pipeline_mode": "fast"}), storage, segment=segment)
    handler._pipeline_builder().with_llm_client(client)
    return handler


def _chunk_summaries(storage):
    stored = json.loads(storage.store[SUMMARY_KEY])
    return [[c["content"] for sub in s["subsections"] for c in sub["chunks"]] for s in stored["sections"]]


def _cancel_after_first_section(settings, storage, publisher, make_ctx):
    """Runs the job on P1-P2 | P3-P4 | P5-P6 until a cancel stops it after section 1."""
    client = _LLM(on_call=lambda n: publisher.cancel_now("job-1"))
    with pytest.raises(JobCancelled):
        _real_pipeline(settings, storage, _sections(0, 2, 4, 6), client)(_ctx(make_ctx, strategy="basic"))
    publisher.cancelled.clear()
    assert json.loads(storage.store[CHECKPOINT_KEY])["completed_section_indices"] == [0]


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)


def test_waits_for_the_llm_host_then_summarizes_and_stores_the_json(settings, storage, publisher, make_ctx, monkeypatch):
    storage.store[EXTRACTION_KEY] = EXTRACTION
    probes = iter([False, False, True, True, True])
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: next(probes))
    handler = SummarizeHandler(settings, storage, run_pipeline=_fake_pipeline(), segment=_segment)

    result = handler(_ctx(make_ctx))

    assert result["storageKey"] == "summary/book-1/sum-1.json"
    assert result["metadata"]["summarization_strategy"] == "two_pass"
    assert result["metadata"]["sections"] == 2
    assert isinstance(result["metadata"]["segmentation_seconds"], float)
    assert isinstance(result["metadata"]["summarization_seconds"], float)
    stored = json.loads(storage.store[SUMMARY_KEY])
    assert [s["title"] for s in stored["sections"]] == ["one", "two"]
    upload = storage.uploads[-1]
    assert upload["content_type"] == "application/json" and upload["metadata"]["summary_type"] == "abstractive"

    kinds = publisher.kinds()
    assert kinds[:3] == ["waiting", "waiting", "progress"], "two failed probes -> two waiting events, then resumed"
    assert publisher.events[0].reason.startswith("LLM host unreachable")
    assert publisher.events[0].stage == "waiting for LLM host"
    assert publisher.events[2].stage == "LLM host reachable"
    assert kinds[-1] == "progress"
    stages = [e.stage for e in publisher.events if e.event == "progress"]
    assert "segmenting" in stages and "section 2/2 done" in stages and stages[-1] == "storing summary"


def test_host_disappearing_mid_run_waits_and_resumes_after_the_finished_sections(settings, storage, publisher, make_ctx,
                                                                                 monkeypatch):
    storage.store[EXTRACTION_KEY] = BOOK
    client = _LLM(fail_call=2)  # the host goes away while section 2 is summarized
    handler = _real_pipeline(settings, storage, _sections(0, 2, 4, 6), client)
    # pre-check: up; after the error: down (handler) and down (wait_for_llm, reports waiting); then up
    probes = iter([True, False, False, True])
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: next(probes, True))

    result = handler(_ctx(make_ctx, strategy="basic"))

    assert "waiting" in publisher.kinds()
    assert _chunk_summaries(storage) == [["P1 P2"], ["P3 P4"], ["P5 P6"]], "summaries, never the sections' own text"
    assert result["metadata"]["resumed_sections"] == 1
    assert sum("P1" in prompt for prompt in client.prompts) == 1, "the finished section is not summarized again"


def test_a_resume_reuses_the_stored_segmentation(settings, storage, publisher, make_ctx, monkeypatch):
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: True)
    storage.store[EXTRACTION_KEY] = BOOK
    _cancel_after_first_section(settings, storage, publisher, make_ctx)
    segment_again = MagicMock(side_effect=_sections(0, 1, 4, 6))  # would cut the book differently

    result = _real_pipeline(settings, storage, segment_again, _LLM())(_ctx(make_ctx, strategy="basic"))

    segment_again.assert_not_called()
    assert _chunk_summaries(storage) == [["P1 P2"], ["P3 P4"], ["P5 P6"]]
    assert result["metadata"]["resumed_sections"] == 1
    assert CHECKPOINT_KEY not in storage.store, "deleted once the summary is stored"


def test_a_checkpoint_made_for_another_text_is_not_resumed(settings, storage, publisher, make_ctx, monkeypatch):
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: True)
    storage.store[EXTRACTION_KEY] = BOOK
    _cancel_after_first_section(settings, storage, publisher, make_ctx)
    storage.store[EXTRACTION_KEY] = BOOK.replace("story", "tale")  # extracted again since
    segment_again = MagicMock(side_effect=_sections(0, 3, 6))

    result = _real_pipeline(settings, storage, segment_again, _LLM())(_ctx(make_ctx, strategy="basic"))

    segment_again.assert_called_once()
    assert _chunk_summaries(storage) == [["P1 P2 P3"], ["P4 P5 P6"]]
    assert result["metadata"]["resumed_sections"] == 0


def test_worker_stopping_ends_the_run_after_the_current_section(settings, storage, publisher, make_ctx, monkeypatch):
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: True)
    storage.store[EXTRACTION_KEY] = BOOK
    sigterm = _LLM(on_call=lambda n: publisher.states["job-1"].interrupt_requested.set())  # while section 1 runs

    with pytest.raises(JobInterrupted):
        _real_pipeline(settings, storage, _sections(0, 2, 4, 6), sigterm)(_ctx(make_ctx, strategy="basic"))

    assert json.loads(storage.store[CHECKPOINT_KEY])["completed_section_indices"] == [0], "section 1 is kept"
    assert len(sigterm.prompts) == 1 and SUMMARY_KEY not in storage.store


def test_a_summary_already_stored_is_not_made_again(settings, storage, publisher, make_ctx, monkeypatch):
    storage.store[SUMMARY_KEY] = '{"sections": []}'
    monkeypatch.setattr(llm, "probe_ollama", MagicMock(side_effect=AssertionError("the LLM host is not needed")))
    run = MagicMock()

    result = SummarizeHandler(settings, storage, run_pipeline=run, segment=_segment)(_ctx(make_ctx))

    assert result == {"storageKey": "summary/book-1/sum-1.json", "metadata": {"skipped": True}}
    run.assert_not_called()
    assert publisher.kinds() == ["progress"]


def test_text_the_segmentation_loses_fails_without_retry(settings, storage, make_ctx, monkeypatch):
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: True)
    storage.store[EXTRACTION_KEY] = BOOK
    nothing = lambda text: {"sections": []}  # what the segmenter returned for short texts

    with pytest.raises(JobFailed) as excinfo:
        _real_pipeline(settings, storage, nothing, _LLM())(_ctx(make_ctx, strategy="basic"))

    assert excinfo.value.retryable is False
    assert CHECKPOINT_KEY not in storage.store and SUMMARY_KEY not in storage.store


def test_a_chapters_text_before_its_first_subsection_is_summarized(settings, storage, make_ctx, monkeypatch):
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: True)
    storage.store[EXTRACTION_KEY] = BOOK

    def chapter(text):
        return {"sections": [{"id": "ch", "title": "Harbour", "level": "chapter", "content": " ".join(PARAGRAPHS[:2]),
                              "subsections": [{"id": "sub", "title": "Ferries", "level": "subsection",
                                               "content": " ".join(PARAGRAPHS[2:])}]}]}

    _real_pipeline(settings, storage, chapter, _LLM())(_ctx(make_ctx, strategy="basic"))

    assert _chunk_summaries(storage) == [["P1 P2", "P3 P4 P5 P6"]]


def test_other_errors_fail_the_job(settings, storage, make_ctx, monkeypatch):
    storage.store[EXTRACTION_KEY] = EXTRACTION
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: True)

    def broken(*args):
        raise ValueError("model returned garbage")

    with pytest.raises(ValueError):
        SummarizeHandler(settings, storage, run_pipeline=broken, segment=_segment)(_ctx(make_ctx))


def test_cancel_while_waiting_for_the_host(settings, storage, publisher, make_ctx, monkeypatch):
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: False)
    ctx = _ctx(make_ctx)
    publisher.cancel_now("job-1")

    with pytest.raises(JobCancelled):
        SummarizeHandler(settings, storage, run_pipeline=_fake_pipeline(), segment=_segment)(ctx)
    assert publisher.kinds() == ["waiting"]


def test_cancel_between_sections_stops_the_pipeline(settings, storage, publisher, make_ctx, monkeypatch):
    storage.store[EXTRACTION_KEY] = EXTRACTION
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: True)

    def run(ctx, json_data, *args):
        ctx.progress("section 1/2 done", 50)
        publisher.cancel_now(ctx.job_id)
        ctx.check_cancelled()
        raise AssertionError("unreachable")

    with pytest.raises(JobCancelled):
        SummarizeHandler(settings, storage, run_pipeline=run, segment=_segment)(_ctx(make_ctx))
    assert SUMMARY_KEY not in storage.store


@pytest.mark.parametrize("payload,message", [
    ({"extractionStorageKey": None}, "extractionStorageKey"),
    ({"summaryType": "poetic"}, "unknown summary type"),
    ({"strategy": "magic"}, "unknown strategy"),
])
def test_bad_payloads_fail_without_retry(settings, storage, make_ctx, payload, message):
    with pytest.raises(JobFailed) as excinfo:
        SummarizeHandler(settings, storage, run_pipeline=_fake_pipeline(), segment=_segment)(_ctx(make_ctx, **payload))
    assert excinfo.value.retryable is False and message in str(excinfo.value)


def test_extracted_content_strips_the_header():
    assert extracted_content(EXTRACTION) == "Once upon a time there was a text."
    assert extracted_content("plain") == "plain"


def test_connection_error_heuristic():
    assert llm.looks_like_connection_error(httpx.ConnectError("boom"))
    assert llm.looks_like_connection_error(Exception("Ollama embedding error: HTTPConnectionPool(host='x', port=11434): Max retries exceeded"))
    try:
        raise RuntimeError("wrapped") from ConnectionRefusedError(111, "Connection refused")
    except RuntimeError as chained:
        assert llm.looks_like_connection_error(chained)
    assert not llm.looks_like_connection_error(ValueError("bad json"))


def test_ensure_subsections_hands_every_sections_own_text_to_the_pipeline():
    data = {"sections": [
        {"id": "s1", "title": "Complete Text", "level": "chapter", "start_char": 0, "end_char": 12, "content": "Short book.", "subsections": []},
        {"id": "s2", "title": "Chapter 2", "level": "chapter", "content": "intro", "subsections": [{"id": "s2.1", "title": "2.1", "content": "body"}]},
        {"id": "s3", "title": "Empty", "level": "chapter", "content": "   ", "subsections": []},
    ]}

    out = ensure_subsections(data)

    assert out["sections"][0]["subsections"] == [{
        "id": "s1-all", "title": "Complete Text", "level": "subsection", "start_char": 0, "end_char": 12, "content": "Short book.",
    }]
    assert out["sections"][1]["subsections"] == [
        {"id": "s2-intro", "title": "Chapter 2", "level": "subsection", "start_char": 0, "end_char": 5, "content": "intro"},
        {"id": "s2.1", "title": "2.1", "content": "body"},
    ], "the chapter's text before its first subsection comes first; existing subsections untouched"
    assert out["sections"][2]["subsections"] == [], "nothing to summarize stays empty"


def test_handler_feeds_the_pipeline_sections_with_subsections(settings, storage, publisher, make_ctx, monkeypatch):
    storage.store[EXTRACTION_KEY] = EXTRACTION
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: True)
    seen = {}

    def run(ctx, json_data, *args):
        seen["sections"] = json_data["sections"]
        return {"sections": []}, {}

    def unsplit(text):
        return {"sections": [{"id": "s1", "title": "Complete Text", "level": "chapter", "content": text, "subsections": []}]}

    SummarizeHandler(settings, storage, run_pipeline=run, segment=unsplit)(_ctx(make_ctx))

    assert seen["sections"][0]["subsections"][0]["content"] == "Once upon a time there was a text."
