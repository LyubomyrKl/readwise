"""reader.extract reads only its payload and storage."""
import pytest

from conftest import make_envelope
from worker.platform.jobs import JobFailed
from worker.tools.reader.extract.handler import ExtractHandler, clean_text, extraction_key


class _FakeExtractor:
    def __init__(self, text="Hello\n\nworld", metadata=None):
        self.text = text
        self.metadata = metadata or {"total_pages": 2, "pages_processed": 2, "extraction_method": "fake"}
        self.calls = []

    def extract_from_s3_file(self, bucket, file_key):
        self.calls.append(("extract", bucket, file_key))
        return self.text, dict(self.metadata)

    def save_extraction_to_s3(self, bucket, book_id, extracted_text, metadata):
        self.calls.append(("save", bucket, book_id, extracted_text, metadata))
        return extraction_key(book_id)


def test_pdf_is_extracted_cleaned_and_stored_in_the_extractions_bucket(settings, storage, publisher, make_ctx):
    pdf = _FakeExtractor()
    handler = ExtractHandler(settings, storage, extractors={"pdf": pdf, "epub": _FakeExtractor()})

    result = handler(make_ctx())

    assert result["extractionStorageKey"] == "extraction/book-1_extraction.md"
    assert result["metadata"] == {"total_pages": 2, "pages_processed": 2, "extraction_method": "fake"}
    assert pdf.calls[0] == ("extract", "books", "user-1-1-book.pdf")
    assert pdf.calls[1][:4] == ("save", "extractions", "book-1", "Hello world")
    assert [e.stage for e in publisher.events] == ["extracting pdf", "cleaning text", "storing extraction"]


def test_epub_uses_the_epub_extractor(settings, storage, publisher, make_ctx):
    epub = _FakeExtractor(text="Chapter one")
    handler = ExtractHandler(settings, storage, extractors={"pdf": _FakeExtractor(), "epub": epub})
    ctx = make_ctx(make_envelope(payload={"bookId": "b", "fileStorageKey": "k.epub", "mime": "application/epub+zip"}))

    handler(ctx)

    assert epub.calls[0] == ("extract", "books", "k.epub")


def test_unsupported_mime_fails_without_retry(settings, storage, make_ctx):
    handler = ExtractHandler(settings, storage, extractors={})
    ctx = make_ctx(make_envelope(payload={"bookId": "b", "fileStorageKey": "k.mobi", "mime": "application/x-mobipocket-ebook"}))

    with pytest.raises(JobFailed) as excinfo:
        handler(ctx)
    assert excinfo.value.retryable is False
    assert "Unsupported file type" in str(excinfo.value)


def test_existing_extraction_is_reused(settings, storage, publisher, make_ctx):
    storage.store[("extractions", "extraction/book-1_extraction.md")] = "# done"
    extractor = _FakeExtractor()
    handler = ExtractHandler(settings, storage, extractors={"pdf": extractor, "epub": extractor})

    result = handler(make_ctx())

    assert result == {"extractionStorageKey": "extraction/book-1_extraction.md", "metadata": {"skipped": True}}
    assert extractor.calls == []


def test_empty_text_fails_without_retry(settings, storage, make_ctx):
    handler = ExtractHandler(settings, storage, extractors={"pdf": _FakeExtractor(text="\n\n"), "epub": None})
    with pytest.raises(JobFailed) as excinfo:
        handler(make_ctx())
    assert excinfo.value.retryable is False


def test_clean_text_collapses_breaks_and_spaces():
    assert clean_text("a\\n\\nb\n\nc\t d   e\r\nf") == "a b c d e f"
    assert clean_text("") == ""
