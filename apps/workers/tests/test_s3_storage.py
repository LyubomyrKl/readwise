"""Summary objects: key layout and the metadata recorded next to them."""
from shared.s3_storage import S3Storage


class _FakeClient:
    def __init__(self):
        self.puts = []

    def put_object(self, **kwargs):
        self.puts.append(kwargs)


def _storage():
    s = S3Storage.__new__(S3Storage)
    s.client = _FakeClient()
    return s


def test_upload_summary_uses_the_historical_key_and_records_strategy():
    s = _storage()

    key = s.upload_summary(
        bucket="summaries", book_id="book-1", summary_json='{"sections": []}',
        summary_type="abstractive",
        metadata={"original_tokens": 1200, "summary_tokens": 300, "compression_ratio": 0.25,
                  "summarization_strategy": "two_pass"},
    )

    assert key == "summary/book-1_abstractive_summary.json"
    (put,) = s.client.puts
    assert put["Bucket"] == "summaries" and put["Key"] == key
    assert put["ContentType"] == "application/json"
    assert put["Body"] == b'{"sections": []}'
    assert put["Metadata"] == {
        "book_id": "book-1", "summary_type": "abstractive", "original_tokens": "1200",
        "summary_tokens": "300", "compression_ratio": "0.25", "summarization_strategy": "two_pass",
    }


def test_upload_text_makes_metadata_ascii_safe():
    s = _storage()

    s.upload_text(bucket="b", key="k", content="x", metadata={"title": "Café", "pages": 3})

    (put,) = s.client.puts
    assert put["Metadata"] == {"title": "Caf?", "pages": "3"}
