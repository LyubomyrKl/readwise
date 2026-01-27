"""Basic chunk summarizer without context awareness."""

import logging
from typing import Optional

from core.models import Chunk, Summary, SummarizationContext
from core.protocols import SummarizerProtocol, LLMClientProtocol
from config.settings import SummarizationSettings, SummaryType

logger = logging.getLogger(__name__)


class ChunkSummarizer(SummarizerProtocol):
    """Basic async chunk summarizer.

    Supports both extractive and abstractive summarization modes
    without context awareness.
    """

    def __init__(
        self,
        llm_client: LLMClientProtocol,
        summary_type: SummaryType = SummaryType.ABSTRACTIVE,
        default_ratio: float = 0.3,
    ):
        """Initialize the chunk summarizer.

        Args:
            llm_client: LLM client for summarization
            summary_type: Type of summarization (extractive or abstractive)
            default_ratio: Default compression ratio
        """
        self._llm_client = llm_client
        self.summary_type = summary_type
        self.default_ratio = default_ratio

    @classmethod
    def from_settings(
        cls,
        llm_client: LLMClientProtocol,
        settings: SummarizationSettings,
        summary_type: Optional[SummaryType] = None,
    ) -> "ChunkSummarizer":
        """Create summarizer from settings."""
        return cls(
            llm_client=llm_client,
            summary_type=summary_type or SummaryType.ABSTRACTIVE,
            default_ratio=settings.compression_base_ratio,
        )

    async def summarize(
        self,
        chunk: Chunk,
        context: Optional[SummarizationContext] = None,
        target_ratio: float = None,
    ) -> Summary:
        """Summarize a chunk of text.

        Args:
            chunk: The chunk to summarize
            context: Optional context (ignored in basic summarizer)
            target_ratio: Target compression ratio (uses default if None)

        Returns:
            Summary object
        """
        ratio = target_ratio or self.default_ratio

        try:
            if self.summary_type == SummaryType.EXTRACTIVE:
                summary_text = await self._llm_client.extractive_summarize(
                    text=chunk.content,
                    summary_percent=ratio,
                )
            else:
                summary_text = await self._llm_client.abstractive_summarize(
                    text=chunk.content,
                    summary_percent=ratio,
                )

            summary_tokens = self._llm_client.count_tokens(summary_text)
            compression_ratio = summary_tokens / chunk.token_count if chunk.token_count > 0 else 1.0

            return Summary(
                chunk_id=chunk.id,
                content=summary_text,
                token_count=summary_tokens,
                compression_ratio=compression_ratio,
                original_tokens=chunk.token_count,
                entities=[],
                quality_score=None,
                attempt_count=1,
            )

        except Exception as e:
            logger.error(f"Failed to summarize chunk {chunk.id}: {e}")
            # Return original content as fallback
            return Summary(
                chunk_id=chunk.id,
                content=chunk.content,
                token_count=chunk.token_count,
                compression_ratio=1.0,
                original_tokens=chunk.token_count,
                entities=[],
                quality_score=0.0,
                attempt_count=1,
                metadata={"error": str(e), "fallback": True},
            )

    async def summarize_extractive(
        self, chunk: Chunk, target_ratio: float = None
    ) -> Summary:
        """Explicitly use extractive summarization.

        Args:
            chunk: The chunk to summarize
            target_ratio: Target compression ratio

        Returns:
            Summary object
        """
        original_type = self.summary_type
        self.summary_type = SummaryType.EXTRACTIVE
        try:
            return await self.summarize(chunk, target_ratio=target_ratio)
        finally:
            self.summary_type = original_type

    async def summarize_abstractive(
        self, chunk: Chunk, target_ratio: float = None
    ) -> Summary:
        """Explicitly use abstractive summarization.

        Args:
            chunk: The chunk to summarize
            target_ratio: Target compression ratio

        Returns:
            Summary object
        """
        original_type = self.summary_type
        self.summary_type = SummaryType.ABSTRACTIVE
        try:
            return await self.summarize(chunk, target_ratio=target_ratio)
        finally:
            self.summary_type = original_type
