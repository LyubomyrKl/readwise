"""The storage wrapper: object metadata and the endpoint built from the settings."""
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
