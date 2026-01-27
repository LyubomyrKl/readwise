"""Quality metrics for summary evaluation."""

import logging
import re
from collections import Counter
from typing import List, Optional, Set, Tuple

import tiktoken

from ..core.protocols import LLMClientProtocol

logger = logging.getLogger(__name__)

# Common stop words to exclude from key term extraction
STOP_WORDS: Set[str] = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    "with", "by", "from", "as", "is", "was", "are", "were", "been", "be", "have",
    "has", "had", "do", "does", "did", "will", "would", "could", "should", "may",
    "might", "must", "shall", "can", "need", "it", "its", "this", "that", "these",
    "those", "i", "you", "he", "she", "we", "they", "what", "which", "who", "whom",
}


class QualityMetrics:
    """Calculate summary quality metrics.

    Provides multiple metrics for evaluating summary quality:
    - Coverage: How well the summary covers key terms from the original
    - Coherence: How well the summary flows and reads
    - Factuality: Whether the summary maintains factual accuracy (requires LLM)
    """

    def __init__(
        self,
        llm_client: Optional[LLMClientProtocol] = None,
        tokenizer_encoding: str = "cl100k_base",
    ):
        """Initialize quality metrics calculator.

        Args:
            llm_client: Optional LLM client for factuality checking
            tokenizer_encoding: Tiktoken encoding name
        """
        self._llm_client = llm_client
        self._tokenizer = tiktoken.get_encoding(tokenizer_encoding)

    def _extract_key_terms(self, text: str, top_k: int = 20) -> List[str]:
        """Extract key terms from text.

        Args:
            text: Text to extract terms from
            top_k: Number of top terms to return

        Returns:
            List of key terms
        """
        # Tokenize and filter
        words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
        content_words = [w for w in words if w not in STOP_WORDS]

        # Count frequencies
        word_counts = Counter(content_words)

        # Return top-k most frequent
        return [word for word, _ in word_counts.most_common(top_k)]

    def _extract_numbers(self, text: str) -> Set[str]:
        """Extract numbers and statistics from text.

        Args:
            text: Text to extract numbers from

        Returns:
            Set of number strings
        """
        numbers = re.findall(r'\b\d+(?:\.\d+)?%?\b', text)
        return set(numbers)

    def coverage_score(
        self, summary: str, original: str, weight_numbers: bool = True
    ) -> Tuple[float, List[str]]:
        """Measure how well summary covers original content.

        Args:
            summary: Summary text
            original: Original text
            weight_numbers: Whether to weight number preservation higher

        Returns:
            Tuple of (score, list of missing key terms)
        """
        # Extract key terms from original
        original_terms = set(self._extract_key_terms(original, top_k=30))
        summary_terms = set(self._extract_key_terms(summary, top_k=50))

        # Calculate term coverage
        if not original_terms:
            return 1.0, []

        covered_terms = original_terms.intersection(summary_terms)
        missing_terms = original_terms - summary_terms
        term_coverage = len(covered_terms) / len(original_terms)

        # Check number preservation
        if weight_numbers:
            original_numbers = self._extract_numbers(original)
            summary_numbers = self._extract_numbers(summary)

            if original_numbers:
                number_coverage = len(
                    original_numbers.intersection(summary_numbers)
                ) / len(original_numbers)
                # Blend term and number coverage
                score = term_coverage * 0.7 + number_coverage * 0.3
            else:
                score = term_coverage
        else:
            score = term_coverage

        return score, list(missing_terms)[:10]

    def coherence_score(self, summary: str) -> Tuple[float, List[str]]:
        """Measure internal coherence of summary.

        Checks for:
        - Sentence structure quality
        - Transition word usage
        - Pronoun resolution issues (pronouns without clear referents)

        Args:
            summary: Summary text

        Returns:
            Tuple of (score, list of issues)
        """
        issues = []
        scores = []

        # Split into sentences
        sentences = re.split(r'[.!?]+', summary)
        sentences = [s.strip() for s in sentences if s.strip()]

        if not sentences:
            return 0.5, ["Empty summary"]

        # Check average sentence length
        avg_words = sum(len(s.split()) for s in sentences) / len(sentences)
        if avg_words < 5:
            issues.append("Sentences too short")
            scores.append(0.6)
        elif avg_words > 50:
            issues.append("Sentences too long")
            scores.append(0.7)
        else:
            scores.append(1.0)

        # Check for transition words (indicates flow)
        transition_words = [
            "however", "therefore", "furthermore", "moreover", "additionally",
            "consequently", "meanwhile", "nevertheless", "similarly", "likewise",
            "in addition", "as a result", "on the other hand", "in contrast",
        ]
        summary_lower = summary.lower()
        transition_count = sum(1 for t in transition_words if t in summary_lower)

        if len(sentences) > 3 and transition_count == 0:
            issues.append("Lacks transitions between ideas")
            scores.append(0.8)
        else:
            scores.append(1.0)

        # Check for dangling pronouns at start of sentences
        pronoun_starts = sum(
            1 for s in sentences
            if re.match(r'^(he|she|it|they|this|that|these|those)\b', s.lower())
        )
        if pronoun_starts > len(sentences) * 0.3:
            issues.append("Many sentences start with pronouns (unclear references)")
            scores.append(0.7)
        else:
            scores.append(1.0)

        # Check for repetition
        all_words = ' '.join(sentences).lower().split()
        word_counts = Counter(all_words)
        repeated = sum(1 for w, c in word_counts.items() if c > 3 and w not in STOP_WORDS)
        if repeated > 3:
            issues.append("Excessive word repetition")
            scores.append(0.75)
        else:
            scores.append(1.0)

        final_score = sum(scores) / len(scores)
        return final_score, issues

    async def factuality_score(
        self, summary: str, original: str
    ) -> Tuple[float, List[str]]:
        """Check factual accuracy using LLM.

        Args:
            summary: Summary text
            original: Original text

        Returns:
            Tuple of (score, list of factual issues)

        Raises:
            ValueError: If no LLM client is configured
        """
        if not self._llm_client:
            # Fall back to basic check
            return self._basic_factuality_check(summary, original)

        prompt = f"""Compare this summary against the original text for factual accuracy.

Original (first 2000 chars):
{original[:2000]}

Summary:
{summary}

List any factual errors, contradictions, or hallucinations. If the summary is factually accurate, respond with "ACCURATE".

Format: List each issue on a new line, or "ACCURATE" if none."""

        try:
            response = await self._llm_client.complete(
                prompt=prompt,
                system_prompt="You are a fact-checker. Identify factual errors in summaries.",
                max_tokens=300,
                temperature=0.1,
            )

            if "ACCURATE" in response.upper() and len(response) < 50:
                return 1.0, []

            # Parse issues from response
            issues = [
                line.strip() for line in response.split('\n')
                if line.strip() and not line.strip().startswith('#')
            ]
            issues = issues[:5]  # Limit to 5 issues

            # Score based on number of issues
            if len(issues) == 0:
                score = 1.0
            elif len(issues) == 1:
                score = 0.8
            elif len(issues) == 2:
                score = 0.6
            else:
                score = 0.4

            return score, issues

        except Exception as e:
            logger.warning(f"Factuality check failed: {e}")
            return self._basic_factuality_check(summary, original)

    def _basic_factuality_check(
        self, summary: str, original: str
    ) -> Tuple[float, List[str]]:
        """Basic factuality check without LLM.

        Checks that numbers in summary appear in original.

        Args:
            summary: Summary text
            original: Original text

        Returns:
            Tuple of (score, list of issues)
        """
        issues = []

        summary_numbers = self._extract_numbers(summary)
        original_numbers = self._extract_numbers(original)

        # Check for hallucinated numbers
        hallucinated = summary_numbers - original_numbers
        if hallucinated:
            issues.append(f"Numbers not in original: {', '.join(list(hallucinated)[:3])}")

        if issues:
            score = max(0.5, 1.0 - len(issues) * 0.2)
        else:
            score = 0.9  # Can't be fully confident without LLM

        return score, issues

    def calculate_overall_score(
        self,
        coverage: float,
        coherence: float,
        factuality: float,
        weights: Tuple[float, float, float] = (0.4, 0.3, 0.3),
    ) -> float:
        """Calculate weighted overall quality score.

        Args:
            coverage: Coverage score (0-1)
            coherence: Coherence score (0-1)
            factuality: Factuality score (0-1)
            weights: Weights for (coverage, coherence, factuality)

        Returns:
            Overall score (0-1)
        """
        return (
            coverage * weights[0] +
            coherence * weights[1] +
            factuality * weights[2]
        )
