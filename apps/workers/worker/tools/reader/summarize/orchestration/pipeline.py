"""Main orchestration pipeline for summarization."""

import logging
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from worker.tools.reader.summarize.config.settings import SummarizationSettings, SummaryType
from worker.tools.reader.summarize.config.feature_flags import FeatureFlags
from worker.tools.reader.summarize.core.models import Chunk, Summary, SummarizationContext
from worker.tools.reader.summarize.llm.async_client import AsyncLLMClient
from worker.tools.reader.summarize.chunking.token_chunker import TokenChunker
from worker.tools.reader.summarize.chunking.semantic_chunker import SemanticChunker
from worker.tools.reader.summarize.chunking.overlap_deduplicator import OverlapDeduplicator
from worker.tools.reader.summarize.context.running_context import RunningContext
from worker.tools.reader.summarize.context.entity_tracker import EntityTracker
from worker.tools.reader.summarize.summarization.chunk_summarizer import ChunkSummarizer
from worker.tools.reader.summarize.summarization.context_summarizer import ContextSummarizer
from worker.tools.reader.summarize.summarization.hierarchical_merger import HierarchicalMerger
from worker.tools.reader.summarize.compression.density_analyzer import DensityAnalyzer
from worker.tools.reader.summarize.compression.adaptive_compressor import AdaptiveCompressor
from worker.tools.reader.summarize.validation.validators import SummaryValidator
from worker.tools.reader.summarize.validation.validation_loop import ValidationLoop

logger = logging.getLogger(__name__)

# Type alias for progress callback
ProgressCallback = Callable[[str, str, int, int], None]

# Type alias for section completion callback (section_index, section_data) -> None
SectionCallback = Callable[[int, Dict[str, Any]], None]


class SummarizationPipeline:
    """Main orchestrator for the enhanced summarization pipeline.

    Processes documents through:
    1. Chunking (token-based or semantic)
    2. Context-aware summarization with entity tracking
    3. Adaptive compression based on content density
    4. Validation and retry loop
    5. Overlap deduplication
    6. Hierarchical merging
    """

    def __init__(
        self,
        settings: Optional[SummarizationSettings] = None,
        features: Optional[FeatureFlags] = None,
        llm_client: Optional[AsyncLLMClient] = None,
        progress_callback: Optional[ProgressCallback] = None,
    ):
        """Initialize the pipeline.

        Args:
            settings: Configuration settings
            features: Feature flags
            llm_client: Optional pre-configured LLM client
            progress_callback: Optional callback for progress updates.
                Signature: (section_title, subsection_title, original_tokens, summary_tokens) -> None
        """
        self.settings = settings or SummarizationSettings()
        self.features = features or FeatureFlags()
        self._llm_client = llm_client
        self._progress_callback = progress_callback
        self._section_callback: Optional[SectionCallback] = None
        self._is_open = False

        # Components (initialized on open)
        self._chunker = None
        self._context_manager = None
        self._entity_tracker = None
        self._summarizer = None
        self._compressor = None
        self._validator = None
        self._validation_loop = None
        self._deduplicator = None
        self._merger = None

    async def __aenter__(self) -> "SummarizationPipeline":
        """Open the pipeline and initialize components."""
        await self._initialize_components()
        self._is_open = True
        return self

    async def __aexit__(self, *args) -> None:
        """Close the pipeline and cleanup."""
        if self._llm_client:
            await self._llm_client.__aexit__(*args)
        self._is_open = False

    async def _initialize_components(self) -> None:
        """Initialize all pipeline components."""
        # LLM Client
        if not self._llm_client:
            self._llm_client = AsyncLLMClient.from_settings(self.settings)
        await self._llm_client.__aenter__()

        # Chunker
        if self.features.use_semantic_chunking:
            self._chunker = SemanticChunker.from_settings(
                self._llm_client, self.settings
            )
        else:
            self._chunker = TokenChunker.from_settings(self.settings)

        # Context Manager
        if self.features.use_running_context:
            self._context_manager = RunningContext.from_settings(self.settings)

        # Entity Tracker
        if self.features.use_entity_tracking:
            self._entity_tracker = EntityTracker.from_settings(
                self._llm_client, self.settings
            )

        # Summarizer (context-aware or basic), both with the job's strategy
        if self.features.use_running_context or self.features.use_entity_tracking:
            self._summarizer = ContextSummarizer(
                llm_client=self._llm_client,
                context_manager=self._context_manager,
                entity_tracker=self._entity_tracker,
                strategy=self.settings.summarization_strategy,
                default_ratio=self.settings.compression_base_ratio,
                use_entity_tracking=self.features.use_entity_tracking,
                use_running_context=self.features.use_running_context,
            )
        else:
            self._summarizer = ChunkSummarizer(
                llm_client=self._llm_client,
                strategy=self.settings.summarization_strategy,
                default_ratio=self.settings.compression_base_ratio,
            )

        # Adaptive Compressor
        if self.features.use_adaptive_compression:
            density_analyzer = DensityAnalyzer(
                llm_client=self._llm_client,
                tokenizer_encoding=self.settings.tokenizer_encoding,
            )
            self._compressor = AdaptiveCompressor.from_settings(
                self.settings, density_analyzer
            )

        # Validator
        if self.features.use_validation_loop:
            self._validator = SummaryValidator.from_settings(
                self.settings, self._llm_client
            )
            self._validation_loop = ValidationLoop.from_settings(
                self._summarizer, self._validator, self.settings
            )

        # Deduplicator
        if self.features.use_overlap_dedup:
            self._deduplicator = OverlapDeduplicator.from_settings(
                self.settings, self._llm_client
            )

        # Hierarchical Merger
        if self.features.use_hierarchical_merge:
            self._merger = HierarchicalMerger.from_settings(
                self._llm_client, self.settings
            )

    def _ensure_open(self) -> None:
        """Ensure the pipeline is open."""
        if not self._is_open:
            raise RuntimeError("Pipeline is not open. Use 'async with' context manager.")

    async def count_total_chunks(self, json_data: Dict[str, Any]) -> int:
        """Pre-count total chunks for progress bar initialization.

        Args:
            json_data: Segmented JSON with sections/subsections

        Returns:
            Total number of chunks
        """
        self._ensure_open()
        total = 0
        for section in json_data.get("sections", []):
            for subsection in section.get("subsections", []):
                content = subsection.get("content", "")
                if content:
                    chunks = await self._chunk_content(content)
                    total += len(chunks)
        return total

    async def _chunk_content(
        self, content: str, context: Optional[SummarizationContext] = None
    ) -> List[Chunk]:
        """Chunk content using configured chunker.

        Args:
            content: Text to chunk
            context: Optional context

        Returns:
            List of chunks
        """
        if self._chunker is None:
            raise RuntimeError("Chunker not initialized")

        if self.features.use_semantic_chunking:
            # SemanticChunker has async chunk method
            chunks = await self._chunker.chunk(content, context)  # type: ignore[misc]
        else:
            # TokenChunker has sync chunk method
            chunks = self._chunker.chunk(content, context)  # type: ignore[misc]

        return chunks

    async def _get_compression_ratio(
        self, chunk: Chunk, context: Optional[SummarizationContext] = None
    ) -> float:
        """Get compression ratio for a chunk.

        Args:
            chunk: Chunk to analyze
            context: Optional context

        Returns:
            Compression ratio
        """
        if self.features.use_adaptive_compression and self._compressor:
            return await self._compressor.get_compression_ratio(chunk, context)
        return self.settings.compression_base_ratio

    async def _summarize_chunk(
        self,
        chunk: Chunk,
        context: Optional[SummarizationContext] = None,
        target_ratio: float = 0.3,
    ) -> Summary:
        """Summarize a single chunk.

        Args:
            chunk: Chunk to summarize
            context: Optional context
            target_ratio: Target compression ratio

        Returns:
            Summary
        """
        if self._summarizer is None:
            raise RuntimeError("Summarizer not initialized")

        if self.features.use_validation_loop and self._validation_loop:
            return await self._validation_loop.summarize_with_validation(
                chunk, context, target_ratio
            )
        else:
            return await self._summarizer.summarize(chunk, context, target_ratio)

    async def _process_subsection(
        self,
        subsection: Dict[str, Any],
        section_title: str = "",
    ) -> Tuple[List[Summary], Dict[str, Any]]:
        """Process a single subsection.

        Args:
            subsection: Subsection data with content
            section_title: Parent section title

        Returns:
            Tuple of (summaries, subsection metadata)
        """
        content = subsection.get("content", "")
        subsection_title = subsection.get("title", "")
        if not content:
            return [], {}

        # Set section context
        if self._context_manager:
            self._context_manager.set_section_context(
                title=subsection_title,
                context=f"Part of {section_title}" if section_title else "",
            )

        # Chunk the content
        context = self._context_manager.get_context() if self._context_manager else None
        chunks = await self._chunk_content(content, context)

        if self._context_manager:
            self._context_manager.set_total_chunks(len(chunks))

        # Summarize each chunk
        summaries = []
        for chunk in chunks:
            # Get adaptive compression ratio
            ratio = await self._get_compression_ratio(chunk, context)

            # Summarize with validation
            summary = await self._summarize_chunk(chunk, context, ratio)
            summaries.append(summary)

            # Report progress
            if self._progress_callback:
                self._progress_callback(
                    section_title,
                    subsection_title,
                    summary.original_tokens,
                    summary.token_count,
                )

            # Update context after each chunk
            if self._context_manager:
                context = self._context_manager.get_context()

        # Deduplicate overlapping summaries
        if self.features.use_overlap_dedup and self._deduplicator and len(summaries) > 1:
            summaries = self._deduplicator.deduplicate_sequence(summaries)

        # Calculate subsection metadata
        total_original = sum(s.original_tokens for s in summaries)
        total_summary = sum(s.token_count for s in summaries)

        metadata = {
            "chunk_count": len(summaries),
            "original_tokens": total_original,
            "summary_tokens": total_summary,
            "compression_ratio": total_summary / total_original if total_original > 0 else 1.0,
        }

        return summaries, metadata

    async def process(
        self,
        json_data: Dict[str, Any],
        summary_type: str = "abstractive",
        summary_percent: float = 0.3,
        skip_section_indices: Optional[List[int]] = None,
        preloaded_sections: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """Process a segmented document through the pipeline.

        Args:
            json_data: Segmented JSON with sections/subsections
            summary_type: Type of summarization
            summary_percent: Target summary percentage
            skip_section_indices: Section indices to skip (already processed)
            preloaded_sections: Already processed section data to include in results

        Returns:
            Tuple of (result_json, metadata)
        """
        self._ensure_open()
        start_time = time.perf_counter()

        # Ensure summarizer is initialized
        if self._summarizer is None:
            raise RuntimeError("Summarizer not initialized")

        # Set summary type
        sum_type = SummaryType(summary_type.lower())
        if hasattr(self._summarizer, 'summary_type'):
            self._summarizer.summary_type = sum_type  # type: ignore

        # Override base ratio with summary_percent
        if hasattr(self._summarizer, 'default_ratio'):
            self._summarizer.default_ratio = summary_percent  # type: ignore

        # Process sections
        result_sections = []
        all_chunk_summaries = {}
        total_original_tokens = 0
        total_summary_tokens = 0
        sections = json_data.get("sections", [])

        # Handle resume: build a map of preloaded sections by index
        skip_indices = set(skip_section_indices or [])
        preloaded_map: Dict[int, Dict[str, Any]] = {}
        if preloaded_sections:
            for i, section_data in zip(sorted(skip_indices), preloaded_sections):
                preloaded_map[i] = section_data
                # Count tokens from preloaded sections
                for subsection in section_data.get("subsections", []):
                    for chunk in subsection.get("chunks", []):
                        total_original_tokens += chunk.get("original_tokens", 0)
                        total_summary_tokens += chunk.get("summary_tokens", 0)

        for section_index, section in enumerate(sections):
            # Skip already processed sections (resume support)
            if section_index in skip_indices:
                if section_index in preloaded_map:
                    result_sections.append(preloaded_map[section_index])
                    logger.info(f"Skipping section {section_index} (resumed from checkpoint)")
                continue

            section_result = {
                "id": section.get("id"),
                "title": section.get("title"),
                "level": section.get("level"),
                "start_char": section.get("start_char"),
                "end_char": section.get("end_char"),
                "subsections": [],
            }

            section_summaries = []

            for subsection in section.get("subsections", []):
                summaries, sub_meta = await self._process_subsection(
                    subsection, section.get("title", "")
                )

                # Store chunk summaries
                chunk_data = []
                for s in summaries:
                    all_chunk_summaries[s.chunk_id] = s
                    chunk_data.append({
                        "chunk_id": s.chunk_id,
                        "content": s.content,
                        "original_tokens": s.original_tokens,
                        "summary_tokens": s.token_count,
                        "compression_ratio": s.compression_ratio,
                        "quality_score": s.quality_score,
                        "entities": s.entities,
                    })

                section_summaries.extend(summaries)
                total_original_tokens += sub_meta.get("original_tokens", 0)
                total_summary_tokens += sub_meta.get("summary_tokens", 0)

                section_result["subsections"].append({
                    "id": subsection.get("id"),
                    "title": subsection.get("title"),
                    "level": subsection.get("level"),
                    "start_char": subsection.get("start_char"),
                    "end_char": subsection.get("end_char"),
                    "chunks": chunk_data,
                    "chunk_ids": [s.chunk_id for s in summaries],
                })

            # Merge subsection summaries to section summary
            if self.features.use_hierarchical_merge and self._merger and section_summaries:
                section_summary = await self._merger.merge_summaries(
                    section_summaries, "chapter"
                )
                section_result["summary"] = {
                    "content": section_summary.content,
                    "token_count": section_summary.token_count,
                    "entities": section_summary.entities,
                }

            result_sections.append(section_result)

            # Notify section completion for checkpointing
            if self._section_callback:
                self._section_callback(section_index, section_result)

            # Reset context for next section (but keep entities)
            if self._context_manager:
                self._context_manager.reset_for_section()

        # Build result
        result_json: Dict[str, Any] = {
            "sections": result_sections,
        }

        # Add document summary if hierarchical merge enabled
        if self.features.use_hierarchical_merge and self._merger:
            chapter_summaries = [
                Summary(
                    chunk_id=s["id"],
                    content=s.get("summary", {}).get("content", ""),
                    token_count=s.get("summary", {}).get("token_count", 0),
                    compression_ratio=0.0,
                    original_tokens=0,
                    entities=s.get("summary", {}).get("entities", []),
                    metadata={"title": s.get("title", "")},
                )
                for s in result_sections
                if s.get("summary")
            ]
            if chapter_summaries:
                doc_summary = await self._merger.merge_chapters_to_document(chapter_summaries)
                result_json["document_summary"] = {
                    "content": doc_summary.content,
                    "token_count": doc_summary.token_count,
                    "entities": doc_summary.entities,
                }

        # Add entity registry
        if self.features.use_entity_tracking and self._entity_tracker:
            entities = self._entity_tracker.get_all_entities()
            result_json["entity_registry"] = {
                name: {
                    "name": e.name,
                    "type": e.type,
                    "aliases": e.aliases,
                    "mention_count": e.mention_count,
                    "context": e.context,
                }
                for name, e in entities.items()
            }

        # Build metadata
        processing_time = (time.perf_counter() - start_time) * 1000
        overall_compression = (
            total_summary_tokens / total_original_tokens
            if total_original_tokens > 0 else 1.0
        )

        metadata: Dict[str, Any] = {
            "summary_type": summary_type,
            "target_percent": summary_percent,
            "original_tokens": total_original_tokens,
            "summary_tokens": total_summary_tokens,
            "compression_ratio": overall_compression,
            "processing_time_ms": processing_time,
            "section_count": len(result_sections),
            "chunk_count": len(all_chunk_summaries),
            "pipeline_version": "2.0",
            "features_enabled": {
                "async_llm": self.features.use_async_llm,
                "running_context": self.features.use_running_context,
                "entity_tracking": self.features.use_entity_tracking,
                "semantic_chunking": self.features.use_semantic_chunking,
                "adaptive_compression": self.features.use_adaptive_compression,
                "validation_loop": self.features.use_validation_loop,
                "overlap_dedup": self.features.use_overlap_dedup,
                "hierarchical_merge": self.features.use_hierarchical_merge,
            },
        }

        logger.info(
            f"Pipeline complete: {total_original_tokens:,} -> {total_summary_tokens:,} tokens "
            f"({overall_compression:.1%} compression) in {processing_time:.0f}ms"
        )

        return result_json, metadata

    def set_progress_callback(self, callback: Optional[ProgressCallback]) -> None:
        """Set the progress callback.

        Args:
            callback: Progress callback function or None to disable.
                Signature: (section_title, subsection_title, original_tokens, summary_tokens) -> None
        """
        self._progress_callback = callback

    def set_section_callback(self, callback: Optional[SectionCallback]) -> None:
        """Set the section completion callback for checkpointing.

        Args:
            callback: Section callback function or None to disable.
                Signature: (section_index, section_data) -> None
        """
        self._section_callback = callback

    @property
    def stats(self) -> Dict[str, Any]:
        """Get pipeline statistics."""
        stats: Dict[str, Any] = {
            "is_open": self._is_open,
        }

        if self._llm_client:
            stats["llm"] = self._llm_client.stats

        if self._context_manager:
            stats["context"] = {
                "summary_count": self._context_manager.summary_count,
                "tokens": self._context_manager.current_tokens,
            }

        if self._entity_tracker:
            stats["entities"] = {
                "count": self._entity_tracker.entity_count,
            }

        return stats
