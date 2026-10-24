"""Parsing and idempotency rules for summary_request messages.

Deliberately free of heavy imports so the rules can be unit-tested without
loading the pipeline, NLTK or the LLM client.
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional

DEFAULT_SUMMARY_TYPE = 'extractive'
DEFAULT_SUMMARY_PERCENT = 0.3
DEFAULT_STRATEGY = 'structured'
KNOWN_STRATEGIES = ('basic', 'structured', 'two_pass', 'chain_of_density', 'hybrid')


@dataclass(frozen=True)
class SummaryRequest:
    book_id: str
    summary_type: str
    summary_percent: float
    strategy: str
    user_id: Optional[str]
    task: str


def parse_summary_request(message: Dict[str, Any]) -> SummaryRequest:
    """Normalise a summary_request message into a SummaryRequest.

    Accepts the field names the gateway publishes ('summarizationType') as well
    as the ones the extraction worker forwards ('summaryType'). An unknown
    strategy falls back to the default instead of failing the job, matching the
    previous behaviour of STRATEGY_MAP.get(..., STRUCTURED).

    Raises ValueError when 'bookId' is missing.
    """
    book_id = message.get('bookId')
    if not book_id:
        raise ValueError("summary_request message is missing 'bookId'")

    summary_type = message.get('summarizationType') or message.get('summaryType') or DEFAULT_SUMMARY_TYPE
    strategy = message.get('summarizationStrategy') or DEFAULT_STRATEGY
    if strategy not in KNOWN_STRATEGIES:
        strategy = DEFAULT_STRATEGY
    percent = message.get('summaryPercent', DEFAULT_SUMMARY_PERCENT)

    return SummaryRequest(
        book_id=str(book_id),
        summary_type=str(summary_type).lower(),
        summary_percent=float(percent),
        strategy=strategy,
        user_id=message.get('userId'),
        task=message.get('task', 'summarize'),
    )


def summary_already_exists(book: Any, summary_type: str, force: bool = False) -> bool:
    """True when the book already has a stored summary of this type.

    Used to make redelivered messages idempotent. `force` bypasses the check.
    """
    if force:
        return False
    return bool(getattr(book, 'summaryStorageKey', None)) and getattr(book, 'summaryType', None) == summary_type
