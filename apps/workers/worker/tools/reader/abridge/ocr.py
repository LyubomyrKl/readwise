"""Scanned pages read by the vision model (Phase 4.1), once per file: the text is kept per page.

Measured on clean generated scans: 0.2-1% character error for modern Ukrainian, 0.3-1.4% for English,
about 8 s a page (docs/summarizer-investigation.md section 19). Real scans will be noisier.
"""

from __future__ import annotations

from typing import Callable, Optional

from worker.platform.storage import S3Storage
from worker.tools.reader.ingest.language import LANGUAGE_NAMES
from worker.tools.reader.ingest.pdf_reader import render_page_png
from worker.tools.reader.abridge import prompts
from worker.tools.reader.abridge.engine import Engine


def ocr_key(sha256: str, page: int) -> str:
    return f"ocr/{sha256}/page-{page:05d}.txt"


def read_pages(engine: Engine, storage: S3Storage, bucket: str, data: bytes, sha256: str, pages: list[int],
               lang: str, on_page: Optional[Callable[[int, int], None]] = None) -> dict[int, str]:
    language = LANGUAGE_NAMES.get(lang, "its original language")
    out: dict[int, str] = {}
    for done, page in enumerate(pages, 1):
        key = ocr_key(sha256, page)
        if storage.object_exists(bucket, key):
            out[page] = storage.download_text(bucket, key)
        else:
            image = render_page_png(data, page)
            reply = engine.call(engine.models.vision, prompts.OCR.format(language=language), num_predict=3000,
                                temperature=0.0, images=[image])
            text = reply.text.strip().strip("`").strip()
            storage.upload_text(bucket, key, text, "text/plain")
            out[page] = text
        if on_page:
            on_page(done, len(pages))
    return out
