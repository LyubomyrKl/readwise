"""Resumable summarization: checkpoint bookkeeping and S3 persistence."""
import pytest
from botocore.exceptions import ClientError

from worker.tools.reader.summarize.checkpoint.manager import (
    CHECKPOINT_BUCKET, Checkpoint, CheckpointManager, CheckpointUnreadable)


def _client_error(code, operation):
    return ClientError({"Error": {"Code": code, "Message": code}}, operation)


class _FakeClient:
    def __init__(self, store):
        self.store = store

    def head_bucket(self, Bucket):
        return {}

    def head_object(self, Bucket, Key):
        if (Bucket, Key) not in self.store:
            raise _client_error("404", "HeadObject")
        return {}

    def delete_object(self, Bucket, Key):
        self.store.pop((Bucket, Key), None)


class _FakeS3Storage:
    """Mirrors the subset of shared.s3_storage.S3Storage the manager uses."""

    def __init__(self):
        self.store = {}
        self.client = _FakeClient(self.store)

    def upload_text(self, bucket, key, content, content_type="text/plain", metadata=None):
        self.store[(bucket, key)] = content
        return key

    def download_text(self, bucket, key):
        if (bucket, key) not in self.store:
            raise _client_error("NoSuchKey", "GetObject")
        return self.store[(bucket, key)]


def test_checkpoint_tracks_progress_and_next_section():
    cp = Checkpoint(book_id="book-1", summary_type="abstractive", strategy="two_pass",
                    summary_percent=0.3, total_sections=3)
    assert cp.progress_percent == 0 and cp.get_next_section_index() == 0 and not cp.is_complete

    cp.add_completed_section(0, {"title": "one"})
    cp.add_completed_section(2, {"title": "three"})
    cp.add_completed_section(0, {"title": "duplicate"})  # ignored

    assert cp.completed_section_indices == [0, 2]
    assert len(cp.completed_sections) == 2
    assert cp.get_next_section_index() == 1
    assert round(cp.progress_percent, 1) == 66.7
    assert not cp.is_complete

    cp.add_completed_section(1, {"title": "two"})
    assert cp.is_complete and cp.get_next_section_index() == 3


def test_checkpoint_round_trips_through_dict():
    cp = Checkpoint(book_id="book-1", summary_type="abstractive", strategy="hybrid",
                    summary_percent=0.25, total_sections=2, extraction_hash="h1",
                    segmentation={"sections": [{"id": "s1"}, {"id": "s2"}]})
    cp.add_completed_section(1, {"title": "two"})

    restored = Checkpoint.from_dict(cp.to_dict())

    assert (restored.book_id, restored.summary_type, restored.strategy, restored.summary_percent) == (
        "book-1", "abstractive", "hybrid", 0.25)
    assert restored.completed_section_indices == [1]
    assert restored.completed_sections == [{"title": "two"}]
    assert restored.total_sections == 2
    assert (restored.extraction_hash, restored.segmentation) == ("h1", {"sections": [{"id": "s1"}, {"id": "s2"}]})


def test_a_checkpoint_resumes_only_the_text_and_request_it_was_made_for():
    cp = Checkpoint(book_id="b", summary_type="abstractive", strategy="basic", summary_percent=0.4,
                    total_sections=1, extraction_hash="h1", segmentation={"sections": [{"id": "s1"}]})

    assert cp.matches("h1", "basic", 0.4)
    assert not cp.matches("h2", "basic", 0.4), "another text"
    assert not cp.matches("h1", "two_pass", 0.4) and not cp.matches("h1", "basic", 0.3), "another request"
    legacy = Checkpoint.from_dict({"book_id": "b", "summary_type": "abstractive", "strategy": "basic",
                                   "summary_percent": 0.4, "total_sections": 1, "completed_section_indices": [0],
                                   "completed_sections": [{"id": "s1"}]})
    assert not legacy.matches("", "basic", 0.4), "written before checkpoints kept their segmentation"


def test_manager_saves_loads_and_deletes_in_the_checkpoints_bucket():
    s3 = _FakeS3Storage()
    manager = CheckpointManager(s3)
    cp = Checkpoint(book_id="book-1", summary_type="abstractive", strategy="two_pass",
                    summary_percent=0.3, total_sections=4)
    cp.add_completed_section(0, {"title": "one"})

    assert manager.load("book-1", "abstractive") is None
    assert not manager.exists("book-1", "abstractive")

    assert manager.save(cp) is True
    assert manager.exists("book-1", "abstractive")
    assert all(bucket == CHECKPOINT_BUCKET for bucket, _ in s3.store)

    loaded = manager.load("book-1", "abstractive")
    assert loaded.completed_section_indices == [0]
    assert loaded.strategy == "two_pass"

    assert manager.delete("book-1", "abstractive") is True
    assert not manager.exists("book-1", "abstractive")
    assert manager.delete("book-1", "abstractive") is True, "deleting twice is harmless"


def test_load_tells_a_missing_checkpoint_from_one_it_cannot_read():
    """Starting over on an unreadable checkpoint would overwrite it with the first finished section."""
    s3 = _FakeS3Storage()
    manager = CheckpointManager(s3)
    assert manager.load("book-1", "abstractive") is None, "missing"

    s3.store[(CHECKPOINT_BUCKET, "checkpoint/book-1_abstractive.json")] = '{"book_id": "book-1", '
    with pytest.raises(CheckpointUnreadable, match="not a valid checkpoint"):
        manager.load("book-1", "abstractive")

    for error in (_client_error("RequestTimeout", "GetObject"), ConnectionResetError(104, "Connection reset by peer")):
        def unavailable(bucket, key, error=error):
            raise error
        s3.download_text = unavailable
        with pytest.raises(CheckpointUnreadable, match="could not be read"):
            manager.load("book-1", "abstractive")


def test_checkpoints_are_keyed_per_book_and_summary_type():
    s3 = _FakeS3Storage()
    manager = CheckpointManager(s3)
    for summary_type in ("extractive", "abstractive"):
        manager.save(Checkpoint(book_id="book-1", summary_type=summary_type, strategy="basic",
                                summary_percent=0.3, total_sections=1))

    assert manager.exists("book-1", "extractive") and manager.exists("book-1", "abstractive")
    assert not manager.exists("book-2", "extractive")
    assert len(s3.store) == 2


def test_manager_uses_the_configured_bucket():
    s3 = _FakeS3Storage()
    manager = CheckpointManager(s3, bucket="my-checkpoints")
    manager.save(Checkpoint(book_id="b", summary_type="abstractive", strategy="basic", summary_percent=0.3, total_sections=1))
    assert list(s3.store) == [("my-checkpoints", "checkpoint/b_abstractive.json")]
    assert manager.exists("b", "abstractive") and manager.delete("b", "abstractive")
