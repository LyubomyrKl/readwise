"""The summarization pipeline: LLM failures, the job's strategy, formatting and segmentation."""
import asyncio
from unittest.mock import MagicMock

import httpx
import pytest

from worker.tools.reader.summarize.config.settings import SummarizationStrategy
from worker.tools.reader.summarize.core.exceptions import LLMError, LLMResponseError
from worker.tools.reader.summarize.core.models import Chunk, Summary
from worker.tools.reader.summarize.formatting.paragraph_formatter import ParagraphFormatter
from worker.tools.reader.summarize.handler import STRATEGY_MAP, SummarizeHandler
from worker.tools.reader.summarize.llm.async_client import AsyncLLMClient
from worker.tools.reader.summarize.llm.rate_limiter import RetryConfig
from worker.tools.reader.summarize.summarization import ChunkSummarizer, ContextSummarizer, HierarchicalMerger

CHUNK = Chunk(id="c1", content="The harbour opened in 1850. Ferries left every hour.", token_count=9,
              start_char=0, end_char=52)


class _LLM(AsyncLLMClient):
    """Answers every prompt, or fails every call with `error`; records the prompts."""

    def __init__(self, error=None):
        super().__init__(base_url="http://ollama.invalid:11434", model="m", embed_model="e")
        self.error = error
        self.prompts: list[str] = []

    async def complete(self, prompt, system_prompt=None, max_tokens=1000, temperature=0.3):
        self.prompts.append(prompt)
        if self.error is not None:
            raise self.error
        return "The harbour opened in 1850."


def _summary(chunk_id):
    return Summary(chunk_id=chunk_id, content=f"Summary {chunk_id}.", token_count=2, compression_ratio=0.5,
                   original_tokens=4)


def _run(component, client):
    """One LLM-backed step of the pipeline, by the component that makes it."""
    if component == "chunk summarizer":
        step = ChunkSummarizer(client).summarize(CHUNK)
    elif component == "context summarizer":
        step = ContextSummarizer(client, use_entity_tracking=False, use_running_context=False).summarize(CHUNK)
    elif component == "section merge":
        step = HierarchicalMerger(client).merge_summaries([_summary("a"), _summary("b")], "chapter")
    else:
        step = HierarchicalMerger(client).merge_chapters_to_document([_summary("a"), _summary("b")])
    return asyncio.run(step)


COMPONENTS = ["chunk summarizer", "context summarizer", "section merge", "document merge"]


@pytest.mark.parametrize("component", COMPONENTS)
def test_an_unreachable_llm_host_reaches_the_handler_instead_of_a_fallback(component):
    with pytest.raises(httpx.ConnectError):
        _run(component, _LLM(httpx.ConnectError("All connection attempts failed")))


@pytest.mark.parametrize("component", COMPONENTS)
def test_an_http_error_from_the_llm_host_is_not_replaced_by_a_fallback(component):
    with pytest.raises(LLMError):
        _run(component, _LLM(LLMError("HTTP error: 500", status_code=500)))


@pytest.mark.parametrize("component", COMPONENTS)
def test_an_unusable_answer_falls_back(component):
    result = _run(component, _LLM(LLMResponseError("Unusable response: KeyError('choices')")))
    assert result.metadata.get("fallback") or result.metadata.get("merge_failed")


def _client(answer):
    """An AsyncLLMClient whose HTTP requests `answer` handles; two attempts, no backoff."""
    client = AsyncLLMClient(base_url="http://ollama.test", model="m", embed_model="e",
                            retry_config=RetryConfig(max_attempts=2, base_delay=0, jitter=False))
    client._client = httpx.AsyncClient(base_url="http://ollama.test", transport=httpx.MockTransport(answer))
    return client


def _complete(client):
    async def go():
        async with client:
            return await client.complete("Summarize this.")
    return asyncio.run(go())


def test_client_lets_transport_errors_through_after_its_retries():
    requests = []

    def refuse(request):
        requests.append(request)
        raise httpx.ConnectError("All connection attempts failed", request=request)

    with pytest.raises(httpx.ConnectError):
        _complete(_client(refuse))
    assert len(requests) == 2


def test_client_tells_http_errors_from_unusable_answers():
    with pytest.raises(LLMError) as excinfo:
        _complete(_client(lambda request: httpx.Response(500, text="model runner crashed")))
    assert excinfo.value.status_code == 500 and not isinstance(excinfo.value, LLMResponseError)

    for unusable in (httpx.Response(200, text="not json"), httpx.Response(200, json={"choices": []})):
        with pytest.raises(LLMResponseError):
            _complete(_client(lambda request, response=unusable: response))

    answer = {"choices": [{"message": {"content": " A summary. "}}]}
    assert _complete(_client(lambda request: httpx.Response(200, json=answer))) == "A summary."


@pytest.mark.parametrize("mode", ["fast", "balanced", "quality"])
def test_the_jobs_strategy_reaches_the_summarizer(settings, mode):
    handler = SummarizeHandler(settings.model_copy(update={"pipeline_mode": mode}), MagicMock())

    async def summarizer_of(pipeline):
        async with pipeline:
            return pipeline._summarizer

    for name, strategy in STRATEGY_MAP.items():
        pipeline = handler._pipeline_builder().with_strategy(strategy).build()  # what each job does
        assert asyncio.run(summarizer_of(pipeline)).strategy == strategy, name


def test_the_chunk_summarizer_uses_the_strategys_prompts():
    client = _LLM()
    asyncio.run(ChunkSummarizer(client, strategy=SummarizationStrategy.TWO_PASS).summarize(CHUNK))
    assert len(client.prompts) == 2 and client.prompts[0].startswith("Analyze this text and extract ALL key information")


def test_the_formatter_spaces_run_together_sentences_and_nothing_else():
    text = "Revenue grew 3.5% to $1,250,000 at 10:30 on example.com, and the CEO said she didn't expect it.It was a record."
    assert ParagraphFormatter().format(text) == text.replace("it.It", "it. It")


def test_text_too_short_to_segment_is_one_section(monkeypatch):
    from worker.tools.reader.summarize.segmentation import segmenter

    note = "The ferry schedule changed in May. Residents complained. The council listened."
    monkeypatch.setattr(segmenter, "split_into_sentences", lambda text: text.split(". "))  # fewer than a window

    result = segmenter.DeterministicSegmenter("http://ollama.invalid:11434", "m", "e").segment_text_to_json(note)

    assert [(s["title"], s["content"], s["subsections"]) for s in result["sections"]] == [("Complete Text", note, [])]


def test_segmentation_does_not_judge_boundaries_without_the_llm_host(monkeypatch):
    """The checkpoint keeps the segmentation, so one made while the host was gone must not be finished."""
    import requests

    from worker.tools.reader.summarize.segmentation import ollama_client
    from worker.tools.reader.summarize.segmentation.llm_verifier import generate_title, verify_boundary
    from worker.tools.reader.summarize.segmentation.models import Boundary, Sentence

    client = ollama_client.OllamaClient("http://ollama.invalid:11434", "m", "e")
    sentences = [Sentence(text=f"Sentence {i}.", start_char=12 * i, end_char=12 * i + 11, index=i) for i in range(4)]
    candidate = lambda: Boundary(char_offset=24, sentence_idx=2, score=0.0)

    def refused(*args, **kwargs):
        raise requests.ConnectionError("Max retries exceeded (Connection refused)")

    monkeypatch.setattr(ollama_client.requests, "post", refused)
    with pytest.raises(requests.ConnectionError):
        verify_boundary(candidate(), sentences, "text", client)
    with pytest.raises(requests.ConnectionError):
        generate_title("Some text.", client)

    unusable = MagicMock(status_code=200, json=lambda: {"response": "not json"})
    monkeypatch.setattr(ollama_client.requests, "post", lambda *args, **kwargs: unusable)
    assert verify_boundary(candidate(), sentences, "text", client).keep is False, "an unusable answer still falls back"
    assert generate_title("Some text.", client) == "Untitled Section"


def test_segmentation_asks_the_llm_for_reproducible_answers(monkeypatch):
    from worker.tools.reader.summarize.segmentation import ollama_client

    sent = {}

    def post(url, json, timeout):
        sent.update(json)
        return MagicMock(status_code=200, json=lambda: {"response": '{"keep": false}'})

    monkeypatch.setattr(ollama_client.requests, "post", post)

    assert ollama_client.OllamaClient("http://ollama.invalid:11434", "m", "e").call_llm("Verify.") == {"keep": False}
    assert sent["options"]["temperature"] == 0 and isinstance(sent["options"]["seed"], int)
