"""Resumable summarization: checkpoint bookkeeping and S3 persistence."""
from botocore.exceptions import ClientError

from checkpoint.manager import CHECKPOINT_BUCKET, Checkpoint, CheckpointManager


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
                    summary_percent=0.25, total_sections=2)
    cp.add_completed_section(1, {"title": "two"})

    restored = Checkpoint.from_dict(cp.to_dict())

    assert (restored.book_id, restored.summary_type, restored.strategy, restored.summary_percent) == (
        "book-1", "abstractive", "hybrid", 0.25)
    assert restored.completed_section_indices == [1]
    assert restored.completed_sections == [{"title": "two"}]
    assert restored.total_sections == 2


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


def test_checkpoints_are_keyed_per_book_and_summary_type():
    s3 = _FakeS3Storage()
    manager = CheckpointManager(s3)
    for summary_type in ("extractive", "abstractive"):
        manager.save(Checkpoint(book_id="book-1", summary_type=summary_type, strategy="basic",
                                summary_percent=0.3, total_sections=1))

    assert manager.exists("book-1", "extractive") and manager.exists("book-1", "abstractive")
    assert not manager.exists("book-2", "extractive")
    assert len(s3.store) == 2
