"""reader.summarize: waiting for the LLM host, resuming, cancelling, storing the result."""
import json

import httpx
import pytest

from conftest import make_envelope
from worker.platform import llm
from worker.platform.jobs import JobCancelled, JobFailed
from worker.tools.reader.summarize.handler import SummarizeHandler, extracted_content

EXTRACTION = "# Book Extraction: book-1\n\n## Content\n\nOnce upon a time there was a text.\n"


def _payload(**overrides):
    base = {"bookId": "book-1", "summaryId": "sum-1", "extractionStorageKey": "extraction/book-1_extraction.md",
            "summaryType": "abstractive", "strategy": "two_pass", "summaryPercent": 0.4, "title": "A Book"}
    base.update(overrides)
    return base


def _ctx(make_ctx, **overrides):
    return make_ctx(make_envelope(type="reader.summarize", payload=_payload(**overrides)))


def _fake_pipeline(sections=("one", "two")):
    def run(ctx, json_data, book_id, summary_type, strategy, percent, title):
        total = len(json_data["sections"])
        for i, title_ in enumerate(json_data["sections"], start=1):
            ctx.progress(f"section {i}/{total} done", 5 + int(90 * i / total))
            ctx.check_cancelled()
        return {"sections": [{"id": s, "title": s, "content": f"summary of {s}"} for s in sections]}, {
            "original_tokens": 100, "summary_tokens": 30, "compression_ratio": 0.3}
    return run


def _segment(text):
    return {"sections": ["one", "two"]}


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)


def test_waits_for_the_llm_host_then_summarizes_and_stores_the_json(settings, storage, publisher, make_ctx, monkeypatch):
    storage.store[("extractions", "extraction/book-1_extraction.md")] = EXTRACTION
    probes = iter([False, False, True, True, True])
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: next(probes))
    handler = SummarizeHandler(settings, storage, run_pipeline=_fake_pipeline(), segment=_segment)

    result = handler(_ctx(make_ctx))

    assert result["storageKey"] == "summary/book-1/sum-1.json"
    assert result["metadata"]["summarization_strategy"] == "two_pass"
    stored = json.loads(storage.store[("summaries", "summary/book-1/sum-1.json")])
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


def test_host_disappearing_mid_run_waits_and_restarts_the_stage(settings, storage, publisher, make_ctx, monkeypatch):
    storage.store[("extractions", "extraction/book-1_extraction.md")] = EXTRACTION
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: True)
    attempts = {"n": 0}

    def flaky(ctx, json_data, *args):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise httpx.ConnectError("All connection attempts failed")
        return _fake_pipeline()(ctx, json_data, *args)

    handler = SummarizeHandler(settings, storage, run_pipeline=flaky, segment=_segment)
    # pre-check: up; after the error: down (handler) and down (wait_for_llm, reports waiting); then up
    probes = iter([True, False, False, True])
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: next(probes, True))

    result = handler(_ctx(make_ctx))

    assert attempts["n"] == 2
    assert result["storageKey"] == "summary/book-1/sum-1.json"
    assert "waiting" in publisher.kinds()


def test_other_errors_fail_the_job(settings, storage, make_ctx, monkeypatch):
    storage.store[("extractions", "extraction/book-1_extraction.md")] = EXTRACTION
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
    storage.store[("extractions", "extraction/book-1_extraction.md")] = EXTRACTION
    monkeypatch.setattr(llm, "probe_ollama", lambda url, timeout=5.0: True)

    def run(ctx, json_data, *args):
        ctx.progress("section 1/2 done", 50)
        publisher.cancel_now(ctx.job_id)
        ctx.check_cancelled()
        raise AssertionError("unreachable")

    with pytest.raises(JobCancelled):
        SummarizeHandler(settings, storage, run_pipeline=run, segment=_segment)(_ctx(make_ctx))
    assert ("summaries", "summary/book-1/sum-1.json") not in storage.store


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
