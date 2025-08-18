"""
summarizer-contracts

Python validators and schemas for Summarizer system contracts
"""

from .validators import (
    validate_summarize_request_v1,
    validate_summary_completed_v1,
    validate_summary_failed_v1,
    get_schema,
)

__version__ = "1.0.0"
__all__ = [
    "validate_summarize_request_v1",
    "validate_summary_completed_v1", 
    "validate_summary_failed_v1",
    "get_schema",
]