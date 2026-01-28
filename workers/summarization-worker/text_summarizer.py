#!/usr/bin/env python3

import logging
from typing import Dict, Tuple, Optional
from datetime import datetime

from chunker import TextChunker
from llm_client import LLMClient
from progress import SummarizationProgress, count_total_chunks

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from shared.s3_storage import S3Storage

logger = logging.getLogger(__name__)


class TextSummarizer:
    """Orchestrates text summarization using chunking and LLM"""

    def __init__(self, s3_endpoint: str, s3_access_key: str, s3_secret_key: str,
                 ollama_base_url: str = "http://localhost:11434",
                 ollama_model: str = "qwen2.5:14b-instruct-q5_k_m"):
        self.s3 = S3Storage(s3_endpoint, s3_access_key, s3_secret_key)
        self.llm = LLMClient(ollama_base_url, ollama_model)

    def segment_and_summarize_json(self, json_data: Dict, summary_type: str = 'extractive',
                                   summary_percent: float = 0.3,
                                   target_tokens_per_chunk: int = 600,
                                   book_title: str = "",
                                   show_progress: bool = True) -> Tuple[Dict, Dict]:
        """
        Segment JSON subsections into chunks and summarize each.

        Args:
            json_data: Segmented JSON data with sections
            summary_type: 'extractive' or 'abstractive'
            summary_percent: Target summary length as percentage (0-1)
            target_tokens_per_chunk: Target tokens per chunk
            book_title: Book title for progress display
            show_progress: Whether to show progress bar

        Returns:
            Tuple of (result_json, metadata)
        """
        logger.info(f"Starting {summary_type} summarization with {target_tokens_per_chunk} token chunks")

        chunker = TextChunker(target_tokens=target_tokens_per_chunk)

        # Pre-count chunks for progress bar
        total_chunks = count_total_chunks(json_data, chunker)
        total_sections = len(json_data.get('sections', []))

        total_original_tokens = 0
        total_summary_tokens = 0
        processed_sections = []

        with SummarizationProgress(
            total_chunks=total_chunks,
            total_sections=total_sections,
            book_title=book_title,
            summary_type=summary_type,
            disable=not show_progress,
        ) as progress:
            for section in json_data.get('sections', []):
                processed_section = self._process_section(
                    section, chunker, summary_type, summary_percent, progress
                )

                # Accumulate token counts
                for subsection in processed_section.get('subsections', []):
                    for chunk in subsection.get('chunks', []):
                        total_original_tokens += chunk['original_tokens']
                        total_summary_tokens += chunk['summary_tokens']

                processed_sections.append(processed_section)
                progress.update_section(section.get('title', ''))

        compression_ratio = total_summary_tokens / total_original_tokens if total_original_tokens > 0 else 0

        metadata = {
            'summary_type': summary_type,
            'original_tokens': total_original_tokens,
            'summary_tokens': total_summary_tokens,
            'compression_ratio': compression_ratio,
            'target_percent': summary_percent,
            'target_tokens_per_chunk': target_tokens_per_chunk,
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Summarization complete: {total_original_tokens:,} → {total_summary_tokens:,} tokens ({compression_ratio:.1%})")

        return {'sections': processed_sections}, metadata

    def _process_section(self, section: Dict, chunker: TextChunker,
                         summary_type: str, summary_percent: float,
                         progress: Optional[SummarizationProgress] = None) -> Dict:
        """Process a single section and its subsections"""
        processed_section = {
            'id': section['id'],
            'title': section['title'],
            'level': section['level'],
            'start_char': section['start_char'],
            'end_char': section['end_char'],
            'content': section['content'],
            'subsections': []
        }

        section_title = section.get('title', '')

        for subsection in section.get('subsections', []):
            processed_subsection = self._process_subsection(
                subsection, chunker, summary_type, summary_percent,
                section_title=section_title, progress=progress
            )
            processed_section['subsections'].append(processed_subsection)

        return processed_section

    def _process_subsection(self, subsection: Dict, chunker: TextChunker,
                            summary_type: str, summary_percent: float,
                            section_title: str = "",
                            progress: Optional[SummarizationProgress] = None) -> Dict:
        """Process a single subsection - chunk and summarize"""
        chunks = chunker.chunk(subsection['content'])
        summarized_chunks = []
        subsection_title = subsection.get('title', '')

        for i, chunk_text in enumerate(chunks):
            original_tokens = self.llm.count_tokens(chunk_text)

            # Summarize based on type
            if summary_type.lower() == 'extractive':
                summary = self.llm.extractive_summarize(chunk_text, summary_percent)
            else:
                summary = self.llm.abstractive_summarize(chunk_text, summary_percent)

            summary_tokens = self.llm.count_tokens(summary)

            summarized_chunks.append({
                'chunk_id': f"{subsection['id']}_chunk_{i+1}",
                'content': summary,
                'original_tokens': original_tokens,
                'summary_tokens': summary_tokens
            })

            # Update progress
            if progress:
                progress.update_chunk(
                    section_title=section_title,
                    subsection_title=subsection_title,
                    original_tokens=original_tokens,
                    summary_tokens=summary_tokens,
                )

        return {
            'id': subsection['id'],
            'title': subsection['title'],
            'level': subsection['level'],
            'start_char': subsection['start_char'],
            'end_char': subsection['end_char'],
            'content': '\n\n'.join([c['content'] for c in summarized_chunks]),
            'chunks': summarized_chunks
        }

    def save_summary_to_s3(self, bucket: str, book_id: str, summary_json: str,
                           summary_type: str, metadata: Dict) -> str:
        """Save summary JSON to S3"""
        s3_key = f"summary/{book_id}_{summary_type}_summary.json"

        self.s3.upload_text(
            bucket=bucket,
            key=s3_key,
            content=summary_json,
            content_type='application/json',
            metadata={
                'book_id': book_id,
                'summary_type': summary_type,
                'original_tokens': str(metadata.get('original_tokens', 0)),
                'summary_tokens': str(metadata.get('summary_tokens', 0)),
                'compression_ratio': str(metadata.get('compression_ratio', 0))
            }
        )

        return s3_key