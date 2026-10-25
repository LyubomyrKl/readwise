"""reader.extract: file in the books bucket -> markdown in the extractions bucket.

Payload: { bookId, fileStorageKey, mime, title? }
Result:  { extractionStorageKey, metadata: { total_pages | total_items, ... } }
"""

from __future__ import annotations

import re
from typing import Any, Optional

from worker.platform.jobs import JobContext, JobFailed
from worker.platform.settings import WorkerSettings
from worker.platform.storage import S3Storage

EXTRACTORS = {
    "application/pdf": "pdf",
    "application/epub+zip": "epub",
}


def clean_text(text: str) -> str:
    """Collapses escaped and literal line breaks and runs of spaces (unchanged from the old worker)."""
    if not text or not isinstance(text, str):
        return text
    text = re.sub(r'\\n+', ' ', text)
    text = re.sub(r'\\\\n+', ' ', text)
    text = re.sub(r'\n+', ' ', text)
    text = re.sub(r'\\r+', ' ', text)
    text = re.sub(r'\r+', ' ', text)
    text = re.sub(r'\\t+', ' ', text)
    text = re.sub(r'\t+', ' ', text)
    text = re.sub(r' +', ' ', text)
    return text.strip()


def extraction_key(book_id: str) -> str:
    """Key layout shared with the extractors' save_extraction_to_s3."""
    return f"extraction/{book_id}_extraction.md"


class ExtractHandler:
    def __init__(self, settings: WorkerSettings, storage: S3Storage, extractors: Optional[dict[str, Any]] = None):
        self.settings = settings
        self.storage = storage
        self._extractors = extractors  # injected in tests

    def _extractor(self, kind: str):
        if self._extractors is not None:
            return self._extractors[kind]
        if kind == "pdf":
            from worker.tools.reader.extract.pdf_extractor import SimplePDFExtractor as Extractor
        else:
            from worker.tools.reader.extract.epub_extractor import SimpleEPUBExtractor as Extractor
        return Extractor(self.storage.endpoint, self.storage.access_key, self.storage.secret_key)

    def __call__(self, ctx: JobContext) -> dict[str, Any]:
        payload = ctx.payload
        book_id = str(payload.get("bookId") or "")
        file_key = str(payload.get("fileStorageKey") or "")
        mime = str(payload.get("mime") or "").lower()
        if not book_id or not file_key:
            raise JobFailed("payload needs bookId and fileStorageKey", retryable=False)

        kind = EXTRACTORS.get(mime)
        if kind is None:
            raise JobFailed(f"Unsupported file type: {mime or 'unknown'}", retryable=False)

        key = extraction_key(book_id)
        if self.storage.object_exists(self.settings.s3_extractions_bucket_name, key):
            ctx.log.info("extraction exists, skipping")
            ctx.progress("already extracted", 100)
            return {"extractionStorageKey": key, "metadata": {"skipped": True}}

        ctx.progress(f"extracting {kind}", 5)
        extractor = self._extractor(kind)
        text, metadata = extractor.extract_from_s3_file(bucket=self.settings.s3_book_bucket_name, file_key=file_key)
        ctx.check_cancelled()

        ctx.progress("cleaning text", 70)
        cleaned = clean_text(text)
        if not cleaned:
            raise JobFailed("No text could be extracted from the file", retryable=False)

        ctx.progress("storing extraction", 90)
        stored_key = extractor.save_extraction_to_s3(
            bucket=self.settings.s3_extractions_bucket_name,
            book_id=book_id,
            extracted_text=cleaned,
            metadata=metadata,
        )
        ctx.log.info("extracted %s characters", len(cleaned))
        return {
            "extractionStorageKey": stored_key,
            "metadata": {k: v for k, v in metadata.items() if isinstance(v, (int, float, str, bool))},
        }
