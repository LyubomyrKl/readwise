"""The reader tool's job handlers and queue bindings.

Two queues, consumed by one thread each, so an upload never waits behind a book:
- `reader` (heavy, LLM, minutes to hours): reader.abridge
- `reader_fast` (seconds, no LLM): reader.ingest
"""

from __future__ import annotations

from worker.platform.jobs import Handler
from worker.platform.settings import WorkerSettings
from worker.platform.storage import S3Storage

TOOL_ID = "reader"
FAST_QUEUE = "reader_fast"
JOB_INGEST = "reader.ingest"
JOB_ABRIDGE = "reader.abridge"
BINDINGS = [f"jobs.{JOB_ABRIDGE}"]
FAST_BINDINGS = [f"jobs.{JOB_INGEST}"]


def build_handlers(settings: WorkerSettings, storage: S3Storage) -> dict[str, Handler]:
    # imported here so `python -m worker --queues other` never loads the engine (PyMuPDF, ebooklib, ...)
    from worker.tools.reader.abridge.handler import AbridgeHandler

    return {JOB_ABRIDGE: AbridgeHandler(settings, storage)}


def build_fast_handlers(settings: WorkerSettings, storage: S3Storage) -> dict[str, Handler]:
    from worker.tools.reader.ingest.handler import IngestHandler

    return {JOB_INGEST: IngestHandler(settings, storage)}
