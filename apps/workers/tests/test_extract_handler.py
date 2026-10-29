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
    assert result["metadata"] == {
        "total_pages": 2, "pages_processed": 2, "extraction_method": "fake",
        "characters": len("Hello world"), "seconds": result["metadata"]["seconds"],
    }
    assert isinstance(result["metadata"]["seconds"], float)
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


def _pdf(pages: int, lines: int = 3) -> bytes:
    """A plain text PDF (Helvetica, no dependencies) with a few lines per page."""
    objects = ["<< /Type /Catalog /Pages 2 0 R >>", None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for page in range(1, pages + 1):
        shown = " ".join(f"(Sheet {page} line {line}: the harbour committee met.) '" for line in range(1, lines + 1))
        stream = f"BT /F1 9 Tf 40 800 Td 11 TL {shown} ET"
        objects.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents {len(objects)} 0 R "
                       "/Resources << /Font << /F1 3 0 R >> >> >>")
        kids.append(f"{len(objects)} 0 R")
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {pages} >>"
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n{body}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def test_pdf_pages_let_go_of_their_caches_once_read(tmp_path, monkeypatch):
    """pdfplumber keeps every page's layout and text map (about 10 MB for a dense page) until the file is closed."""
    from pdfplumber.page import Page
    from worker.tools.reader.extract.pdf_extractor import SimplePDFExtractor

    path = tmp_path / "book.pdf"
    path.write_bytes(_pdf(pages=3))
    read = []  # the pages themselves: closing the file drops the PDF's list of them, not their caches
    extract_text = Page.extract_text
    monkeypatch.setattr(Page, "extract_text", lambda self, *args, **kwargs: read.append(self) or extract_text(self, *args, **kwargs))

    text, metadata = SimplePDFExtractor.__new__(SimplePDFExtractor).extract_text_from_pdf_file(str(path))

    assert metadata["pages_processed"] == 3 and "Sheet 3 line 2: the harbour committee met." in text
    assert len(read) == 3
    for page in read:
        assert [name for name in page.cached_properties if hasattr(page, name)] == []
        assert page.get_textmap.cache_info().currsize == 0
