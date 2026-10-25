"""Validation loop for summary regeneration on quality failure."""

import logging
from typing import Optional, List, Tuple

from worker.tools.reader.summarize.core.models import Chunk, Summary, SummarizationContext, ValidationResult
from worker.tools.reader.summarize.core.protocols import SummarizerProtocol
from worker.tools.reader.summarize.core.exceptions import ValidationError
from worker.tools.reader.summarize.config.settings import SummarizationSettings
from .validators import SummaryValidator

logger = logging.getLogger(__name__)


class ValidationLoop:
    """Regenerate summaries that fail validation.

    Implements a retry loop with:
    1. Initial summarization attempt
    2. Validation check
    3. Retry with adjusted parameters if validation fails
    4. Return best attempt if max retries exceeded
    """

    def __init__(
        self,
        summarizer: SummarizerProtocol,
        validator: SummaryValidator,
        max_attempts: int = 3,
        improvement_threshold: float = 0.1,
        use_async_validation: bool = True,
    ):
        """Initialize the validation loop.

        Args:
            summarizer: Summarizer to use for generation
            validator: Validator for quality assessment
            max_attempts: Maximum summarization attempts
            improvement_threshold: Minimum score improvement to continue retrying
            use_async_validation: Whether to use async validation (with LLM)
        """
        self._summarizer = summarizer
        self._validator = validator
        self.max_attempts = max_attempts
        self.improvement_threshold = improvement_threshold
        self.use_async_validation = use_async_validation

    @classmethod
    def from_settings(
        cls,
        summarizer: SummarizerProtocol,
        validator: SummaryValidator,
        settings: SummarizationSettings,
    ) -> "ValidationLoop":
        """Create validation loop from settings."""
        return cls(
            summarizer=summarizer,
            validator=validator,
            max_attempts=settings.validation_max_attempts,
            improvement_threshold=settings.validation_improvement_threshold,
        )

    def _adjust_ratio_for_retry(
        self,
        attempt: int,
        current_ratio: float,
        validation_result: ValidationResult,
    ) -> float:
        """Adjust compression ratio based on validation feedback.

        Args:
            attempt: Current attempt number
            current_ratio: Current compression ratio
            validation_result: Result from previous validation

        Returns:
            Adjusted compression ratio
        """
        # If coverage is low, increase ratio (keep more content)
        if validation_result.coverage_score < 0.7:
            return min(0.6, current_ratio * 1.2)

        # If coherence is low, try slightly different ratio
        if validation_result.coherence_score < 0.6:
            # Small adjustment to get different output
            return current_ratio * (1.0 + 0.05 * attempt)

        return current_ratio

    async def _validate(
        self,
        summary: Summary,
        original: Chunk,
        context: Optional[SummarizationContext],
    ) -> ValidationResult:
        """Run validation (async or sync based on configuration).

        Args:
            summary: Summary to validate
            original: Original chunk
            context: Summarization context

        Returns:
            Validation result
        """
        if self.use_async_validation:
            return await self._validator.validate_async(summary, original, context)
        else:
            return self._validator.validate(summary, original, context)

    async def summarize_with_validation(
        self,
        chunk: Chunk,
        context: Optional[SummarizationContext] = None,
        target_ratio: float = 0.3,
    ) -> Summary:
        """Summarize with validation and retry loop.

        Args:
            chunk: Chunk to summarize
            context: Optional summarization context
            target_ratio: Initial target compression ratio

        Returns:
            Best summary (may not pass validation if all attempts fail)
        """
        attempts: List[Tuple[Summary, ValidationResult]] = []
        current_ratio = target_ratio

        for attempt in range(self.max_attempts):
            # Generate summary
            summary = await self._summarizer.summarize(
                chunk, context, target_ratio=current_ratio
            )
            summary.attempt_count = attempt + 1

            # Validate
            validation_result = await self._validate(summary, chunk, context)
            attempts.append((summary, validation_result))

            # Update summary quality score
            summary.quality_score = validation_result.score

            # Check if valid
            if validation_result.is_valid:
                logger.debug(
                    f"Chunk {chunk.id} passed validation on attempt {attempt + 1} "
                    f"(score: {validation_result.score:.2f})"
                )
                return summary

            # Check for improvement
            if attempt > 0:
                prev_score = attempts[-2][1].score
                if validation_result.score - prev_score < self.improvement_threshold:
                    logger.debug(
                        f"Chunk {chunk.id}: No significant improvement "
                        f"({prev_score:.2f} -> {validation_result.score:.2f}), stopping"
                    )
                    break

            # Log retry
            logger.debug(
                f"Chunk {chunk.id} failed validation (attempt {attempt + 1}/{self.max_attempts}, "
                f"score: {validation_result.score:.2f}). Issues: {validation_result.issues}"
            )

            # Adjust ratio for next attempt
            if attempt < self.max_attempts - 1:
                current_ratio = self._adjust_ratio_for_retry(
                    attempt + 1, current_ratio, validation_result
                )

        # Return best attempt
        best_summary, best_result = max(attempts, key=lambda x: x[1].score)
        best_summary.metadata["validation_passed"] = False
        best_summary.metadata["best_of_attempts"] = len(attempts)
        best_summary.metadata["final_issues"] = best_result.issues

        logger.warning(
            f"Chunk {chunk.id}: All {len(attempts)} attempts failed validation. "
            f"Returning best attempt (score: {best_result.score:.2f})"
        )

        return best_summary

    async def summarize_batch_with_validation(
        self,
        chunks: List[Chunk],
        context: Optional[SummarizationContext] = None,
        target_ratio: float = 0.3,
    ) -> List[Summary]:
        """Summarize multiple chunks with validation.

        Note: Chunks are processed sequentially to maintain context continuity.

        Args:
            chunks: Chunks to summarize
            context: Optional summarization context
            target_ratio: Target compression ratio

        Returns:
            List of summaries
        """
        summaries = []

        for chunk in chunks:
            summary = await self.summarize_with_validation(
                chunk, context, target_ratio
            )
            summaries.append(summary)

        return summaries

    def get_statistics(
        self, summaries: List[Summary]
    ) -> dict:
        """Get validation statistics for a batch of summaries.

        Args:
            summaries: List of summaries to analyze

        Returns:
            Dictionary with validation statistics
        """
        if not summaries:
            return {
                "total": 0,
                "passed_first_attempt": 0,
                "passed_after_retry": 0,
                "failed": 0,
                "avg_attempts": 0.0,
                "avg_quality_score": 0.0,
            }

        passed_first = sum(1 for s in summaries if s.attempt_count == 1 and s.quality_score and s.quality_score >= 0.65)
        passed_retry = sum(1 for s in summaries if s.attempt_count > 1 and not s.metadata.get("validation_passed") is False)
        failed = sum(1 for s in summaries if s.metadata.get("validation_passed") is False)
        avg_attempts = sum(s.attempt_count for s in summaries) / len(summaries)
        avg_score = sum(s.quality_score or 0 for s in summaries) / len(summaries)

        return {
            "total": len(summaries),
            "passed_first_attempt": passed_first,
            "passed_after_retry": passed_retry,
            "failed": failed,
            "avg_attempts": avg_attempts,
            "avg_quality_score": avg_score,
        }
