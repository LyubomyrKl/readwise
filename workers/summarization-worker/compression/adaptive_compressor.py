"""Adaptive compression ratio calculation based on content density."""

import logging
from typing import Optional

from ..core.models import Chunk, SummarizationContext, DensityMetrics
from ..core.protocols import DensityAnalyzerProtocol
from ..config.settings import SummarizationSettings
from .density_analyzer import DensityAnalyzer

logger = logging.getLogger(__name__)


class AdaptiveCompressor:
    """Dynamic compression ratio calculation based on content density.

    Adjusts compression ratio based on:
    1. Content information density
    2. Redundancy in the text
    3. Position in document (earlier sections may need higher retention)
    4. Section importance (configurable per-section adjustments)
    """

    def __init__(
        self,
        density_analyzer: DensityAnalyzerProtocol,
        base_ratio: float = 0.3,
        min_ratio: float = 0.15,
        max_ratio: float = 0.5,
    ):
        """Initialize the adaptive compressor.

        Args:
            density_analyzer: Analyzer for content density
            base_ratio: Base compression ratio
            min_ratio: Minimum compression ratio (most aggressive compression)
            max_ratio: Maximum compression ratio (least compression)
        """
        self._density_analyzer = density_analyzer
        self.base_ratio = base_ratio
        self.min_ratio = min_ratio
        self.max_ratio = max_ratio

    @classmethod
    def from_settings(
        cls,
        settings: SummarizationSettings,
        density_analyzer: Optional[DensityAnalyzerProtocol] = None,
    ) -> "AdaptiveCompressor":
        """Create compressor from settings."""
        analyzer = density_analyzer or DensityAnalyzer.from_settings(settings)

        return cls(
            density_analyzer=analyzer,
            base_ratio=settings.compression_base_ratio,
            min_ratio=settings.compression_min_ratio,
            max_ratio=settings.compression_max_ratio,
        )

    def _adjust_for_position(
        self, ratio: float, context: Optional[SummarizationContext]
    ) -> float:
        """Adjust ratio based on chunk position in document.

        Earlier chunks may be more important for establishing context.

        Args:
            ratio: Current ratio
            context: Summarization context

        Returns:
            Adjusted ratio
        """
        if not context or context.total_chunks == 0:
            return ratio

        position_ratio = context.chunk_index / context.total_chunks

        # First 20% of document: keep more content (higher ratio)
        if position_ratio < 0.2:
            ratio *= 1.1

        # Last 10% of document: keep more content (conclusions)
        elif position_ratio > 0.9:
            ratio *= 1.05

        return ratio

    def _adjust_for_context_accumulation(
        self, ratio: float, context: Optional[SummarizationContext]
    ) -> float:
        """Adjust ratio based on accumulated context.

        If we have a lot of context, we can be more aggressive with compression.

        Args:
            ratio: Current ratio
            context: Summarization context

        Returns:
            Adjusted ratio
        """
        if not context:
            return ratio

        # If we have substantial context, we can compress more
        if context.accumulated_tokens > 1500:
            ratio *= 0.95
        elif context.accumulated_tokens > 1000:
            ratio *= 0.98

        return ratio

    async def get_compression_ratio(
        self,
        chunk: Chunk,
        context: Optional[SummarizationContext] = None,
        section_importance: float = 1.0,
    ) -> float:
        """Calculate optimal compression ratio for a chunk.

        Args:
            chunk: The chunk to analyze
            context: Optional summarization context
            section_importance: Importance multiplier (1.0 = normal)

        Returns:
            Compression ratio (0-1, higher = keep more content)
        """
        # Analyze content density
        metrics = await self._density_analyzer.analyze(chunk.content)

        # Start with suggested compression from density analysis
        ratio = metrics.suggested_compression

        # Adjust for section importance
        # Higher importance = higher ratio (keep more)
        ratio *= section_importance

        # Adjust for position
        ratio = self._adjust_for_position(ratio, context)

        # Adjust for accumulated context
        ratio = self._adjust_for_context_accumulation(ratio, context)

        # Clamp to configured range
        ratio = max(self.min_ratio, min(self.max_ratio, ratio))

        logger.debug(
            f"Chunk {chunk.id}: density={metrics.information_density:.2f}, "
            f"redundancy={metrics.redundancy_score:.2f}, ratio={ratio:.2f}"
        )

        return ratio

    def get_compression_ratio_sync(
        self,
        chunk: Chunk,
        context: Optional[SummarizationContext] = None,
        section_importance: float = 1.0,
    ) -> float:
        """Calculate compression ratio synchronously (heuristic only).

        Args:
            chunk: The chunk to analyze
            context: Optional summarization context
            section_importance: Importance multiplier

        Returns:
            Compression ratio
        """
        # Use sync analysis
        metrics = self._density_analyzer.analyze_sync(chunk.content)

        ratio = metrics.suggested_compression
        ratio *= section_importance
        ratio = self._adjust_for_position(ratio, context)
        ratio = self._adjust_for_context_accumulation(ratio, context)

        return max(self.min_ratio, min(self.max_ratio, ratio))

    def get_metrics(self, chunk: Chunk) -> DensityMetrics:
        """Get density metrics for a chunk (sync).

        Args:
            chunk: The chunk to analyze

        Returns:
            Density metrics
        """
        return self._density_analyzer.analyze_sync(chunk.content)

    async def get_metrics_async(self, chunk: Chunk) -> DensityMetrics:
        """Get density metrics for a chunk (async).

        Args:
            chunk: The chunk to analyze

        Returns:
            Density metrics
        """
        return await self._density_analyzer.analyze(chunk.content)
