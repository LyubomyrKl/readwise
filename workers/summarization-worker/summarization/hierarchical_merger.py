"""Hierarchical merging of summaries into section and document summaries."""

import logging
from typing import List, Optional, Dict, Any

import tiktoken

from core.models import Summary
from core.protocols import MergerProtocol, LLMClientProtocol
from config.settings import SummarizationSettings

logger = logging.getLogger(__name__)


MERGE_PROMPT_TEMPLATE = """Merge the following {level} summaries into a single cohesive summary.

Guidelines:
- Combine the key information from all summaries
- Remove redundant information
- Maintain logical flow and coherence
- Preserve important facts, numbers, and conclusions
- Target approximately {target_percent}% of the combined length

Summaries to merge:
{summaries_text}

Provide a merged summary that captures all essential information."""


DOCUMENT_SUMMARY_PROMPT = """Create a comprehensive document summary from these chapter summaries.

Guidelines:
- Provide a high-level overview of the entire document
- Highlight the main themes, arguments, and conclusions
- Maintain a logical narrative flow
- Include key facts and findings
- Target approximately {target_percent}% of the combined length

Chapter summaries:
{summaries_text}

Provide a cohesive document summary."""


class HierarchicalMerger(MergerProtocol):
    """Tree-like merging of chunk summaries into section and document summaries.

    Merging hierarchy:
    1. Chunks -> Subsection summary
    2. Subsections -> Chapter summary
    3. Chapters -> Document summary
    """

    def __init__(
        self,
        llm_client: LLMClientProtocol,
        max_merge_batch: int = 4,
        target_merge_ratio: float = 0.5,
        tokenizer_encoding: str = "cl100k_base",
    ):
        """Initialize the hierarchical merger.

        Args:
            llm_client: LLM client for merging
            max_merge_batch: Maximum summaries to merge at once
            target_merge_ratio: Target compression ratio per merge level
            tokenizer_encoding: Tiktoken encoding name
        """
        self._llm_client = llm_client
        self.max_merge_batch = max_merge_batch
        self.target_merge_ratio = target_merge_ratio
        self._tokenizer = tiktoken.get_encoding(tokenizer_encoding)

    @classmethod
    def from_settings(
        cls,
        llm_client: LLMClientProtocol,
        settings: SummarizationSettings,
    ) -> "HierarchicalMerger":
        """Create merger from settings."""
        return cls(
            llm_client=llm_client,
            max_merge_batch=settings.merge_max_batch,
            target_merge_ratio=settings.merge_target_ratio,
            tokenizer_encoding=settings.tokenizer_encoding,
        )

    def _count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        return len(self._tokenizer.encode(text))

    def _format_summaries_for_merge(self, summaries: List[Summary]) -> str:
        """Format summaries for the merge prompt.

        Args:
            summaries: Summaries to format

        Returns:
            Formatted text
        """
        parts = []
        for i, summary in enumerate(summaries, 1):
            parts.append(f"--- Summary {i} ---")
            parts.append(summary.content)
            parts.append("")
        return "\n".join(parts)

    def _collect_entities(self, summaries: List[Summary]) -> List[str]:
        """Collect unique entities from all summaries.

        Args:
            summaries: Summaries to collect from

        Returns:
            List of unique entity names
        """
        entities = set()
        for summary in summaries:
            entities.update(summary.entities)
        return list(entities)

    async def merge_summaries(
        self, summaries: List[Summary], level: str = "subsection"
    ) -> Summary:
        """Merge multiple summaries into one.

        Args:
            summaries: Summaries to merge
            level: Level of merge (chunk, subsection, chapter)

        Returns:
            Merged summary
        """
        if not summaries:
            raise ValueError("Cannot merge empty list of summaries")

        if len(summaries) == 1:
            return summaries[0]

        # If too many summaries, merge in batches first
        if len(summaries) > self.max_merge_batch:
            return await self._merge_in_batches(summaries, level)

        # Calculate totals
        total_tokens = sum(s.token_count for s in summaries)
        total_original = sum(s.original_tokens for s in summaries)
        combined_entities = self._collect_entities(summaries)

        # Format summaries for prompt
        summaries_text = self._format_summaries_for_merge(summaries)
        target_percent = int(self.target_merge_ratio * 100)

        # Generate merge prompt
        prompt = MERGE_PROMPT_TEMPLATE.format(
            level=level,
            target_percent=target_percent,
            summaries_text=summaries_text,
        )

        # Calculate max tokens for output
        max_tokens = int(total_tokens * self.target_merge_ratio * 1.5)
        max_tokens = max(200, min(2000, max_tokens))

        try:
            merged_content = await self._llm_client.complete(
                prompt=prompt,
                system_prompt=f"You are an expert at merging {level} summaries into cohesive text.",
                max_tokens=max_tokens,
                temperature=0.3,
            )

            merged_tokens = self._count_tokens(merged_content)
            compression = merged_tokens / total_original if total_original > 0 else 1.0

            # Generate merged ID from component IDs
            merged_id = f"merged_{level}_" + "_".join(s.chunk_id[:8] for s in summaries[:3])

            return Summary(
                chunk_id=merged_id,
                content=merged_content,
                token_count=merged_tokens,
                compression_ratio=compression,
                original_tokens=total_original,
                entities=combined_entities,
                quality_score=None,
                attempt_count=1,
                metadata={
                    "merge_level": level,
                    "source_count": len(summaries),
                    "source_tokens": total_tokens,
                    "source_ids": [s.chunk_id for s in summaries],
                },
            )

        except Exception as e:
            logger.error(f"Failed to merge {level} summaries: {e}")
            # Fallback: concatenate summaries
            fallback_content = "\n\n".join(s.content for s in summaries)
            fallback_tokens = self._count_tokens(fallback_content)

            return Summary(
                chunk_id=f"fallback_merged_{level}",
                content=fallback_content,
                token_count=fallback_tokens,
                compression_ratio=fallback_tokens / total_original if total_original > 0 else 1.0,
                original_tokens=total_original,
                entities=combined_entities,
                quality_score=0.5,
                metadata={"merge_failed": True, "error": str(e)},
            )

    async def _merge_in_batches(
        self, summaries: List[Summary], level: str
    ) -> Summary:
        """Merge summaries in batches when there are too many.

        Args:
            summaries: All summaries to merge
            level: Merge level

        Returns:
            Final merged summary
        """
        # Split into batches
        batches = [
            summaries[i:i + self.max_merge_batch]
            for i in range(0, len(summaries), self.max_merge_batch)
        ]

        # Merge each batch
        batch_results = []
        for batch in batches:
            merged = await self.merge_summaries(batch, level)
            batch_results.append(merged)

        # If still too many, recurse
        if len(batch_results) > 1:
            return await self.merge_summaries(batch_results, level)

        return batch_results[0]

    async def merge_chunks_to_subsection(
        self, chunk_summaries: List[Summary]
    ) -> Summary:
        """Merge chunk summaries into a subsection summary.

        Args:
            chunk_summaries: Summaries of chunks in a subsection

        Returns:
            Subsection summary
        """
        return await self.merge_summaries(chunk_summaries, "subsection")

    async def merge_subsections_to_chapter(
        self, subsection_summaries: List[Summary]
    ) -> Summary:
        """Merge subsection summaries into a chapter summary.

        Args:
            subsection_summaries: Summaries of subsections in a chapter

        Returns:
            Chapter summary
        """
        return await self.merge_summaries(subsection_summaries, "chapter")

    async def merge_chapters_to_document(
        self, chapter_summaries: List[Summary]
    ) -> Summary:
        """Merge chapter summaries into a document summary.

        Args:
            chapter_summaries: Summaries of all chapters

        Returns:
            Document summary
        """
        if not chapter_summaries:
            raise ValueError("Cannot create document summary from empty list")

        if len(chapter_summaries) == 1:
            # Just relabel as document summary
            chapter = chapter_summaries[0]
            return Summary(
                chunk_id="document_summary",
                content=chapter.content,
                token_count=chapter.token_count,
                compression_ratio=chapter.compression_ratio,
                original_tokens=chapter.original_tokens,
                entities=chapter.entities,
                quality_score=chapter.quality_score,
                metadata={**chapter.metadata, "is_document_summary": True},
            )

        # Calculate totals
        total_tokens = sum(s.token_count for s in chapter_summaries)
        total_original = sum(s.original_tokens for s in chapter_summaries)
        combined_entities = self._collect_entities(chapter_summaries)

        # Format chapter summaries
        summaries_text = self._format_summaries_for_merge(chapter_summaries)
        target_percent = int(self.target_merge_ratio * 100)

        prompt = DOCUMENT_SUMMARY_PROMPT.format(
            target_percent=target_percent,
            summaries_text=summaries_text,
        )

        max_tokens = int(total_tokens * self.target_merge_ratio * 1.5)
        max_tokens = max(300, min(3000, max_tokens))

        try:
            doc_content = await self._llm_client.complete(
                prompt=prompt,
                system_prompt="You are an expert at creating comprehensive document summaries.",
                max_tokens=max_tokens,
                temperature=0.3,
            )

            doc_tokens = self._count_tokens(doc_content)
            compression = doc_tokens / total_original if total_original > 0 else 1.0

            return Summary(
                chunk_id="document_summary",
                content=doc_content,
                token_count=doc_tokens,
                compression_ratio=compression,
                original_tokens=total_original,
                entities=combined_entities,
                quality_score=None,
                metadata={
                    "is_document_summary": True,
                    "chapter_count": len(chapter_summaries),
                    "source_tokens": total_tokens,
                },
            )

        except Exception as e:
            logger.error(f"Failed to create document summary: {e}")
            # Fallback
            fallback = "\n\n".join(
                f"## {s.metadata.get('title', f'Chapter {i+1}')}\n{s.content}"
                for i, s in enumerate(chapter_summaries)
            )

            return Summary(
                chunk_id="document_summary",
                content=fallback,
                token_count=self._count_tokens(fallback),
                compression_ratio=1.0,
                original_tokens=total_original,
                entities=combined_entities,
                quality_score=0.5,
                metadata={"is_document_summary": True, "merge_failed": True},
            )

    async def build_hierarchy(
        self,
        structure: Dict[str, Any],
        chunk_summaries: Dict[str, Summary],
    ) -> Dict[str, Any]:
        """Build complete summary hierarchy from document structure.

        Args:
            structure: Document structure with chapters/subsections
            chunk_summaries: Map of chunk_id -> Summary

        Returns:
            Enhanced structure with merged summaries at each level
        """
        result = {"sections": [], "document_summary": None}
        chapter_summaries = []

        for section in structure.get("sections", []):
            section_result = {
                "id": section.get("id"),
                "title": section.get("title"),
                "level": section.get("level"),
                "subsections": [],
                "summary": None,
            }

            subsection_summaries = []

            for subsection in section.get("subsections", []):
                # Get chunk summaries for this subsection
                chunk_ids = subsection.get("chunk_ids", [])
                sub_chunks = [
                    chunk_summaries[cid]
                    for cid in chunk_ids
                    if cid in chunk_summaries
                ]

                # Merge chunks to subsection
                if sub_chunks:
                    sub_summary = await self.merge_chunks_to_subsection(sub_chunks)
                    sub_summary.metadata["title"] = subsection.get("title", "")
                    subsection_summaries.append(sub_summary)

                    section_result["subsections"].append({
                        "id": subsection.get("id"),
                        "title": subsection.get("title"),
                        "summary": sub_summary,
                    })

            # Merge subsections to chapter
            if subsection_summaries:
                chapter_summary = await self.merge_subsections_to_chapter(subsection_summaries)
                chapter_summary.metadata["title"] = section.get("title", "")
                section_result["summary"] = chapter_summary
                chapter_summaries.append(chapter_summary)

            result["sections"].append(section_result)

        # Merge chapters to document
        if chapter_summaries:
            result["document_summary"] = await self.merge_chapters_to_document(
                chapter_summaries
            )

        return result
