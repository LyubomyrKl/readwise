"""Content density analysis for adaptive compression."""

import logging
import re
from collections import Counter
from typing import List, Optional, Set

import tiktoken

from worker.tools.reader.summarize.core.models import DensityMetrics
from worker.tools.reader.summarize.core.protocols import DensityAnalyzerProtocol, LLMClientProtocol
from worker.tools.reader.summarize.config.settings import SummarizationSettings

logger = logging.getLogger(__name__)

# Common English stop words to filter out
STOP_WORDS: Set[str] = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    "with", "by", "from", "as", "is", "was", "are", "were", "been", "be", "have",
    "has", "had", "do", "does", "did", "will", "would", "could", "should", "may",
    "might", "must", "shall", "can", "need", "it", "its", "this", "that", "these",
    "those", "i", "you", "he", "she", "we", "they", "what", "which", "who", "whom",
    "when", "where", "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
    "so", "than", "too", "very", "just", "also", "now", "here", "there", "then",
}


class DensityAnalyzer(DensityAnalyzerProtocol):
    """Analyze content density to determine optimal compression ratio.

    Uses a combination of heuristic metrics and optional LLM analysis
    to estimate information density.
    """

    def __init__(
        self,
        llm_client: Optional[LLMClientProtocol] = None,
        tokenizer_encoding: str = "cl100k_base",
    ):
        """Initialize the density analyzer.

        Args:
            llm_client: Optional LLM client for advanced analysis
            tokenizer_encoding: Tiktoken encoding name
        """
        self._llm_client = llm_client
        self._tokenizer = tiktoken.get_encoding(tokenizer_encoding)

    @classmethod
    def from_settings(
        cls,
        settings: SummarizationSettings,
        llm_client: Optional[LLMClientProtocol] = None,
    ) -> "DensityAnalyzer":
        """Create analyzer from settings."""
        return cls(
            llm_client=llm_client,
            tokenizer_encoding=settings.tokenizer_encoding,
        )

    def _tokenize_words(self, text: str) -> List[str]:
        """Tokenize text into words."""
        words = re.findall(r'\b[a-zA-Z]+\b', text.lower())
        return words

    def _count_sentences(self, text: str) -> int:
        """Count sentences in text."""
        sentences = re.split(r'[.!?]+', text)
        return len([s for s in sentences if s.strip()])

    def _calculate_unique_ratio(self, words: List[str]) -> float:
        """Calculate ratio of unique content words to total words."""
        content_words = [w for w in words if w not in STOP_WORDS and len(w) > 2]
        if not content_words:
            return 0.0
        unique_content = set(content_words)
        return len(unique_content) / len(content_words)

    def _calculate_repetition_score(self, words: List[str]) -> float:
        """Calculate repetition/redundancy score.

        Higher score means more repetition (more redundant).
        """
        if len(words) < 10:
            return 0.0

        content_words = [w for w in words if w not in STOP_WORDS and len(w) > 2]
        if not content_words:
            return 0.0

        word_counts = Counter(content_words)

        # Count words that appear more than once
        repeated_count = sum(
            count - 1 for word, count in word_counts.items() if count > 1
        )

        # Normalize by total content words
        redundancy = repeated_count / len(content_words)

        return min(1.0, redundancy * 2)  # Scale up slightly

    def _calculate_avg_sentence_length(self, text: str, words: List[str]) -> float:
        """Calculate average sentence length in words."""
        sentence_count = self._count_sentences(text)
        if sentence_count == 0:
            return 0.0
        return len(words) / sentence_count

    def _estimate_key_point_ratio(self, text: str) -> float:
        """Estimate the ratio of key information in text.

        Uses heuristics like presence of:
        - Numbers and statistics
        - Definitions (contains "is", "are", "means")
        - Lists and enumerations
        - Technical terms (capitalized mid-sentence words)
        """
        # Check for numbers/statistics
        numbers = len(re.findall(r'\b\d+(?:\.\d+)?%?\b', text))
        num_score = min(1.0, numbers / 10)

        # Check for definition patterns
        definitions = len(re.findall(
            r'\b(?:is|are|means|refers to|defined as|consists of)\b', text.lower()
        ))
        def_score = min(1.0, definitions / 5)

        # Check for technical terms (capitalized words not at start of sentence)
        tech_terms = len(re.findall(r'(?<=[.!?]\s)[a-z].*?\b[A-Z][a-z]+\b', text))
        tech_score = min(1.0, tech_terms / 10)

        # Check for lists
        list_markers = len(re.findall(r'(?:^|\n)\s*[\-\*\d+\.]\s', text))
        list_score = min(1.0, list_markers / 5)

        # Weighted average
        key_ratio = (
            num_score * 0.3 +
            def_score * 0.3 +
            tech_score * 0.2 +
            list_score * 0.2
        )

        return key_ratio

    def analyze_sync(self, text: str) -> DensityMetrics:
        """Analyze text density using heuristics (synchronous).

        Args:
            text: Text to analyze

        Returns:
            DensityMetrics with analysis results
        """
        if not text or not text.strip():
            return DensityMetrics(
                information_density=0.5,
                redundancy_score=0.0,
                key_point_ratio=0.0,
                suggested_compression=0.3,
            )

        words = self._tokenize_words(text)

        # Calculate metrics
        unique_ratio = self._calculate_unique_ratio(words)
        redundancy = self._calculate_repetition_score(words)
        avg_sentence_len = self._calculate_avg_sentence_length(text, words)
        key_ratio = self._estimate_key_point_ratio(text)

        # Information density combines unique terms and key points
        # Shorter sentences with many unique terms = high density
        length_factor = min(1.0, 25 / max(avg_sentence_len, 10))  # Shorter = denser
        info_density = (unique_ratio * 0.4 + key_ratio * 0.4 + length_factor * 0.2)

        # Calculate suggested compression based on density and redundancy
        # High density + low redundancy = lower compression (keep more)
        # Low density + high redundancy = higher compression (remove more)
        suggested = 0.3  # Base ratio
        suggested -= (info_density - 0.5) * 0.2  # Adjust for density
        suggested += (redundancy - 0.3) * 0.2  # Adjust for redundancy
        suggested = max(0.15, min(0.5, suggested))  # Clamp to range

        return DensityMetrics(
            information_density=info_density,
            redundancy_score=redundancy,
            key_point_ratio=key_ratio,
            suggested_compression=suggested,
            unique_terms_ratio=unique_ratio,
            avg_sentence_length=avg_sentence_len,
        )

    async def analyze(self, text: str) -> DensityMetrics:
        """Analyze text density (async version).

        Uses LLM for more accurate analysis if available,
        otherwise falls back to heuristic analysis.

        Args:
            text: Text to analyze

        Returns:
            DensityMetrics with analysis results
        """
        # First get heuristic metrics
        metrics = self.analyze_sync(text)

        # If no LLM client, return heuristic results
        if not self._llm_client:
            return metrics

        # Use LLM to refine key point ratio estimate
        try:
            prompt = f"""Analyze this text and estimate what percentage contains key information vs. filler/redundancy.
Consider: facts, definitions, conclusions, statistics, unique insights.

Text (first 1500 chars):
{text[:1500]}

Respond with ONLY a number between 0 and 100 representing the percentage of key information."""

            response = await self._llm_client.complete(
                prompt=prompt,
                system_prompt="You analyze text density. Respond only with a number.",
                max_tokens=10,
                temperature=0.1,
            )

            # Parse response
            try:
                match = re.search(r'(\d+(?:\.\d+)?)', response)
                if not match:
                    raise ValueError("No number found in response")
                llm_ratio = float(match.group(1)) / 100
                llm_ratio = max(0.0, min(1.0, llm_ratio))

                # Blend LLM estimate with heuristic (weight LLM higher)
                refined_key_ratio = llm_ratio * 0.7 + metrics.key_point_ratio * 0.3

                # Recalculate info density and suggested compression
                info_density = (
                    metrics.unique_terms_ratio * 0.3 +
                    refined_key_ratio * 0.5 +
                    min(1.0, 25 / max(metrics.avg_sentence_length, 10)) * 0.2
                )

                suggested = 0.3
                suggested -= (info_density - 0.5) * 0.2
                suggested += (metrics.redundancy_score - 0.3) * 0.2
                suggested = max(0.15, min(0.5, suggested))

                return DensityMetrics(
                    information_density=info_density,
                    redundancy_score=metrics.redundancy_score,
                    key_point_ratio=refined_key_ratio,
                    suggested_compression=suggested,
                    unique_terms_ratio=metrics.unique_terms_ratio,
                    avg_sentence_length=metrics.avg_sentence_length,
                )

            except (ValueError, AttributeError):
                logger.warning("Failed to parse LLM density response, using heuristics")
                return metrics

        except Exception as e:
            logger.warning(f"LLM density analysis failed, using heuristics: {e}")
            return metrics
