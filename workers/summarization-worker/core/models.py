"""Shared data models for the summarization pipeline."""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime


@dataclass
class Chunk:
    """A chunk of text to be summarized."""

    id: str
    content: str
    token_count: int
    start_char: int
    end_char: int
    index: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class Entity:
    """An entity extracted from text."""

    name: str
    type: str  # person, place, organization, concept, term, etc.
    aliases: List[str] = field(default_factory=list)
    first_mention_chunk: str = ""
    mention_count: int = 1
    context: str = ""  # Brief description/definition
    importance_score: float = 0.0

    def __post_init__(self):
        if self.aliases is None:
            self.aliases = []

    def merge_with(self, other: "Entity") -> None:
        """Merge another entity into this one."""
        self.aliases.extend(other.aliases)
        if other.name not in self.aliases and other.name != self.name:
            self.aliases.append(other.name)
        self.mention_count += other.mention_count
        self.aliases = list(set(self.aliases))
        if other.context and not self.context:
            self.context = other.context
        self.importance_score = max(self.importance_score, other.importance_score)


@dataclass
class Summary:
    """A summary of a chunk."""

    chunk_id: str
    content: str
    token_count: int
    compression_ratio: float
    original_tokens: int
    entities: List[str] = field(default_factory=list)
    quality_score: Optional[float] = None
    attempt_count: int = 1
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if self.entities is None:
            self.entities = []
        if self.metadata is None:
            self.metadata = {}


@dataclass
class SummarizationContext:
    """Running context passed between chunks during summarization."""

    previous_summaries: List[Summary] = field(default_factory=list)
    entity_registry: Dict[str, Entity] = field(default_factory=dict)
    section_context: str = ""  # High-level context from parent section
    section_title: str = ""
    accumulated_tokens: int = 0
    chunk_index: int = 0
    total_chunks: int = 0

    def __post_init__(self):
        if self.previous_summaries is None:
            self.previous_summaries = []
        if self.entity_registry is None:
            self.entity_registry = {}

    def add_summary(self, summary: Summary) -> None:
        """Add a summary to the context."""
        self.previous_summaries.append(summary)
        self.accumulated_tokens += summary.token_count
        self.chunk_index += 1

    def get_recent_summaries(self, max_tokens: int) -> List[Summary]:
        """Get recent summaries up to max_tokens."""
        result = []
        total_tokens = 0
        for summary in reversed(self.previous_summaries):
            if total_tokens + summary.token_count > max_tokens:
                break
            result.insert(0, summary)
            total_tokens += summary.token_count
        return result

    def get_important_entities(self, top_k: int = 10) -> List[Entity]:
        """Get most important entities by mention count."""
        entities = list(self.entity_registry.values())
        entities.sort(key=lambda e: (e.mention_count, e.importance_score), reverse=True)
        return entities[:top_k]


@dataclass
class ValidationResult:
    """Result of summary validation."""

    is_valid: bool
    score: float  # 0-1 quality score
    coverage_score: float = 0.0
    coherence_score: float = 0.0
    factuality_score: float = 0.0
    issues: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)

    def __post_init__(self):
        if self.issues is None:
            self.issues = []
        if self.suggestions is None:
            self.suggestions = []


@dataclass
class DensityMetrics:
    """Content density metrics for adaptive compression."""

    information_density: float  # 0-1, higher = more dense
    redundancy_score: float  # 0-1, higher = more redundant
    key_point_ratio: float  # Estimated ratio of key information
    suggested_compression: float  # Suggested compression ratio
    unique_terms_ratio: float = 0.0
    avg_sentence_length: float = 0.0

    @property
    def is_dense(self) -> bool:
        """Check if content is information-dense."""
        return self.information_density > 0.7

    @property
    def is_redundant(self) -> bool:
        """Check if content has high redundancy."""
        return self.redundancy_score > 0.5


@dataclass
class LLMRequest:
    """A request to the LLM."""

    prompt: str
    system_prompt: Optional[str] = None
    max_tokens: int = 1000
    temperature: float = 0.3
    request_id: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResponse:
    """A response from the LLM."""

    content: str
    request_id: str = ""
    tokens_used: int = 0
    latency_ms: float = 0.0
    success: bool = True
    error: Optional[str] = None


@dataclass
class PipelineResult:
    """Result of the summarization pipeline."""

    summary_json: Dict[str, Any]
    metadata: Dict[str, Any]
    entity_registry: Dict[str, Entity]
    quality_metrics: Dict[str, float]
    processing_time_ms: float = 0.0
    total_original_tokens: int = 0
    total_summary_tokens: int = 0

    @property
    def overall_compression_ratio(self) -> float:
        """Calculate overall compression ratio."""
        if self.total_original_tokens == 0:
            return 0.0
        return self.total_summary_tokens / self.total_original_tokens
