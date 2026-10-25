"""The reader tool's job handlers and queue bindings."""

from __future__ import annotations

from worker.platform.jobs import Handler
from worker.platform.settings import WorkerSettings
from worker.platform.storage import S3Storage

TOOL_ID = "reader"
JOB_EXTRACT = "reader.extract"
JOB_SUMMARIZE = "reader.summarize"
BINDINGS = [f"jobs.{JOB_EXTRACT}", f"jobs.{JOB_SUMMARIZE}"]


def build_handlers(settings: WorkerSettings, storage: S3Storage) -> dict[str, Handler]:
    # imported here so `python -m worker --queues other` never loads the pipeline (nltk, sklearn, ...)
    from worker.tools.reader.extract.handler import ExtractHandler
    from worker.tools.reader.summarize.handler import SummarizeHandler

    return {
        JOB_EXTRACT: ExtractHandler(settings, storage),
        JOB_SUMMARIZE: SummarizeHandler(settings, storage),
    }
