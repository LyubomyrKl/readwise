"""Central configuration via environment variables."""

import os
from enum import Enum
from pydantic import Field
from pydantic_settings import BaseSettings


class ChunkerType(str, Enum):
    TOKEN = "token"
    SEMANTIC = "semantic"


class SummaryType(str, Enum):
    EXTRACTIVE = "extractive"
    ABSTRACTIVE = "abstractive"


class SummarizationStrategy(str, Enum):
    """Available summarization strategies for quality improvement."""
    BASIC = "basic"                    # Original simple approach
    STRUCTURED = "structured"          # Better prompts with strict constraints
    TWO_PASS = "two_pass"              # Extract key info, then synthesize
    CHAIN_OF_DENSITY = "chain_of_density"  # Progressive density increase
    HYBRID = "hybrid"                  # Extractive then abstractive rewrite


class SummarizationSettings(BaseSettings):
    """Central configuration for summarization pipeline.

    All settings can be overridden via environment variables with SUMMARIZER_ prefix
    or via OLLAMA_* environment variables.
    Example: SUMMARIZER_OLLAMA_BASE_URL=http://100.96.63.127:11434
    """

    # LLM Configuration - read from environment (required)
    # Uses OLLAMA_* env vars directly, or SUMMARIZER_OLLAMA_* with prefix
    ollama_base_url: str = Field(default_factory=lambda: os.environ.get('OLLAMA_BASE_URL', ''))
    ollama_model: str = Field(default_factory=lambda: os.environ.get('OLLAMA_MODEL', ''))
    ollama_embed_model: str = Field(default_factory=lambda: os.environ.get('OLLAMA_EMBED_MODEL', ''))
    llm_max_concurrent: int = 5
    llm_timeout: float = 120.0
    llm_retry_attempts: int = 3
    llm_retry_base_delay: float = 1.0

    # Chunking Configuration
    chunker_type: ChunkerType = ChunkerType.TOKEN
    chunk_target_tokens: int = 600
    chunk_min_tokens: int = 200
    chunk_max_tokens: int = 1000
    chunk_overlap_percent: float = 0.15
    semantic_similarity_threshold: float = 0.7

    # Context Configuration
    context_max_tokens: int = 2000
    context_decay_factor: float = 0.9
    context_summary_weight: float = 0.7
    entity_similarity_threshold: float = 0.85
    entity_max_tracked: int = 100

    # Compression Configuration
    compression_base_ratio: float = 0.3
    compression_min_ratio: float = 0.15
    compression_max_ratio: float = 0.5

    # Summarization Strategy
    summarization_strategy: SummarizationStrategy = SummarizationStrategy.STRUCTURED

    # Paragraph Formatting
    format_paragraphs: bool = True
    paragraph_min_sentences: int = 2
    paragraph_max_sentences: int = 5

    # Validation Configuration
    validation_max_attempts: int = 3
    validation_min_coverage: float = 0.7
    validation_min_coherence: float = 0.6
    validation_min_overall: float = 0.65
    validation_improvement_threshold: float = 0.1

    # Merging Configuration
    merge_max_batch: int = 4
    merge_target_ratio: float = 0.5

    # Deduplication Configuration
    dedup_similarity_threshold: float = 0.9

    # Token counting
    tokenizer_encoding: str = "cl100k_base"

    class Config:
        env_prefix = "SUMMARIZER_"
        env_file = ".env"
        extra = "ignore"
