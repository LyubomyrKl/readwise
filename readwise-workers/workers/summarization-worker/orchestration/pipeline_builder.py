"""Fluent builder for pipeline configuration."""

from typing import Optional

from config.settings import SummarizationSettings, ChunkerType, SummarizationStrategy
from config.feature_flags import FeatureFlags
from llm.async_client import AsyncLLMClient
from orchestration.pipeline import SummarizationPipeline


class PipelineBuilder:
    """Fluent builder for configuring and creating SummarizationPipeline.

    Example:
        pipeline = (
            PipelineBuilder()
            .with_semantic_chunking()
            .with_validation()
            .with_adaptive_compression()
            .build()
        )
    """

    def __init__(self):
        """Initialize the builder with default settings."""
        self._settings = SummarizationSettings()
        self._features = FeatureFlags()
        self._llm_client: Optional[AsyncLLMClient] = None

    # LLM Configuration
    def with_ollama(
        self,
        base_url: str = None,
        model: str = None,
        embed_model: str = None,
    ) -> "PipelineBuilder":
        """Configure Ollama LLM settings.

        Args:
            base_url: Ollama server URL (defaults to OLLAMA_BASE_URL env var)
            model: Model name for completions (defaults to OLLAMA_MODEL env var)
            embed_model: Model name for embeddings (defaults to OLLAMA_EMBED_MODEL env var)
        """
        import os
        if base_url is None:
            base_url = os.environ['OLLAMA_BASE_URL']
        if model is None:
            model = os.environ['OLLAMA_MODEL']
        if embed_model is None:
            embed_model = os.environ['OLLAMA_EMBED_MODEL']

        self._settings.ollama_base_url = base_url
        self._settings.ollama_model = model
        self._settings.ollama_embed_model = embed_model
        return self

    def with_max_concurrent(self, max_concurrent: int) -> "PipelineBuilder":
        """Set maximum concurrent LLM requests.

        Args:
            max_concurrent: Max concurrent requests
        """
        self._settings.llm_max_concurrent = max_concurrent
        return self

    def with_llm_client(self, client: AsyncLLMClient) -> "PipelineBuilder":
        """Use a pre-configured LLM client.

        Args:
            client: Pre-configured AsyncLLMClient
        """
        self._llm_client = client
        return self

    # Chunking Configuration
    def with_semantic_chunking(
        self, similarity_threshold: float = 0.7
    ) -> "PipelineBuilder":
        """Enable semantic chunking.

        Args:
            similarity_threshold: Threshold for topic shift detection
        """
        self._features.use_semantic_chunking = True
        self._settings.chunker_type = ChunkerType.SEMANTIC
        self._settings.semantic_similarity_threshold = similarity_threshold
        return self

    def with_token_chunking(self) -> "PipelineBuilder":
        """Use token-based chunking (default)."""
        self._features.use_semantic_chunking = False
        self._settings.chunker_type = ChunkerType.TOKEN
        return self

    def with_chunk_size(
        self,
        target_tokens: int = 600,
        min_tokens: int = 200,
        max_tokens: int = 1000,
        overlap_percent: float = 0.15,
    ) -> "PipelineBuilder":
        """Configure chunk size parameters.

        Args:
            target_tokens: Target tokens per chunk
            min_tokens: Minimum chunk size
            max_tokens: Maximum chunk size
            overlap_percent: Overlap between chunks
        """
        self._settings.chunk_target_tokens = target_tokens
        self._settings.chunk_min_tokens = min_tokens
        self._settings.chunk_max_tokens = max_tokens
        self._settings.chunk_overlap_percent = overlap_percent
        return self

    # Context Configuration
    def with_running_context(
        self,
        max_tokens: int = 2000,
        decay_factor: float = 0.9,
    ) -> "PipelineBuilder":
        """Enable running context across chunks.

        Args:
            max_tokens: Maximum context tokens
            decay_factor: Decay factor for older context
        """
        self._features.use_running_context = True
        self._settings.context_max_tokens = max_tokens
        self._settings.context_decay_factor = decay_factor
        return self

    def without_running_context(self) -> "PipelineBuilder":
        """Disable running context."""
        self._features.use_running_context = False
        return self

    def with_entity_tracking(
        self,
        similarity_threshold: float = 0.85,
        max_entities: int = 100,
    ) -> "PipelineBuilder":
        """Enable entity tracking.

        Args:
            similarity_threshold: Threshold for entity matching
            max_entities: Maximum entities to track
        """
        self._features.use_entity_tracking = True
        self._settings.entity_similarity_threshold = similarity_threshold
        self._settings.entity_max_tracked = max_entities
        return self

    def without_entity_tracking(self) -> "PipelineBuilder":
        """Disable entity tracking."""
        self._features.use_entity_tracking = False
        return self

    # Compression Configuration
    def with_adaptive_compression(
        self,
        base_ratio: float = 0.3,
        min_ratio: float = 0.15,
        max_ratio: float = 0.5,
    ) -> "PipelineBuilder":
        """Enable adaptive compression.

        Args:
            base_ratio: Base compression ratio
            min_ratio: Minimum ratio (most compression)
            max_ratio: Maximum ratio (least compression)
        """
        self._features.use_adaptive_compression = True
        self._settings.compression_base_ratio = base_ratio
        self._settings.compression_min_ratio = min_ratio
        self._settings.compression_max_ratio = max_ratio
        return self

    def with_fixed_compression(self, ratio: float = 0.3) -> "PipelineBuilder":
        """Use fixed compression ratio.

        Args:
            ratio: Fixed compression ratio
        """
        self._features.use_adaptive_compression = False
        self._settings.compression_base_ratio = ratio
        return self

    # Summarization Strategy Configuration
    def with_strategy(
        self, strategy: SummarizationStrategy
    ) -> "PipelineBuilder":
        """Set the summarization strategy.

        Available strategies:
        - BASIC: Simple prompts (fastest, lowest quality)
        - STRUCTURED: Better prompts with strict constraints (recommended)
        - TWO_PASS: Extract key info, then synthesize (better factuality)
        - CHAIN_OF_DENSITY: Progressive density increase (most information-dense)
        - HYBRID: Extractive then abstractive (best for technical content)

        Args:
            strategy: SummarizationStrategy to use
        """
        self._settings.summarization_strategy = strategy
        return self

    def with_basic_strategy(self) -> "PipelineBuilder":
        """Use basic summarization (fastest, minimal prompts)."""
        self._settings.summarization_strategy = SummarizationStrategy.BASIC
        return self

    def with_structured_strategy(self) -> "PipelineBuilder":
        """Use structured prompts with strict constraints (recommended default)."""
        self._settings.summarization_strategy = SummarizationStrategy.STRUCTURED
        return self

    def with_two_pass_strategy(self) -> "PipelineBuilder":
        """Use two-pass summarization (extract key info, then synthesize).

        Best for: Documents where preserving all key facts is critical.
        """
        self._settings.summarization_strategy = SummarizationStrategy.TWO_PASS
        return self

    def with_chain_of_density_strategy(self) -> "PipelineBuilder":
        """Use chain-of-density prompting (progressive information packing).

        Best for: Getting maximum information density in summaries.
        """
        self._settings.summarization_strategy = SummarizationStrategy.CHAIN_OF_DENSITY
        return self

    def with_hybrid_strategy(self) -> "PipelineBuilder":
        """Use hybrid extractive-then-abstractive strategy.

        Best for: Technical content, maintaining key sentence fidelity.
        """
        self._settings.summarization_strategy = SummarizationStrategy.HYBRID
        return self

    # Validation Configuration
    def with_validation(
        self,
        max_attempts: int = 3,
        min_coverage: float = 0.7,
        min_coherence: float = 0.6,
        min_overall: float = 0.65,
    ) -> "PipelineBuilder":
        """Enable validation loop.

        Args:
            max_attempts: Maximum retry attempts
            min_coverage: Minimum coverage score
            min_coherence: Minimum coherence score
            min_overall: Minimum overall score
        """
        self._features.use_validation_loop = True
        self._settings.validation_max_attempts = max_attempts
        self._settings.validation_min_coverage = min_coverage
        self._settings.validation_min_coherence = min_coherence
        self._settings.validation_min_overall = min_overall
        return self

    def without_validation(self) -> "PipelineBuilder":
        """Disable validation loop."""
        self._features.use_validation_loop = False
        return self

    # Deduplication Configuration
    def with_deduplication(
        self, similarity_threshold: float = 0.9
    ) -> "PipelineBuilder":
        """Enable overlap deduplication.

        Args:
            similarity_threshold: Threshold for duplicate detection
        """
        self._features.use_overlap_dedup = True
        self._settings.dedup_similarity_threshold = similarity_threshold
        return self

    def without_deduplication(self) -> "PipelineBuilder":
        """Disable overlap deduplication."""
        self._features.use_overlap_dedup = False
        return self

    # Merging Configuration
    def with_hierarchical_merge(
        self,
        max_batch: int = 4,
        target_ratio: float = 0.5,
    ) -> "PipelineBuilder":
        """Enable hierarchical merging.

        Args:
            max_batch: Maximum summaries to merge at once
            target_ratio: Target compression per merge level
        """
        self._features.use_hierarchical_merge = True
        self._settings.merge_max_batch = max_batch
        self._settings.merge_target_ratio = target_ratio
        return self

    def without_hierarchical_merge(self) -> "PipelineBuilder":
        """Disable hierarchical merging."""
        self._features.use_hierarchical_merge = False
        return self

    # Debug Configuration
    def with_debug(
        self,
        log_prompts: bool = False,
        log_responses: bool = False,
        save_intermediate: bool = False,
    ) -> "PipelineBuilder":
        """Enable debug options.

        Args:
            log_prompts: Log LLM prompts
            log_responses: Log LLM responses
            save_intermediate: Save intermediate results
        """
        self._features.debug_log_prompts = log_prompts
        self._features.debug_log_responses = log_responses
        self._features.debug_save_intermediate = save_intermediate
        return self

    # Preset Configurations
    def fast(self) -> "PipelineBuilder":
        """Configure for fast processing (minimal features).

        Uses basic strategy, no validation, no context tracking.
        Best for: Quick drafts, initial prototyping.
        """
        self._features.use_semantic_chunking = False
        self._features.use_running_context = False
        self._features.use_entity_tracking = False
        self._features.use_adaptive_compression = False
        self._features.use_validation_loop = False
        self._features.use_overlap_dedup = False
        self._features.use_hierarchical_merge = False
        self._settings.summarization_strategy = SummarizationStrategy.BASIC
        return self

    def balanced(self) -> "PipelineBuilder":
        """Configure for balanced quality/speed.

        Uses structured strategy with validation and context.
        Best for: Production use with reasonable latency requirements.
        """
        self._features.use_semantic_chunking = False
        self._features.use_running_context = True
        self._features.use_entity_tracking = False
        self._features.use_adaptive_compression = True
        self._features.use_validation_loop = True
        self._features.use_overlap_dedup = True
        self._features.use_hierarchical_merge = True
        self._settings.validation_max_attempts = 2
        self._settings.summarization_strategy = SummarizationStrategy.STRUCTURED
        return self

    def quality(self) -> "PipelineBuilder":
        """Configure for maximum quality (all features).

        Uses two-pass strategy with full validation and entity tracking.
        Best for: Final production summaries where quality is paramount.
        """
        self._features.use_semantic_chunking = True
        self._features.use_running_context = True
        self._features.use_entity_tracking = True
        self._features.use_adaptive_compression = True
        self._features.use_validation_loop = True
        self._features.use_overlap_dedup = True
        self._features.use_hierarchical_merge = True
        self._settings.validation_max_attempts = 3
        self._settings.summarization_strategy = SummarizationStrategy.TWO_PASS
        return self

    def maximum_density(self) -> "PipelineBuilder":
        """Configure for maximum information density.

        Uses chain-of-density strategy for information-packed summaries.
        Best for: When you need to preserve maximum information in minimal space.
        """
        self._features.use_semantic_chunking = True
        self._features.use_running_context = True
        self._features.use_entity_tracking = True
        self._features.use_adaptive_compression = True
        self._features.use_validation_loop = True
        self._features.use_overlap_dedup = True
        self._features.use_hierarchical_merge = True
        self._settings.validation_max_attempts = 3
        self._settings.summarization_strategy = SummarizationStrategy.CHAIN_OF_DENSITY
        return self

    def build(self) -> SummarizationPipeline:
        """Build and return the configured pipeline.

        Returns:
            Configured SummarizationPipeline instance
        """
        return SummarizationPipeline(
            settings=self._settings,
            features=self._features,
            llm_client=self._llm_client,
        )

    @property
    def settings(self) -> SummarizationSettings:
        """Get current settings."""
        return self._settings

    @property
    def features(self) -> FeatureFlags:
        """Get current feature flags."""
        return self._features
