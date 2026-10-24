"""What the workers write back to the Book row."""
import asyncio

from shared.database import DatabaseManager


class _FakeBooks:
    def __init__(self):
        self.updates = []

    async def update(self, where, data):
        self.updates.append((where, data))
        return {"where": where, "data": data}


def _manager():
    dm = DatabaseManager()
    dm.db = type("FakeDb", (), {"book": _FakeBooks()})()
    return dm


def test_update_book_summary_persists_type_key_and_strategy():
    dm = _manager()

    asyncio.run(dm.update_book_summary("book-1", "Abstractive", "summary/book-1.json", "two_pass"))

    assert dm.db.book.updates == [({"id": "book-1"}, {
        "summaryType": "abstractive",
        "summaryStorageKey": "summary/book-1.json",
        "status": "ready",
        "summarizationStrategy": "two_pass",
    })]


def test_update_book_summary_without_strategy_leaves_the_column_alone():
    dm = _manager()

    asyncio.run(dm.update_book_summary("book-1", "extractive", "summary/book-1.json"))

    _, data = dm.db.book.updates[0]
    assert "summarizationStrategy" not in data


def test_update_book_status_truncates_and_clears_error_messages():
    dm = _manager()

    asyncio.run(dm.update_book_status("book-1", "error", "x" * 600))
    asyncio.run(dm.update_book_status("book-1", "processing"))

    (_, failed), (_, processing) = dm.db.book.updates
    assert failed["status"] == "error" and len(failed["errorMessage"]) == 500
    assert processing == {"status": "processing", "errorMessage": None}
