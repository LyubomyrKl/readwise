"""Overlap deduplication for removing duplicate content between adjacent summaries."""

import hashlib
import logging
import re
from difflib import SequenceMatcher
from typing import List, Optional, Set, Tuple

import tiktoken

from worker.tools.reader.summarize.core.models import Summary
from worker.tools.reader.summarize.core.protocols import DeduplicatorProtocol, LLMClientProtocol
from worker.tools.reader.summarize.config.settings import SummarizationSettings

logger = logging.getLogger(__name__)


class OverlapDeduplicator(DeduplicatorProtocol):
    """Remove duplicate content from overlapping chunks.

    When chunks have overlap, their summaries may contain redundant information.
    This class detects and removes such duplicates while maintaining coherence.
    """

    def __init__(
        self,
        similarity_threshold: float = 0.9,
        use_semantic: bool = False,
        llm_client: Optional[LLMClientProtocol] = None,
        tokenizer_encoding: str = "cl100k_base",
    ):
        """Initialize the deduplicator.

        Args:
            similarity_threshold: Threshold for considering sentences duplicate (0-1)
            use_semantic: Whether to use semantic similarity (requires LLM)
            llm_client: Optional LLM client for semantic deduplication
            tokenizer_encoding: Tiktoken encoding name
        """
        self.similarity_threshold = similarity_threshold
        self.use_semantic = use_semantic
        self._llm_client = llm_client
        self._tokenizer = tiktoken.get_encoding(tokenizer_encoding)

    @classmethod
    def from_settings(
        cls,
        settings: SummarizationSettings,
        llm_client: Optional[LLMClientProtocol] = None,
    ) -> "OverlapDeduplicator":
        """Create deduplicator from settings."""
        return cls(
            similarity_threshold=settings.dedup_similarity_threshold,
            use_semantic=llm_client is not None,
            llm_client=llm_client,
            tokenizer_encoding=settings.tokenizer_encoding,
        )

    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]

    def _normalize_sentence(self, sentence: str) -> str:
        """Normalize a sentence for comparison."""
        # Lowercase, remove extra whitespace, remove punctuation
        normalized = sentence.lower()
        normalized = re.sub(r'\s+', ' ', normalized)
        normalized = re.sub(r'[^\w\s]', '', normalized)
        return normalized.strip()

    def _sentence_hash(self, sentence: str) -> str:
        """Generate a hash for a sentence."""
        normalized = self._normalize_sentence(sentence)
        return hashlib.md5(normalized.encode()).hexdigest()

    def _calculate_similarity(self, sent1: str, sent2: str) -> float:
        """Calculate similarity between two sentences.

        Args:
            sent1: First sentence
            sent2: Second sentence

        Returns:
            Similarity score (0-1)
        """
        norm1 = self._normalize_sentence(sent1)
        norm2 = self._normalize_sentence(sent2)

        # Exact match after normalization
        if norm1 == norm2:
            return 1.0

        # Use SequenceMatcher for fuzzy matching
        return SequenceMatcher(None, norm1, norm2).ratio()

    def _find_duplicate_sentences(
        self, sentences1: List[str], sentences2: List[str]
    ) -> Set[int]:
        """Find indices of duplicate sentences in sentences2.

        Args:
            sentences1: Sentences from first summary
            sentences2: Sentences from second summary

        Returns:
            Set of indices in sentences2 that are duplicates
        """
        duplicates = set()

        # Build hash set for quick lookup
        hashes1 = {self._sentence_hash(s): i for i, s in enumerate(sentences1)}

        for i, sent2 in enumerate(sentences2):
            hash2 = self._sentence_hash(sent2)

            # Check exact hash match
            if hash2 in hashes1:
                duplicates.add(i)
                continue

            # Check similarity with each sentence in sentences1
            for sent1 in sentences1:
                similarity = self._calculate_similarity(sent1, sent2)
                if similarity >= self.similarity_threshold:
                    duplicates.add(i)
                    break

        return duplicates

    def _count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        return len(self._tokenizer.encode(text))

    def deduplicate_pair(
        self, summary1: Summary, summary2: Summary
    ) -> Tuple[Summary, Summary]:
        """Remove duplicates between two adjacent summaries.

        Duplicates are removed from the second summary to preserve
        chronological flow.

        Args:
            summary1: First summary (kept intact)
            summary2: Second summary (duplicates removed)

        Returns:
            Tuple of (original summary1, deduplicated summary2)
        """
        sentences1 = self._split_into_sentences(summary1.content)
        sentences2 = self._split_into_sentences(summary2.content)

        if not sentences1 or not sentences2:
            return summary1, summary2

        # Find duplicates in summary2
        duplicate_indices = self._find_duplicate_sentences(sentences1, sentences2)

        if not duplicate_indices:
            return summary1, summary2

        # Remove duplicates from summary2
        deduped_sentences = [
            sent for i, sent in enumerate(sentences2)
            if i not in duplicate_indices
        ]

        if not deduped_sentences:
            # Don't remove everything - keep at least the last sentence
            deduped_sentences = [sentences2[-1]]

        deduped_content = ' '.join(deduped_sentences)
        deduped_tokens = self._count_tokens(deduped_content)

        # Create new summary with deduped content
        deduped_summary = Summary(
            chunk_id=summary2.chunk_id,
            content=deduped_content,
            token_count=deduped_tokens,
            compression_ratio=deduped_tokens / summary2.original_tokens if summary2.original_tokens > 0 else 1.0,
            original_tokens=summary2.original_tokens,
            entities=summary2.entities,
            quality_score=summary2.quality_score,
            attempt_count=summary2.attempt_count,
            metadata={
                **summary2.metadata,
                "duplicates_removed": len(duplicate_indices),
                "original_sentences": len(sentences2),
                "final_sentences": len(deduped_sentences),
            },
        )

        logger.debug(
            f"Removed {len(duplicate_indices)} duplicate sentences from {summary2.chunk_id}"
        )

        return summary1, deduped_summary

    def deduplicate_sequence(self, summaries: List[Summary]) -> List[Summary]:
        """Deduplicate an entire sequence of summaries.

        Processes pairs of adjacent summaries, removing duplicates from
        the later summary in each pair.

        Args:
            summaries: List of summaries in order

        Returns:
            List of deduplicated summaries
        """
        if len(summaries) < 2:
            return summaries

        result = [summaries[0]]  # First summary unchanged

        for i in range(1, len(summaries)):
            _, deduped = self.deduplicate_pair(result[-1], summaries[i])
            result.append(deduped)

        total_removed = sum(
            s.metadata.get("duplicates_removed", 0) for s in result
        )

        if total_removed > 0:
            logger.info(
                f"Deduplicated {len(summaries)} summaries, "
                f"removed {total_removed} total duplicate sentences"
            )

        return result

    async def deduplicate_semantic(
        self, summary1: Summary, summary2: Summary
    ) -> Tuple[Summary, Summary]:
        """Deduplicate using semantic similarity (requires LLM).

        Uses embeddings to find semantically similar (not just textually similar)
        sentences to remove.

        Args:
            summary1: First summary
            summary2: Second summary

        Returns:
            Tuple of (original summary1, deduplicated summary2)
        """
        if not self._llm_client:
            return self.deduplicate_pair(summary1, summary2)

        sentences1 = self._split_into_sentences(summary1.content)
        sentences2 = self._split_into_sentences(summary2.content)

        if not sentences1 or not sentences2:
            return summary1, summary2

        try:
            # Get embeddings for all sentences
            all_sentences = sentences1 + sentences2
            embeddings = await self._llm_client.get_embeddings_batch(all_sentences)

            embeddings1 = embeddings[:len(sentences1)]
            embeddings2 = embeddings[len(sentences1):]

            # Find semantic duplicates
            duplicate_indices = set()

            for i, emb2 in enumerate(embeddings2):
                for emb1 in embeddings1:
                    # Calculate cosine similarity
                    import numpy as np
                    similarity = float(
                        np.dot(emb1, emb2) /
                        (np.linalg.norm(emb1) * np.linalg.norm(emb2))
                    )
                    if similarity >= self.similarity_threshold:
                        duplicate_indices.add(i)
                        break

            if not duplicate_indices:
                return summary1, summary2

            # Remove duplicates
            deduped_sentences = [
                sent for i, sent in enumerate(sentences2)
                if i not in duplicate_indices
            ]

            if not deduped_sentences:
                deduped_sentences = [sentences2[-1]]

            deduped_content = ' '.join(deduped_sentences)
            deduped_tokens = self._count_tokens(deduped_content)

            deduped_summary = Summary(
                chunk_id=summary2.chunk_id,
                content=deduped_content,
                token_count=deduped_tokens,
                compression_ratio=deduped_tokens / summary2.original_tokens if summary2.original_tokens > 0 else 1.0,
                original_tokens=summary2.original_tokens,
                entities=summary2.entities,
                quality_score=summary2.quality_score,
                attempt_count=summary2.attempt_count,
                metadata={
                    **summary2.metadata,
                    "semantic_dedup": True,
                    "duplicates_removed": len(duplicate_indices),
                },
            )

            return summary1, deduped_summary

        except Exception as e:
            logger.warning(f"Semantic deduplication failed, falling back to text-based: {e}")
            return self.deduplicate_pair(summary1, summary2)
