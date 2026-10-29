"""Core module with protocols, models, and exceptions."""

from .protocols import (
    ChunkerProtocol,
    SummarizerProtocol,
    ValidatorProtocol,
    EntityTrackerProtocol,
    ContextManagerProtocol,
)
from .models import (
    Chunk,
    Summary,
    SummarizationContext,
    Entity,
    ValidationResult,
    DensityMetrics,
)
from .exceptions import (
    SummarizationError,
    LLMError,
    LLMTimeoutError,
    LLMRateLimitError,
    LLMResponseError,
    ValidationError,
    EntityExtractionError,
)

__all__ = [
    # Protocols
    "ChunkerProtocol",
    "SummarizerProtocol",
    "ValidatorProtocol",
    "EntityTrackerProtocol",
    "ContextManagerProtocol",
    # Models
    "Chunk",
    "Summary",
    "SummarizationContext",
    "Entity",
    "ValidationResult",
    "DensityMetrics",
    # Exceptions
    "SummarizationError",
    "LLMError",
    "LLMTimeoutError",
    "LLMRateLimitError",
    "LLMResponseError",
    "ValidationError",
    "EntityExtractionError",
]
