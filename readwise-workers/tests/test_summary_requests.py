"""How the summarization worker reads a summary_request and decides to skip."""
from types import SimpleNamespace

import pytest

from summary_requests import (
    DEFAULT_STRATEGY,
    parse_summary_request,
    summary_already_exists,
)


def test_reads_strategy_and_user_from_forwarded_message():
    req = parse_summary_request({
        "bookId": "book-1", "task": "summarize", "summaryType": "abstractive",
        "summaryPercent": 0.4, "summarizationStrategy": "two_pass", "userId": "user-1",
    })
    assert req.book_id == "book-1"
    assert req.summary_type == "abstractive"
    assert req.summary_percent == 0.4
    assert req.strategy == "two_pass"
    assert req.user_id == "user-1"
    assert req.task == "summarize"


def test_gateway_field_names_are_accepted():
    req = parse_summary_request({"bookId": "book-1", "summarizationType": "Abstractive"})
    assert req.summary_type == "abstractive"


def test_defaults_match_previous_behaviour():
    req = parse_summary_request({"bookId": "book-1"})
    assert (req.summary_type, req.summary_percent, req.strategy, req.user_id, req.task) == (
        "extractive", 0.3, DEFAULT_STRATEGY, None, "summarize",
    )


@pytest.mark.parametrize("strategy", ["basic", "structured", "two_pass", "chain_of_density", "hybrid"])
def test_every_known_strategy_is_preserved(strategy):
    assert parse_summary_request({"bookId": "b", "summarizationStrategy": strategy}).strategy == strategy


def test_unknown_strategy_falls_back_to_default():
    assert parse_summary_request({"bookId": "b", "summarizationStrategy": "magic"}).strategy == DEFAULT_STRATEGY


def test_missing_book_id_raises():
    with pytest.raises(ValueError):
        parse_summary_request({"task": "summarize"})


def test_summary_already_exists_requires_matching_type():
    book = SimpleNamespace(summaryStorageKey="summary/x.json", summaryType="abstractive")
    assert summary_already_exists(book, "abstractive")
    assert not summary_already_exists(book, "extractive")
    assert not summary_already_exists(book, "abstractive", force=True)
    assert not summary_already_exists(SimpleNamespace(summaryStorageKey=None, summaryType=None), "abstractive")
