"""The old pipeline's quick fixes: the fact-check verdict, the requested percent, batched embeddings."""
import numpy as np
import pytest

from worker.tools.reader.summarize.orchestration.pipeline import scale_ratio
from worker.tools.reader.summarize.segmentation import ollama_client as client_module
from worker.tools.reader.summarize.segmentation.ollama_client import OllamaClient
from worker.tools.reader.summarize.validation.quality_metrics import is_accurate_verdict


@pytest.mark.parametrize("answer", [
    "ACCURATE",
    "ACCURATE. The summary reflects the original text faithfully and adds nothing.",
    "**Accurate.**\nNo factual errors were found.",
    "None",
    "No issues found.",
])
def test_a_leading_no_problems_verdict_is_accurate_however_long_the_explanation(answer):
    assert is_accurate_verdict(answer)


@pytest.mark.parametrize("answer", [
    "INACCURATE: the summary says 1812, the source says 1821.",
    "1. The summary attributes the quote to Seneca; the source attributes it to Cato.",
    "",
])
def test_problems_or_nothing_are_not_accurate(answer):
    assert not is_accurate_verdict(answer)


def test_adaptive_ratio_is_centred_on_the_requested_percent():
    assert scale_ratio(0.3, 0.4, 0.3) == pytest.approx(0.4)
    assert scale_ratio(0.45, 0.2, 0.3) == pytest.approx(0.3)   # a dense chunk still keeps more than average
    assert scale_ratio(0.3, None, 0.3) == 0.3                  # no request: unchanged
    assert scale_ratio(0.5, 0.9, 0.3) == 0.9                   # clamped


class _Response:
    def __init__(self, status, body=None, text=""):
        self.status_code = status
        self._body = body or {}
        self.text = text

    def json(self):
        return self._body


def test_embeddings_are_requested_in_batches_and_normalized(monkeypatch):
    requests_seen = []

    def post(url, json, timeout):
        requests_seen.append((url, list(json["input"])))
        return _Response(200, {"embeddings": [[3.0, 4.0] for _ in json["input"]]})

    monkeypatch.setattr(client_module.requests, "post", post)
    client = OllamaClient(base_url="http://ollama.test", llm_model="m", embed_model="e")

    vectors = client.get_embeddings([f"w{i}" for i in range(5)], batch_size=2)

    assert [len(batch) for _, batch in requests_seen] == [2, 2, 1]
    assert all(url == "http://ollama.test/api/embed" for url, _ in requests_seen)
    assert len(vectors) == 5 and np.allclose(vectors[0], [0.6, 0.8])
    assert client.calls["embeddings"] == 3


def test_a_server_without_the_batch_endpoint_gets_one_request_per_text(monkeypatch):
    def post(url, json, timeout):
        if url.endswith("/api/embed"):
            return _Response(404, text="404 page not found")
        return _Response(200, {"embedding": [1.0, 0.0]})

    monkeypatch.setattr(client_module.requests, "post", post)
    client = OllamaClient(base_url="http://ollama.test", llm_model="m", embed_model="e")

    vectors = client.get_embeddings(["a", "b", "c"])

    assert len(vectors) == 3 and client.calls["embeddings"] == 3


def test_a_missing_embedding_model_is_an_error_not_a_fallback(monkeypatch):
    monkeypatch.setattr(client_module.requests, "post",
                        lambda url, json, timeout: _Response(404, text='{"error":"model \\"e\\" not found"}'))
    client = OllamaClient(base_url="http://ollama.test", llm_model="m", embed_model="e")

    with pytest.raises(Exception, match="404"):
        client.get_embeddings(["a"])
