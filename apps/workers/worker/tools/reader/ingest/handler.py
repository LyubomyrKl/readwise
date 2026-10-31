"""reader.ingest: the uploaded file -> the document IR, its pictures and a structure summary.

Payload: { bookId, fileStorageKey, mime }
Result:  { irStorageKey, structureStorageKey, sha256, language, title, words, sections, chapters,
           figures, informativeFigures, ocrPages, structureSource, seconds, skipped? }

Runs on the fast queue right after upload: seconds, no LLM. Everything is keyed by the file's SHA-256
(computed here from the bytes), so the same file uploaded twice, or an IR already built by an
abridge job, is reused.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any

from worker.platform.jobs import JobContext, JobFailed
from worker.platform.settings import WorkerSettings
from worker.platform.storage import S3Storage
from worker.tools.reader.ingest.ir import Document, included, ir_key, ir_prefix, structure_key

EPUB = "application/epub+zip"
PDF = "application/pdf"


def sniff_mime(data: bytes, declared: str = "") -> str:
    """The file's real type: the browser's guess for an upload is not always right."""
    if data[:5] == b"%PDF-" or b"%PDF-" in data[:1024]:
        return PDF
    if data[:2] == b"PK" and b"mimetypeapplication/epub+zip" in data[:100]:
        return EPUB
    if data[:2] == b"PK" and declared == EPUB:
        return EPUB
    return declared


def parse(data: bytes, mime: str, sha256: str) -> Document:
    mime = sniff_mime(data, mime)
    if mime == EPUB:
        from worker.tools.reader.ingest.epub_reader import read_epub

        return read_epub(data, sha256=sha256, mime=mime)
    if mime == PDF:
        from worker.tools.reader.ingest.pdf_reader import read_pdf

        return read_pdf(data, sha256=sha256, mime=mime)
    raise JobFailed(f"Unsupported file type: {mime or 'unknown'}", retryable=False)


def store(storage: S3Storage, bucket: str, doc: Document) -> None:
    """Pictures (once per distinct image), then the IR and its structure summary."""
    uploaded: dict[str, str] = {}
    for figure in doc.figures.values():
        if not figure.data:
            continue
        key = uploaded.get(figure.digest)
        if key is None:
            key = f"{ir_prefix(doc.sha256)}img/{figure.digest}.{figure.extension}"
            storage.upload_bytes(bucket, key, figure.data, figure.media_type)
            uploaded[figure.digest] = key
        figure.key = key
    storage.upload_bytes(bucket, ir_key(doc.sha256), doc.dumps(), "application/gzip")
    store_structure(storage, bucket, doc)


def store_structure(storage: S3Storage, bucket: str, doc: Document) -> None:
    storage.upload_text(bucket, structure_key(doc.sha256), json.dumps(doc.structure(), ensure_ascii=False),
                        "application/json")


def load_or_build(storage: S3Storage, settings: WorkerSettings, file_key: str, mime: str,
                  ctx: JobContext | None = None) -> tuple[Document, bool]:
    """The IR of a stored book: (document, reused). Builds and stores it when missing."""
    data = storage.download_bytes(settings.s3_book_bucket_name, file_key)
    sha256 = hashlib.sha256(data).hexdigest()
    bucket = settings.s3_extractions_bucket_name
    if storage.object_exists(bucket, ir_key(sha256)) and storage.object_exists(bucket, structure_key(sha256)):
        doc = Document.loads(storage.download_bytes(bucket, ir_key(sha256)))
        # the IR stays as it was built (editions are keyed by it); its summary follows the code
        store_structure(storage, bucket, doc)
        return doc, True
    if ctx is not None:
        ctx.progress("reading the file's structure", 20)
    doc = parse(data, mime, sha256)
    if ctx is not None:
        ctx.check_cancelled()
        ctx.progress("storing the structure and pictures", 70)
    store(storage, bucket, doc)
    return doc, False


def summary(doc: Document) -> dict[str, Any]:
    chapters = [s for s in doc.sections if included(s) and s.kind != "part"]
    return {
        "irStorageKey": ir_key(doc.sha256),
        "structureStorageKey": structure_key(doc.sha256),
        "sha256": doc.sha256,
        "language": doc.language,
        "title": doc.title,
        "words": doc.words,
        "sections": len(doc.sections),
        "chapters": len(chapters),
        "figures": len(doc.figures),
        "informativeFigures": sum(1 for f in doc.figures.values() if not f.decorative),
        "ocrPages": len(doc.ocr_pages),
        "structureSource": doc.structure_source,
    }


class IngestHandler:
    def __init__(self, settings: WorkerSettings, storage: S3Storage):
        self.settings = settings
        self.storage = storage

    def __call__(self, ctx: JobContext) -> dict[str, Any]:
        payload = ctx.payload
        file_key = str(payload.get("fileStorageKey") or "")
        mime = str(payload.get("mime") or "").lower()
        if not payload.get("bookId") or not file_key:
            raise JobFailed("payload needs bookId and fileStorageKey", retryable=False)
        started = time.monotonic()
        ctx.progress("downloading the file", 5)
        doc, reused = load_or_build(self.storage, self.settings, file_key, mime, ctx)
        result = summary(doc)
        result["seconds"] = round(time.monotonic() - started, 3)
        if reused:
            result["skipped"] = True
        ctx.log.info("ingested: %s sections (%s), %s words, %s pictures, language %s%s", result["sections"],
                     doc.structure_source, result["words"], result["figures"], doc.language,
                     " (reused)" if reused else "")
        return result
