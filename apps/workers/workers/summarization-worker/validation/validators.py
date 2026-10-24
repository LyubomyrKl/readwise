"""Summary validators for quality assessment."""

import logging
from typing import List, Optional

from core.models import Chunk, Summary, SummarizationContext, ValidationResult
from core.protocols import ValidatorProtocol, AsyncValidatorProtocol, LLMClientProtocol
from config.settings import SummarizationSettings
from .quality_metrics import QualityMetrics

logger = logging.getLogger(__name__)


class SummaryValidator(ValidatorProtocol, AsyncValidatorProtocol):
    """Validate summaries against quality criteria.

    Performs both synchronous (heuristic-based) and asynchronous (LLM-based)
    validation of summary quality.
    """

    def __init__(
        self,
        metrics: QualityMetrics,
        min_coverage: float = 0.7,
        min_coherence: float = 0.6,
        min_factuality: float = 0.7,
        min_overall: float = 0.65,
    ):
        """Initialize the validator.

        Args:
            metrics: Quality metrics calculator
            min_coverage: Minimum acceptable coverage score
            min_coherence: Minimum acceptable coherence score
            min_factuality: Minimum acceptable factuality score
            min_overall: Minimum acceptable overall score
        """
        self._metrics = metrics
        self.min_coverage = min_coverage
        self.min_coherence = min_coherence
        self.min_factuality = min_factuality
        self.min_overall = min_overall

    @classmethod
    def from_settings(
        cls,
        settings: SummarizationSettings,
        llm_client: Optional[LLMClientProtocol] = None,
    ) -> "SummaryValidator":
        """Create validator from settings."""
        metrics = QualityMetrics(
            llm_client=llm_client,
            tokenizer_encoding=settings.tokenizer_encoding,
        )

        return cls(
            metrics=metrics,
            min_coverage=settings.validation_min_coverage,
            min_coherence=settings.validation_min_coherence,
            min_overall=settings.validation_min_overall,
        )

    def validate(
        self,
        summary: Summary,
        original: Chunk,
        context: Optional[SummarizationContext] = None,
    ) -> ValidationResult:
        """Validate a summary synchronously (heuristic-based).

        Args:
            summary: Summary to validate
            original: Original chunk
            context: Optional summarization context

        Returns:
            ValidationResult with scores and issues
        """
        issues = []
        suggestions = []

        # Check coverage
        coverage_score, missing_terms = self._metrics.coverage_score(
            summary.content, original.content
        )
        if coverage_score < self.min_coverage:
            issues.append(f"Low coverage score: {coverage_score:.2f}")
            if missing_terms:
                suggestions.append(f"Consider including key terms: {', '.join(missing_terms[:5])}")

        # Check coherence
        coherence_score, coherence_issues = self._metrics.coherence_score(summary.content)
        if coherence_score < self.min_coherence:
            issues.append(f"Low coherence score: {coherence_score:.2f}")
            issues.extend(coherence_issues)
            suggestions.append("Improve sentence flow and transitions")

        # Basic factuality check (sync)
        factuality_score, fact_issues = self._metrics._basic_factuality_check(
            summary.content, original.content
        )
        if factuality_score < self.min_factuality:
            issues.append(f"Potential factuality issues: {factuality_score:.2f}")
            issues.extend(fact_issues)
            suggestions.append("Verify all facts against original text")

        # Calculate overall score
        overall = self._metrics.calculate_overall_score(
            coverage_score, coherence_score, factuality_score
        )

        is_valid = (
            coverage_score >= self.min_coverage and
            coherence_score >= self.min_coherence and
            overall >= self.min_overall
        )

        return ValidationResult(
            is_valid=is_valid,
            score=overall,
            coverage_score=coverage_score,
            coherence_score=coherence_score,
            factuality_score=factuality_score,
            issues=issues,
            suggestions=suggestions,
        )

    async def validate_async(
        self,
        summary: Summary,
        original: Chunk,
        context: Optional[SummarizationContext] = None,
    ) -> ValidationResult:
        """Validate a summary asynchronously (with LLM factuality check).

        Args:
            summary: Summary to validate
            original: Original chunk
            context: Optional summarization context

        Returns:
            ValidationResult with scores and issues
        """
        issues = []
        suggestions = []

        # Check coverage
        coverage_score, missing_terms = self._metrics.coverage_score(
            summary.content, original.content
        )
        if coverage_score < self.min_coverage:
            issues.append(f"Low coverage score: {coverage_score:.2f}")
            if missing_terms:
                suggestions.append(f"Consider including key terms: {', '.join(missing_terms[:5])}")

        # Check coherence
        coherence_score, coherence_issues = self._metrics.coherence_score(summary.content)
        if coherence_score < self.min_coherence:
            issues.append(f"Low coherence score: {coherence_score:.2f}")
            issues.extend(coherence_issues)
            suggestions.append("Improve sentence flow and transitions")

        # LLM factuality check
        factuality_score, fact_issues = await self._metrics.factuality_score(
            summary.content, original.content
        )
        if factuality_score < self.min_factuality:
            issues.append(f"Factuality issues detected: {factuality_score:.2f}")
            issues.extend(fact_issues)
            suggestions.append("Ensure factual accuracy matches original")

        # Calculate overall score
        overall = self._metrics.calculate_overall_score(
            coverage_score, coherence_score, factuality_score
        )

        is_valid = (
            coverage_score >= self.min_coverage and
            coherence_score >= self.min_coherence and
            factuality_score >= self.min_factuality and
            overall >= self.min_overall
        )

        return ValidationResult(
            is_valid=is_valid,
            score=overall,
            coverage_score=coverage_score,
            coherence_score=coherence_score,
            factuality_score=factuality_score,
            issues=issues,
            suggestions=suggestions,
        )

