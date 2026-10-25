"""Token-based text chunker with overlap support."""

import re
import hashlib
from typing import List, Optional

import tiktoken

from worker.tools.reader.summarize.core.models import Chunk, SummarizationContext
from worker.tools.reader.summarize.core.protocols import ChunkerProtocol
from worker.tools.reader.summarize.config.settings import SummarizationSettings


class TokenChunker(ChunkerProtocol):
    """Split text into overlapping chunks based on token count.

    This chunker splits text at sentence boundaries while respecting
    a target token count. Adjacent chunks have configurable overlap
    to maintain context continuity.
    """

    def __init__(
        self,
        target_tokens: int = 600,
        overlap_percent: float = 0.15,
        min_tokens: int = 100,
        tokenizer_encoding: str = "cl100k_base",
    ):
        """Initialize the token chunker.

        Args:
            target_tokens: Target number of tokens per chunk
            overlap_percent: Percentage of chunk to overlap with neighbors
            min_tokens: Minimum tokens for a valid chunk
            tokenizer_encoding: Tiktoken encoding name
        """
        self.target_tokens = target_tokens
        self.overlap_percent = overlap_percent
        self.min_tokens = min_tokens
        self._tokenizer = tiktoken.get_encoding(tokenizer_encoding)

    @classmethod
    def from_settings(cls, settings: SummarizationSettings) -> "TokenChunker":
        """Create chunker from settings."""
        return cls(
            target_tokens=settings.chunk_target_tokens,
            overlap_percent=settings.chunk_overlap_percent,
            min_tokens=settings.chunk_min_tokens,
            tokenizer_encoding=settings.tokenizer_encoding,
        )

    def count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken."""
        if not text:
            return 0
        return len(self._tokenizer.encode(text))

    def _generate_chunk_id(self, content: str, index: int) -> str:
        """Generate a deterministic chunk ID."""
        hash_input = f"{content[:100]}_{index}"
        return f"chunk_{hashlib.md5(hash_input.encode()).hexdigest()[:8]}_{index}"

    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]

    def chunk(
        self, content: str, context: Optional[SummarizationContext] = None
    ) -> List[Chunk]:
        """Split content into chunks with overlap.

        Args:
            content: Text content to chunk
            context: Optional summarization context (unused in token chunker)

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
        if not sentences:
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

        overlap_size = int(self.target_tokens * self.overlap_percent)
        chunks: List[Chunk] = []
        current_sentences: List[str] = []
        current_tokens = 0
        chunk_index = 0
        char_offset = 0

        for sentence in sentences:
            sentence_tokens = self.count_tokens(sentence)

            # Check if adding this sentence would exceed target
            if current_tokens + sentence_tokens > self.target_tokens and current_sentences:
                # Create chunk from current sentences
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
                    )
                )

                chunk_index += 1
                char_offset += len(chunk_content) + 1  # +1 for space

                # Keep overlap from end of current chunk
                overlap_tokens = 0
                overlap_sentences = []
                for sent in reversed(current_sentences):
                    sent_tokens = self.count_tokens(sent)
                    if overlap_tokens + sent_tokens <= overlap_size:
                        overlap_sentences.insert(0, sent)
                        overlap_tokens += sent_tokens
                    else:
                        break

                current_sentences = overlap_sentences
                current_tokens = overlap_tokens

            current_sentences.append(sentence)
            current_tokens += sentence_tokens

        # Handle remaining sentences
        if current_sentences:
            chunk_content = ' '.join(current_sentences)
            chunk_tokens = self.count_tokens(chunk_content)

            # Only add if it meets minimum token requirement or it's the only chunk
            if chunk_tokens >= self.min_tokens or not chunks:
                chunks.append(
                    Chunk(
                        id=self._generate_chunk_id(chunk_content, chunk_index),
                        content=chunk_content,
                        token_count=chunk_tokens,
                        start_char=char_offset,
                        end_char=char_offset + len(chunk_content),
                        index=chunk_index,
                    )
                )
            elif chunks:
                # Merge with previous chunk if too small
                last_chunk = chunks[-1]
                merged_content = f"{last_chunk.content} {chunk_content}"
                chunks[-1] = Chunk(
                    id=last_chunk.id,
                    content=merged_content,
                    token_count=self.count_tokens(merged_content),
                    start_char=last_chunk.start_char,
                    end_char=last_chunk.start_char + len(merged_content),
                    index=last_chunk.index,
                )

        return chunks

