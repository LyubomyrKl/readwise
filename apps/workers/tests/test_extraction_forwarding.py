"""The extraction worker must forward every summary option it received."""
import asyncio
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from conftest import EXTRACTION_DIR, load_module_from_path

# The gateway's message as published by RabbitMQService.publishSummaryRequest
# (readwise-gateway/src/infrastructure/rabbitmq/rabbitmq.service.ts). Keep the
# field names in sync with rabbitmq.service.spec.ts on the TypeScript side.
GATEWAY_MESSAGE = {
    "messageId": "11111111-1111-1111-1111-111111111111",
    "type": "summary_request",
    "version": 1,
    "userId": "user-1",
    "bookId": "book-1",
    "summaryPercent": 0.4,
    "summarizationType": "abstractive",
    "summarizationStrategy": "two_pass",
    "requestedAt": "2026-10-24T00:00:00.000Z",
    "autoSummarize": True,
}


@pytest.fixture(scope="module")
def extraction_main():
    if str(EXTRACTION_DIR) not in sys.path:
        sys.path.insert(0, str(EXTRACTION_DIR))
    return load_module_from_path("extraction_worker_main", EXTRACTION_DIR / "main.py")


def _worker(extraction_main, book):
    worker = extraction_main.ExtractionWorker.__new__(extraction_main.ExtractionWorker)
    worker.db_manager = SimpleNamespace(
        connect=AsyncMock(),
        disconnect=AsyncMock(),
        get_book=AsyncMock(return_value=book),
        update_book_status=AsyncMock(),
        update_book_extraction=AsyncMock(),
    )
    worker.messaging = MagicMock()
    worker.worker_id = "test"
    return worker


def _extracted_book(**overrides):
    fields = dict(
        status="ready", extractionStorageKey="extractions/book-1.md",
        title="A Book", author="An Author", mime="application/pdf", fileStorageKey="key",
    )
    fields.update(overrides)
    return SimpleNamespace(**fields)


def test_already_extracted_book_forwards_every_option(extraction_main):
    worker = _worker(extraction_main, _extracted_book())

    asyncio.run(worker.process_message_async(dict(GATEWAY_MESSAGE)))

    worker.messaging.send_summary_request.assert_called_once_with(
        "book-1",
        summary_type="abstractive",
        summary_percent=0.4,
        strategy="two_pass",
        user_id="user-1",
    )
    worker.db_manager.update_book_status.assert_not_called()
    worker.db_manager.disconnect.assert_awaited_once()


def test_legacy_field_names_still_forward(extraction_main):
    worker = _worker(extraction_main, _extracted_book())
    legacy = {"bookId": "book-1", "summaryType": "extractive", "summaryPercent": 0.3}

    asyncio.run(worker.process_message_async(legacy))

    worker.messaging.send_summary_request.assert_called_once_with(
        "book-1", summary_type="extractive", summary_percent=0.3, strategy=None, user_id=None,
    )


def test_auto_summarize_false_does_not_forward(extraction_main):
    worker = _worker(extraction_main, _extracted_book())

    asyncio.run(worker.process_message_async({**GATEWAY_MESSAGE, "autoSummarize": False}))

    worker.messaging.send_summary_request.assert_not_called()


def test_book_in_processing_is_not_forwarded(extraction_main):
    worker = _worker(extraction_main, _extracted_book(status="processing"))

    asyncio.run(worker.process_message_async(dict(GATEWAY_MESSAGE)))

    worker.messaging.send_summary_request.assert_not_called()


def test_missing_book_id_is_ignored(extraction_main):
    worker = _worker(extraction_main, _extracted_book())

    asyncio.run(worker.process_message_async({"type": "summary_request"}))

    worker.db_manager.get_book.assert_not_called()
    worker.messaging.send_summary_request.assert_not_called()
