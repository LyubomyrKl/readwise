"""Running context management for maintaining context across chunks."""

import logging
from collections import deque
from typing import Deque, List, Optional

import tiktoken

from ..core.models import Summary, SummarizationContext, Entity
from ..core.protocols import ContextManagerProtocol
from ..config.settings import SummarizationSettings

logger = logging.getLogger(__name__)


class RunningContext(ContextManagerProtocol):
    """Maintains context window across chunk processing.

    This class manages a sliding window of previous summaries to provide
    context for summarizing subsequent chunks. It supports configurable
    decay factors to weight recent summaries more heavily.
    """

    def __init__(
        self,
        max_context_tokens: int = 2000,
        summary_weight: float = 0.7,
        decay_factor: float = 0.9,
        tokenizer_encoding: str = "cl100k_base",
    ):
        """Initialize the running context manager.

        Args:
            max_context_tokens: Maximum tokens to include in context
            summary_weight: Weight for recent summaries (0-1)
            decay_factor: How much to decay older summaries (0-1)
            tokenizer_encoding: Tiktoken encoding name
        """
        self.max_context_tokens = max_context_tokens
        self.summary_weight = summary_weight
        self.decay_factor = decay_factor
        self._tokenizer = tiktoken.get_encoding(tokenizer_encoding)

        self._summaries: Deque[Summary] = deque()
        self._context_tokens: int = 0
        self._entity_registry: dict[str, Entity] = {}
        self._section_context: str = ""
        self._section_title: str = ""
        self._chunk_index: int = 0
        self._total_chunks: int = 0

    @classmethod
    def from_settings(cls, settings: SummarizationSettings) -> "RunningContext":
        """Create context manager from settings."""
        return cls(
            max_context_tokens=settings.context_max_tokens,
            summary_weight=settings.context_summary_weight,
            decay_factor=settings.context_decay_factor,
            tokenizer_encoding=settings.tokenizer_encoding,
        )

    def _count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        if not text:
            return 0
        return len(self._tokenizer.encode(text))

    def add_summary(self, summary: Summary) -> None:
        """Add a summary to the context window.

        If adding the summary exceeds max_context_tokens, older summaries
        are removed from the front of the queue.

        Args:
            summary: The summary to add
        """
        self._summaries.append(summary)
        self._context_tokens += summary.token_count
        self._chunk_index += 1

        # Prune old summaries if over token limit
        while self._context_tokens > self.max_context_tokens and len(self._summaries) > 1:
            removed = self._summaries.popleft()
            self._context_tokens -= removed.token_count
            logger.debug(f"Pruned summary {removed.chunk_id} from context")

        # Register entities from summary
        for entity_name in summary.entities:
            if entity_name not in self._entity_registry:
                self._entity_registry[entity_name] = Entity(
                    name=entity_name,
                    type="unknown",
                    first_mention_chunk=summary.chunk_id,
                )
            else:
                self._entity_registry[entity_name].mention_count += 1

    def set_section_context(self, title: str, context: str = "") -> None:
        """Set the current section context.

        Args:
            title: Section title
            context: High-level section context
        """
        self._section_title = title
        self._section_context = context

    def set_total_chunks(self, total: int) -> None:
        """Set the total number of chunks to process.

        Args:
            total: Total chunk count
        """
        self._total_chunks = total

    def register_entity(self, entity: Entity) -> None:
        """Register an entity in the context.

        Args:
            entity: Entity to register
        """
        if entity.name in self._entity_registry:
            self._entity_registry[entity.name].merge_with(entity)
        else:
            self._entity_registry[entity.name] = entity

    def get_context_prompt(self) -> str:
        """Generate context prompt for the next chunk.

        Returns a formatted string containing relevant context from
        previous summaries, weighted by recency and the decay factor.

        Returns:
            Context prompt string
        """
        if not self._summaries:
            return ""

        parts = []

        # Add section context if available
        if self._section_title:
            parts.append(f"Current section: {self._section_title}")
        if self._section_context:
            parts.append(f"Section overview: {self._section_context}")

        # Build summary context with decay weighting
        summary_parts = []
        weight = 1.0

        for summary in reversed(list(self._summaries)):
            if weight < 0.3:  # Skip very old summaries
                break

            weighted_preview = self._get_summary_preview(summary, weight)
            if weighted_preview:
                summary_parts.insert(0, weighted_preview)

            weight *= self.decay_factor

        if summary_parts:
            parts.append("Previous context:")
            parts.extend(summary_parts)

        # Add entity context
        important_entities = self._get_important_entities(5)
        if important_entities:
            entity_strs = [
                f"- {e.name} ({e.type}): {e.context}" if e.context else f"- {e.name} ({e.type})"
                for e in important_entities
            ]
            parts.append("Key entities:")
            parts.extend(entity_strs)

        return "\n".join(parts)

    def _get_summary_preview(self, summary: Summary, weight: float) -> str:
        """Get a preview of a summary, truncated based on weight.

        Args:
            summary: Summary to preview
            weight: Weight factor (0-1)

        Returns:
            Truncated summary preview
        """
        # Higher weight = more content
        max_chars = int(300 * weight * self.summary_weight)
        content = summary.content

        if len(content) <= max_chars:
            return f"[{summary.chunk_id}]: {content}"

        truncated = content[:max_chars].rsplit(' ', 1)[0] + "..."
        return f"[{summary.chunk_id}]: {truncated}"

    def _get_important_entities(self, top_k: int = 5) -> List[Entity]:
        """Get the most important entities by mention count.

        Args:
            top_k: Number of entities to return

        Returns:
            List of top entities
        """
        entities = list(self._entity_registry.values())
        entities.sort(key=lambda e: (e.mention_count, e.importance_score), reverse=True)
        return entities[:top_k]

    def get_context(self) -> SummarizationContext:
        """Get the current summarization context object.

        Returns:
            SummarizationContext with current state
        """
        return SummarizationContext(
            previous_summaries=list(self._summaries),
            entity_registry=dict(self._entity_registry),
            section_context=self._section_context,
            section_title=self._section_title,
            accumulated_tokens=self._context_tokens,
            chunk_index=self._chunk_index,
            total_chunks=self._total_chunks,
        )

    def get_recent_summaries(self, max_tokens: int) -> List[Summary]:
        """Get recent summaries up to a token limit.

        Args:
            max_tokens: Maximum total tokens

        Returns:
            List of recent summaries
        """
        result = []
        total_tokens = 0

        for summary in reversed(list(self._summaries)):
            if total_tokens + summary.token_count > max_tokens:
                break
            result.insert(0, summary)
            total_tokens += summary.token_count

        return result

    def clear(self) -> None:
        """Clear all context."""
        self._summaries.clear()
        self._context_tokens = 0
        self._entity_registry.clear()
        self._section_context = ""
        self._section_title = ""
        self._chunk_index = 0
        self._total_chunks = 0

    def reset_for_section(self) -> None:
        """Reset context for a new section while preserving entities."""
        self._summaries.clear()
        self._context_tokens = 0
        self._section_context = ""
        self._section_title = ""
        # Keep entity registry across sections

    @property
    def summary_count(self) -> int:
        """Number of summaries in context."""
        return len(self._summaries)

    @property
    def current_tokens(self) -> int:
        """Current token count in context."""
        return self._context_tokens

    @property
    def entity_count(self) -> int:
        """Number of tracked entities."""
        return len(self._entity_registry)
