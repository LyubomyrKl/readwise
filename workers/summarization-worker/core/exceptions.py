"""Custom exceptions for the summarization pipeline."""


class SummarizationError(Exception):
    """Base exception for summarization errors."""

    def __init__(self, message: str, details: dict = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class LLMError(SummarizationError):
    """LLM API errors."""

    def __init__(self, message: str, status_code: int = None, details: dict = None):
        super().__init__(message, details)
        self.status_code = status_code


class LLMTimeoutError(LLMError):
    """LLM request timeout."""

    def __init__(self, message: str = "LLM request timed out", timeout: float = None):
        super().__init__(message)
        self.timeout = timeout


class LLMRateLimitError(LLMError):
    """LLM rate limit exceeded."""

    def __init__(
        self, message: str = "LLM rate limit exceeded", retry_after: float = None
    ):
        super().__init__(message, status_code=429)
        self.retry_after = retry_after


class ValidationError(SummarizationError):
    """Summary validation failures."""

    def __init__(
        self,
        message: str,
        score: float = 0.0,
        issues: list = None,
        details: dict = None,
    ):
        super().__init__(message, details)
        self.score = score
        self.issues = issues or []


class ChunkingError(SummarizationError):
    """Text chunking errors."""

    pass


class EntityExtractionError(SummarizationError):
    """Entity extraction errors."""

    pass


class ConfigurationError(SummarizationError):
    """Configuration errors."""

    pass


class PipelineError(SummarizationError):
    """Pipeline orchestration errors."""

    def __init__(self, message: str, stage: str = None, details: dict = None):
        super().__init__(message, details)
        self.stage = stage
