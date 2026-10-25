"""Semantic chunker using embeddings to find topic boundaries."""

import hashlib
import logging
import re
from typing import List, Optional, Tuple

import numpy as np
import tiktoken

from worker.tools.reader.summarize.core.models import Chunk, SummarizationContext
from worker.tools.reader.summarize.core.protocols import AsyncChunkerProtocol, LLMClientProtocol
from worker.tools.reader.summarize.config.settings import SummarizationSettings

logger = logging.getLogger(__name__)


class SemanticChunker(AsyncChunkerProtocol):
    """Split text at semantic boundaries using embeddings.

    This chunker uses sentence embeddings to detect topic shifts
    and creates chunks at natural semantic boundaries while respecting
    token constraints.
    """

    def __init__(
        self,
        llm_client: LLMClientProtocol,
        target_tokens: int = 600,
        min_tokens: int = 200,
        max_tokens: int = 1000,
        similarity_threshold: float = 0.7,
        window_size: int = 3,
        tokenizer_encoding: str = "cl100k_base",
    ):
        """Initialize the semantic chunker.

        Args:
            llm_client: LLM client for getting embeddings
            target_tokens: Target number of tokens per chunk
            min_tokens: Minimum tokens for a valid chunk
            max_tokens: Maximum tokens for a chunk
            similarity_threshold: Threshold below which to split (0-1)
            window_size: Number of sentences to combine for embedding
            tokenizer_encoding: Tiktoken encoding name
        """
        self._llm_client = llm_client
        self.target_tokens = target_tokens
        self.min_tokens = min_tokens
        self.max_tokens = max_tokens
        self.similarity_threshold = similarity_threshold
        self.window_size = window_size
        self._tokenizer = tiktoken.get_encoding(tokenizer_encoding)

    @classmethod
    def from_settings(
        cls, llm_client: LLMClientProtocol, settings: SummarizationSettings
    ) -> "SemanticChunker":
        """Create chunker from settings."""
        return cls(
            llm_client=llm_client,
            target_tokens=settings.chunk_target_tokens,
            min_tokens=settings.chunk_min_tokens,
            max_tokens=settings.chunk_max_tokens,
            similarity_threshold=settings.semantic_similarity_threshold,
            tokenizer_encoding=settings.tokenizer_encoding,
        )

    def count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken."""
        if not text:
            return 0
        return len(self._tokenizer.encode(text))

    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]

    def _generate_chunk_id(self, content: str, index: int) -> str:
        """Generate a deterministic chunk ID."""
        hash_input = f"{content[:100]}_{index}"
        return f"sem_chunk_{hashlib.md5(hash_input.encode()).hexdigest()[:8]}_{index}"

    def _create_windows(self, sentences: List[str]) -> List[str]:
        """Create sliding windows of sentences for embedding."""
        if len(sentences) <= self.window_size:
            return [' '.join(sentences)]

        windows = []
        for i in range(len(sentences) - self.window_size + 1):
            window_text = ' '.join(sentences[i:i + self.window_size])
            windows.append(window_text)

        return windows

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        a = np.array(vec1)
        b = np.array(vec2)
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

    def _find_split_points(
        self, similarities: List[float], sentence_count: int
    ) -> List[int]:
        """Find sentence indices where topic shifts occur.

        Args:
            similarities: Cosine similarities between adjacent windows
            sentence_count: Total number of sentences

        Returns:
            List of sentence indices to split at
        """
        if not similarities:
            return []

        split_points = []

        # Find local minima below threshold
        for i, sim in enumerate(similarities):
            if sim < self.similarity_threshold:
                # Check if it's a local minimum
                is_local_min = True
                if i > 0 and similarities[i - 1] < sim:
                    is_local_min = False
                if i < len(similarities) - 1 and similarities[i + 1] < sim:
                    is_local_min = False

                if is_local_min:
                    # Map window index to sentence index
                    # Window i covers sentences i to i+window_size-1
                    # Split after sentence i + window_size // 2
                    split_idx = i + self.window_size // 2
                    if 0 < split_idx < sentence_count:
                        split_points.append(split_idx)

        return sorted(set(split_points))

    def _merge_small_segments(
        self, sentences: List[str], split_points: List[int]
    ) -> List[int]:
        """Merge segments that are too small.

        Args:
            sentences: All sentences
            split_points: Current split points

        Returns:
            Adjusted split points
        """
        if not split_points:
            return split_points

        # Add boundaries
        boundaries = [0] + split_points + [len(sentences)]
        adjusted_splits = []

        for i in range(len(boundaries) - 1):
            start = boundaries[i]
            end = boundaries[i + 1]
            segment_text = ' '.join(sentences[start:end])
            segment_tokens = self.count_tokens(segment_text)

            # If segment is too small, skip this split point
            if segment_tokens >= self.min_tokens:
                if i > 0:  # Don't add the initial 0
                    adjusted_splits.append(start)

        return adjusted_splits

    def _enforce_max_tokens(
        self, sentences: List[str], split_points: List[int]
    ) -> List[int]:
        """Add split points if segments exceed max tokens.

        Args:
            sentences: All sentences
            split_points: Current split points

        Returns:
            Split points with additional breaks for large segments
        """
        boundaries = [0] + split_points + [len(sentences)]
        new_splits = []

        for i in range(len(boundaries) - 1):
            start = boundaries[i]
            end = boundaries[i + 1]

            # Check segment size
            current_start = start
            current_tokens = 0

            for j in range(start, end):
                sentence_tokens = self.count_tokens(sentences[j])
                if current_tokens + sentence_tokens > self.max_tokens and j > current_start:
                    new_splits.append(j)
                    current_start = j
                    current_tokens = sentence_tokens
                else:
                    current_tokens += sentence_tokens

        # Merge with original splits and sort
        all_splits = sorted(set(split_points + new_splits))
        return all_splits

    async def chunk(
        self, content: str, context: Optional[SummarizationContext] = None
    ) -> List[Chunk]:
        """Split content into chunks at semantic boundaries.

        Args:
            content: Text content to chunk
            context: Optional summarization context (unused)

        Returns:
            List of Chunk objects
        """
        if not content or not content.strip():
            return []

        content = content.strip()
        content_tokens = self.count_tokens(content)

        # If content fits in one chunk, return as single chunk
        if content_tokens <= self.target_tokens:
            return [
                Chunk(
                    id=self._generate_chunk_id(content, 0),
                    content=content,
                    token_count=content_tokens,
                    start_char=0,
                    end_char=len(content),
                    index=0,
                )
            ]

        sentences = self._split_into_sentences(content)
        if len(sentences) < self.window_size + 1:
            # Not enough sentences for semantic analysis, return as single chunk
            return [
                Chunk(
                    id=self._generate_chunk_id(content, 0),
                    content=content,
                    token_count=content_tokens,
                    start_char=0,
                    end_char=len(content),
                    index=0,
                )
            ]

        # Create windows and get embeddings
        windows = self._create_windows(sentences)

        try:
            embeddings = await self._llm_client.get_embeddings_batch(windows)
        except Exception as e:
            logger.warning(f"Failed to get embeddings, falling back to token chunking: {e}")
            # Fall back to simple token-based chunking
            return self._fallback_chunk(sentences, content)

        # Calculate similarities between adjacent windows
        similarities = []
        for i in range(len(embeddings) - 1):
            sim = self._cosine_similarity(embeddings[i], embeddings[i + 1])
            similarities.append(sim)

        # Find split points based on topic shifts
        split_points = self._find_split_points(similarities, len(sentences))

        # Merge small segments
        split_points = self._merge_small_segments(sentences, split_points)

        # Enforce max tokens
        split_points = self._enforce_max_tokens(sentences, split_points)

        # Build chunks from split points
        boundaries = [0] + split_points + [len(sentences)]
        chunks: List[Chunk] = []
        char_offset = 0

        for i in range(len(boundaries) - 1):
            start_idx = boundaries[i]
            end_idx = boundaries[i + 1]
            chunk_sentences = sentences[start_idx:end_idx]
            chunk_content = ' '.join(chunk_sentences)
            chunk_tokens = self.count_tokens(chunk_content)

            chunks.append(
                Chunk(
                    id=self._generate_chunk_id(chunk_content, i),
                    content=chunk_content,
                    token_count=chunk_tokens,
                    start_char=char_offset,
                    end_char=char_offset + len(chunk_content),
                    index=i,
                    metadata={
                        "sentence_start": start_idx,
                        "sentence_end": end_idx,
                        "semantic_chunking": True,
                    },
                )
            )

            char_offset += len(chunk_content) + 1

        return chunks

    def _fallback_chunk(self, sentences: List[str], content: str) -> List[Chunk]:
        """Fallback to simple token-based chunking when embeddings fail."""
        chunks: List[Chunk] = []
        current_sentences: List[str] = []
        current_tokens = 0
        chunk_index = 0
        char_offset = 0

        for sentence in sentences:
            sentence_tokens = self.count_tokens(sentence)

            if current_tokens + sentence_tokens > self.target_tokens and current_sentences:
                chunk_content = ' '.join(current_sentences)
                chunk_tokens = self.count_tokens(chunk_content)

                chunks.append(
                    Chunk(
                        id=self._generate_chunk_id(chunk_content, chunk_index),
                        content=chunk_content,
                        token_count=chunk_tokens,
                        start_char=char_offset,
                        end_char=char_offset + len(chunk_content),
                        index=chunk_index,
                        metadata={"semantic_chunking": False},
                    )
                )

                chunk_index += 1
                char_offset += len(chunk_content) + 1
                current_sentences = []
                current_tokens = 0

            current_sentences.append(sentence)
            current_tokens += sentence_tokens

        if current_sentences:
            chunk_content = ' '.join(current_sentences)
            chunk_tokens = self.count_tokens(chunk_content)

            chunks.append(
                Chunk(
                    id=self._generate_chunk_id(chunk_content, chunk_index),
                    content=chunk_content,
                    token_count=chunk_tokens,
                    start_char=char_offset,
                    end_char=char_offset + len(chunk_content),
                    index=chunk_index,
                    metadata={"semantic_chunking": False},
                )
            )

        return chunks
