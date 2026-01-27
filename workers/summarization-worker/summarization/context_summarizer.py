"""Context-aware chunk summarizer with entity and running context support."""

import logging
from typing import List, Optional

from ..core.models import Chunk, Summary, SummarizationContext, Entity
from ..core.protocols import (
    SummarizerProtocol,
    LLMClientProtocol,
    ContextManagerProtocol,
    EntityTrackerProtocol,
)
from ..config.settings import SummarizationSettings, SummaryType
from ..context.running_context import RunningContext
from ..context.entity_tracker import EntityTracker

logger = logging.getLogger(__name__)


class ContextSummarizer(SummarizerProtocol):
    """Context-aware chunk summarizer.

    Enhances summarization by:
    1. Injecting running context from previous summaries
    2. Maintaining entity consistency across chunks
    3. Updating context after each summarization
    """

    def __init__(
        self,
        llm_client: LLMClientProtocol,
        context_manager: Optional[ContextManagerProtocol] = None,
        entity_tracker: Optional[EntityTrackerProtocol] = None,
        summary_type: SummaryType = SummaryType.ABSTRACTIVE,
        default_ratio: float = 0.3,
        use_entity_tracking: bool = True,
        use_running_context: bool = True,
    ):
        """Initialize the context summarizer.

        Args:
            llm_client: LLM client for summarization
            context_manager: Optional context manager for running context
            entity_tracker: Optional entity tracker for entity consistency
            summary_type: Type of summarization
            default_ratio: Default compression ratio
            use_entity_tracking: Whether to extract and track entities
            use_running_context: Whether to use running context
        """
        self._llm_client = llm_client
        self._context_manager = context_manager
        self._entity_tracker = entity_tracker
        self.summary_type = summary_type
        self.default_ratio = default_ratio
        self.use_entity_tracking = use_entity_tracking
        self.use_running_context = use_running_context

    @classmethod
    def from_settings(
        cls,
        llm_client: LLMClientProtocol,
        settings: SummarizationSettings,
        summary_type: Optional[SummaryType] = None,
    ) -> "ContextSummarizer":
        """Create summarizer with new context manager and entity tracker."""
        context_manager = RunningContext.from_settings(settings)
        entity_tracker = EntityTracker.from_settings(llm_client, settings)

        return cls(
            llm_client=llm_client,
            context_manager=context_manager,
            entity_tracker=entity_tracker,
            summary_type=summary_type or SummaryType.ABSTRACTIVE,
            default_ratio=settings.compression_base_ratio,
        )

    def set_context_manager(self, context_manager: ContextManagerProtocol) -> None:
        """Set the context manager.

        Args:
            context_manager: Context manager to use
        """
        self._context_manager = context_manager

    def set_entity_tracker(self, entity_tracker: EntityTrackerProtocol) -> None:
        """Set the entity tracker.

        Args:
            entity_tracker: Entity tracker to use
        """
        self._entity_tracker = entity_tracker

    async def _extract_and_register_entities(self, text: str) -> List[Entity]:
        """Extract entities from text and register them.

        Args:
            text: Text to extract entities from

        Returns:
            List of extracted/registered entities
        """
        if not self.use_entity_tracking or not self._entity_tracker:
            return []

        try:
            entities = await self._entity_tracker.extract_entities(text)
            registered = self._entity_tracker.register_entities(entities)
            return registered
        except Exception as e:
            logger.warning(f"Entity extraction failed: {e}")
            return []

    def _build_context_prompt(self) -> Optional[str]:
        """Build context prompt from running context.

        Returns:
            Context prompt string, or None if no context
        """
        if not self.use_running_context or not self._context_manager:
            return None

        return self._context_manager.get_context_prompt()

    def _build_entity_context(self) -> Optional[str]:
        """Build entity context string.

        Returns:
            Entity context string, or None if no entities
        """
        if not self.use_entity_tracking or not self._entity_tracker:
            return None

        return self._entity_tracker.get_entity_context(max_entities=10)

    async def summarize(
        self,
        chunk: Chunk,
        context: Optional[SummarizationContext] = None,
        target_ratio: float = None,
    ) -> Summary:
        """Summarize a chunk with context awareness.

        Args:
            chunk: The chunk to summarize
            context: Optional external context (uses internal context if None)
            target_ratio: Target compression ratio

        Returns:
            Summary object with entities and context
        """
        ratio = target_ratio or self.default_ratio

        # Build context strings
        context_prompt = self._build_context_prompt()
        entity_context = self._build_entity_context()

        # Extract entities from the chunk (before summarization for context)
        extracted_entities = await self._extract_and_register_entities(chunk.content)
        entity_names = [e.name for e in extracted_entities]

        try:
            if self.summary_type == SummaryType.EXTRACTIVE:
                summary_text = await self._llm_client.extractive_summarize(
                    text=chunk.content,
                    summary_percent=ratio,
                    context=context_prompt,
                )
            else:
                summary_text = await self._llm_client.abstractive_summarize(
                    text=chunk.content,
                    summary_percent=ratio,
                    context=context_prompt,
                    entities=entity_context,
                )

            summary_tokens = self._llm_client.count_tokens(summary_text)
            compression_ratio = (
                summary_tokens / chunk.token_count if chunk.token_count > 0 else 1.0
            )

            summary = Summary(
                chunk_id=chunk.id,
                content=summary_text,
                token_count=summary_tokens,
                compression_ratio=compression_ratio,
                original_tokens=chunk.token_count,
                entities=entity_names,
                quality_score=None,
                attempt_count=1,
                metadata={
                    "context_used": context_prompt is not None,
                    "entities_extracted": len(entity_names),
                },
            )

            # Update running context with new summary
            if self.use_running_context and self._context_manager:
                self._context_manager.add_summary(summary)

            # Update entity mention counts
            if self.use_entity_tracking and self._entity_tracker:
                self._entity_tracker.increment_mentions(entity_names)

            return summary

        except Exception as e:
            logger.error(f"Failed to summarize chunk {chunk.id}: {e}")
            # Return original content as fallback
            return Summary(
                chunk_id=chunk.id,
                content=chunk.content,
                token_count=chunk.token_count,
                compression_ratio=1.0,
                original_tokens=chunk.token_count,
                entities=entity_names,
                quality_score=0.0,
                attempt_count=1,
                metadata={"error": str(e), "fallback": True},
            )

    async def summarize_sequence(
        self,
        chunks: List[Chunk],
        target_ratio: float = None,
    ) -> List[Summary]:
        """Summarize a sequence of chunks with running context.

        This processes chunks sequentially, building context as it goes.

        Args:
            chunks: List of chunks to summarize
            target_ratio: Target compression ratio

        Returns:
            List of summaries
        """
        summaries = []

        # Set total chunks for context tracking
        if self._context_manager:
            self._context_manager.set_total_chunks(len(chunks))

        for chunk in chunks:
            summary = await self.summarize(chunk, target_ratio=target_ratio)
            summaries.append(summary)

        return summaries

    def reset_context(self) -> None:
        """Reset the running context (but keep entities)."""
        if self._context_manager:
            self._context_manager.reset_for_section()

    def clear_all(self) -> None:
        """Clear all context and entity tracking."""
        if self._context_manager:
            self._context_manager.clear()
        if self._entity_tracker:
            self._entity_tracker.clear()

    def get_entity_summary(self) -> dict:
        """Get a summary of tracked entities.

        Returns:
            Dictionary with entity statistics
        """
        if not self._entity_tracker:
            return {"entity_count": 0, "types": [], "top_entities": []}

        all_entities = self._entity_tracker.get_all_entities()
        important = self._entity_tracker.get_important_entities(10)

        return {
            "entity_count": len(all_entities),
            "types": list(self._entity_tracker.entity_types),
            "top_entities": [
                {"name": e.name, "type": e.type, "mentions": e.mention_count}
                for e in important
            ],
        }

    @property
    def context_stats(self) -> dict:
        """Get context statistics.

        Returns:
            Dictionary with context stats
        """
        if not self._context_manager:
            return {"summary_count": 0, "tokens": 0, "entity_count": 0}

        return {
            "summary_count": self._context_manager.summary_count,
            "tokens": self._context_manager.current_tokens,
            "entity_count": self._context_manager.entity_count,
        }
