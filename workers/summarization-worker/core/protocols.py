"""Protocol definitions for dependency injection and testing."""

from typing import Protocol, List, Optional, Dict, Any, runtime_checkable
from .models import (
    Chunk,
    Summary,
    SummarizationContext,
    Entity,
    ValidationResult,
    DensityMetrics,
    LLMRequest,
    LLMResponse,
)


@runtime_checkable
class ChunkerProtocol(Protocol):
    """Protocol for text chunkers."""

    def chunk(
        self, content: str, context: Optional[SummarizationContext] = None
    ) -> List[Chunk]:
        """Split content into chunks."""
        ...

    def count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        ...


@runtime_checkable
class AsyncChunkerProtocol(Protocol):
    """Protocol for async text chunkers (e.g., semantic chunker)."""

    async def chunk(
        self, content: str, context: Optional[SummarizationContext] = None
    ) -> List[Chunk]:
        """Split content into chunks asynchronously."""
        ...

    def count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        ...


@runtime_checkable
class SummarizerProtocol(Protocol):
    """Protocol for chunk summarizers."""

    async def summarize(
        self,
        chunk: Chunk,
        context: Optional[SummarizationContext] = None,
        target_ratio: float = 0.3,
    ) -> Summary:
        """Summarize a chunk."""
        ...


@runtime_checkable
class ValidatorProtocol(Protocol):
    """Protocol for summary validators."""

    def validate(
        self,
        summary: Summary,
        original: Chunk,
        context: Optional[SummarizationContext] = None,
    ) -> ValidationResult:
        """Validate a summary against the original chunk."""
        ...


@runtime_checkable
class AsyncValidatorProtocol(Protocol):
    """Protocol for async summary validators."""

    async def validate(
        self,
        summary: Summary,
        original: Chunk,
        context: Optional[SummarizationContext] = None,
    ) -> ValidationResult:
        """Validate a summary asynchronously."""
        ...


@runtime_checkable
class EntityTrackerProtocol(Protocol):
    """Protocol for entity tracking."""

    async def extract_entities(self, text: str) -> List[Entity]:
        """Extract entities from text."""
        ...

    def register_entity(self, entity: Entity) -> Entity:
        """Register an entity, merging with existing if similar."""
        ...

    def resolve_reference(self, reference: str) -> Optional[Entity]:
        """Resolve a reference to its canonical entity."""
        ...

    def get_entity_context(self, max_entities: int = 10) -> str:
        """Generate entity context string for prompts."""
        ...

    def get_all_entities(self) -> Dict[str, Entity]:
        """Get all tracked entities."""
        ...


@runtime_checkable
class ContextManagerProtocol(Protocol):
    """Protocol for running context management."""

    def add_summary(self, summary: Summary) -> None:
        """Add a summary to the context."""
        ...

    def get_context_prompt(self) -> str:
        """Generate context prompt for next chunk."""
        ...

    def get_context(self) -> SummarizationContext:
        """Get current summarization context."""
        ...

    def clear(self) -> None:
        """Clear the context."""
        ...


@runtime_checkable
class DensityAnalyzerProtocol(Protocol):
    """Protocol for content density analysis."""

    async def analyze(self, text: str) -> DensityMetrics:
        """Analyze text density asynchronously."""
        ...

    def analyze_sync(self, text: str) -> DensityMetrics:
        """Analyze text density synchronously (heuristic-based)."""
        ...


@runtime_checkable
class LLMClientProtocol(Protocol):
    """Protocol for LLM clients."""

    async def complete(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.3,
    ) -> str:
        """Complete a prompt."""
        ...

    async def complete_batch(
        self, requests: List[LLMRequest]
    ) -> List[LLMResponse]:
        """Complete multiple prompts in parallel."""
        ...

    def count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        ...

    async def get_embedding(self, text: str) -> List[float]:
        """Get embedding for text."""
        ...


@runtime_checkable
class DeduplicatorProtocol(Protocol):
    """Protocol for overlap deduplication."""

    def deduplicate_sequence(self, summaries: List[Summary]) -> List[Summary]:
        """Deduplicate a sequence of summaries."""
        ...


@runtime_checkable
class MergerProtocol(Protocol):
    """Protocol for hierarchical merging."""

    async def merge_summaries(
        self, summaries: List[Summary], level: str = "subsection"
    ) -> Summary:
        """Merge multiple summaries into one."""
        ...
