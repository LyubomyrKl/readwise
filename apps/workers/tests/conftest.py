"""Shared test doubles: in-memory storage, a recording publisher, envelope factory.

Nothing here connects to RabbitMQ, MinIO or an LLM host.
"""
from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

import pytest
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT.parents[1] / "packages" / "contracts" / "jobs"

os.environ.setdefault("OLLAMA_BASE_URL", "http://ollama.invalid:11434")
os.environ.setdefault("OLLAMA_MODEL", "test-model")
os.environ.setdefault("OLLAMA_EMBED_MODEL", "test-embed")
os.environ.setdefault("WORKER_LLM_WAIT_MIN_SECONDS", "1")
os.environ.setdefault("WORKER_LLM_WAIT_MAX_SECONDS", "2")

from worker.platform.contracts import JobEnvelope, JobEvent  # noqa: E402
from worker.platform.events import JobState  # noqa: E402
from worker.platform.settings import WorkerSettings  # noqa: E402


def _client_error(code: str, operation: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": code}}, operation)


class _FakeClient:
    """The boto3 subset the checkpoint manager and the extractors' save path use."""

    def __init__(self, store: dict):
        self.store = store

    def head_bucket(self, Bucket):
        return {}

    def head_object(self, Bucket, Key):
        if (Bucket, Key) not in self.store:
            raise _client_error("404", "HeadObject")
        return {}

    def delete_object(self, Bucket, Key):
        self.store.pop((Bucket, Key), None)

    def put_object(self, Bucket, Key, Body, **_kwargs):
        self.store[(Bucket, Key)] = Body.decode("utf-8") if isinstance(Body, bytes) else Body


class FakeStorage:
    """Mirrors worker.platform.storage.S3Storage over a dict keyed by (bucket, key)."""

    def __init__(self):
        self.store: dict[tuple[str, str], str] = {}
        self.client = _FakeClient(self.store)
        self.endpoint = "http://minio.test:9000"
        self.access_key = "k"
        self.secret_key = "s"
        self.uploads: list[dict[str, Any]] = []

    def download_text(self, bucket, key):
        if (bucket, key) not in self.store:
            raise _client_error("NoSuchKey", "GetObject")
        return self.store[(bucket, key)]

    def upload_text(self, bucket, key, content, content_type="text/plain", metadata=None):
        self.store[(bucket, key)] = content
        self.uploads.append({"bucket": bucket, "key": key, "content_type": content_type, "metadata": metadata or {}})
        return key

    def object_exists(self, bucket, key):
        return (bucket, key) in self.store

    summary_key = staticmethod(lambda book_id, summary_id: f"summary/{book_id}/{summary_id}.json")

    def upload_summary(self, bucket, book_id, summary_id, summary_json, summary_type, metadata):
        key = self.summary_key(book_id, summary_id)
        self.upload_text(bucket, key, summary_json, "application/json",
                         {"summary_type": summary_type, **{k: str(v) for k, v in metadata.items()}})
        return key


class FakePublisher:
    """Records events instead of publishing; cancellation can be injected."""

    def __init__(self):
        self.events: list[JobEvent] = []
        self.cancelled: set[str] = set()
        self.states: dict[str, JobState] = {}
        self.flushed = 0

    def emit(self, event: JobEvent):
        self.events.append(event)

    def register(self, state: JobState, published_at=None):
        self.states[state.job_id] = state
        if state.job_id in self.cancelled:
            state.cancel_requested.set()

    def unregister(self, job_id: str):
        self.states.pop(job_id, None)

    def was_cancelled(self, job_id: str, published_at=None) -> bool:
        return job_id in self.cancelled

    def flush(self, timeout: float = 0) -> bool:
        self.flushed += 1
        return True

    # helpers
    def kinds(self) -> list[str]:
        return [e.event for e in self.events]

    def last(self) -> JobEvent:
        return self.events[-1]

    def cancel_now(self, job_id: str):
        """Simulate a control message arriving while the job runs."""
        self.cancelled.add(job_id)
        state = self.states.get(job_id)
        if state:
            state.cancel_requested.set()


def make_envelope(**overrides) -> JobEnvelope:
    base = {
        "v": 1,
        "jobId": "job-1",
        "type": "reader.extract",
        "toolId": "reader",
        "userId": "user-1",
        "attempt": 1,
        "publishedAt": "2026-10-25T10:00:00+00:00",
        "correlationId": None,
        "payload": {"bookId": "book-1", "fileStorageKey": "user-1-1-book.pdf", "mime": "application/pdf", "title": "A Book"},
    }
    base.update(overrides)
    return JobEnvelope.model_validate(base)


@pytest.fixture
def settings() -> WorkerSettings:
    return WorkerSettings(_env_file=None, worker_id="workers-test", worker_llm_wait_min_seconds=1,
                          worker_llm_wait_max_seconds=2, ollama_base_url="http://ollama.invalid:11434",
                          ollama_model="m", ollama_embed_model="e")


@pytest.fixture
def storage() -> FakeStorage:
    return FakeStorage()


@pytest.fixture
def publisher() -> FakePublisher:
    return FakePublisher()


@pytest.fixture
def make_ctx(settings, storage, publisher):
    """Builds a JobContext bound to the fakes (registered with the publisher like the runner does)."""
    from worker.platform.jobs import JobContext

    def _make(envelope: JobEnvelope | None = None):
        envelope = envelope or make_envelope()
        state = JobState(envelope.jobId, envelope.attempt)
        publisher.register(state)
        return JobContext(envelope, state, publisher, settings, storage, settings.worker_id)

    return _make


__all__ = ["FakeStorage", "FakePublisher", "make_envelope", "CONTRACTS", "threading"]
