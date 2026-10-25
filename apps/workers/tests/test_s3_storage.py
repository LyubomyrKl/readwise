"""Summary objects: key layout and the metadata recorded next to them."""
from worker.platform.storage import S3Storage


class _FakeClient:
    def __init__(self):
        self.puts = []

    def put_object(self, **kwargs):
        self.puts.append(kwargs)


def _storage():
    s = S3Storage.__new__(S3Storage)
    s.client = _FakeClient()
    return s


def test_upload_summary_keys_by_book_and_summary_and_records_strategy():
    s = _storage()

    key = s.upload_summary(
        bucket="summaries", book_id="book-1", summary_id="sum-1", summary_json='{"sections": []}',
        summary_type="abstractive",
        metadata={"original_tokens": 1200, "summary_tokens": 300, "compression_ratio": 0.25,
                  "summarization_strategy": "two_pass"},
    )

    assert key == "summary/book-1/sum-1.json" == S3Storage.summary_key("book-1", "sum-1")
    (put,) = s.client.puts
    assert put["Bucket"] == "summaries" and put["Key"] == key
    assert put["ContentType"] == "application/json"
    assert put["Body"] == b'{"sections": []}'
    assert put["Metadata"] == {
        "book_id": "book-1", "summary_id": "sum-1", "summary_type": "abstractive", "original_tokens": "1200",
        "summary_tokens": "300", "compression_ratio": "0.25", "summarization_strategy": "two_pass",
    }


def test_upload_text_makes_metadata_ascii_safe():
    s = _storage()

    s.upload_text(bucket="b", key="k", content="x", metadata={"title": "Café", "pages": 3})

    (put,) = s.client.puts
    assert put["Metadata"] == {"title": "Caf?", "pages": "3"}


def test_from_settings_builds_the_endpoint(monkeypatch):
    from worker.platform.settings import WorkerSettings
    settings = WorkerSettings(_env_file=None, s3_host="minio", s3_port=9000, s3_access_key_id="k", s3_secret_access_key="s")
    assert settings.s3_endpoint_url == "http://minio:9000"
    assert WorkerSettings(_env_file=None, s3_endpoint="https://s3.example").s3_endpoint_url == "https://s3.example"
