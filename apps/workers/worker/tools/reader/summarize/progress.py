#!/usr/bin/env python3
"""Progress bar utilities for summarization worker."""

import sys
from typing import Optional
from dataclasses import dataclass
from tqdm import tqdm


@dataclass
class ProgressStats:
    """Statistics tracked during summarization."""
    total_chunks: int = 0
    processed_chunks: int = 0
    total_sections: int = 0
    processed_sections: int = 0
    original_tokens: int = 0
    summary_tokens: int = 0
    current_section: str = ""
    current_subsection: str = ""


class SummarizationProgress:
    """Progress tracker for summarization with terminal progress bar."""

    def __init__(
        self,
        total_chunks: int = 0,
        total_sections: int = 0,
        book_title: str = "",
        summary_type: str = "extractive",
        disable: bool = False,
    ):
        self.stats = ProgressStats(
            total_chunks=total_chunks,
            total_sections=total_sections,
        )
        self.book_title = book_title
        self.summary_type = summary_type
        self.disable = disable
        self._pbar: Optional[tqdm] = None
        self._section_pbar: Optional[tqdm] = None

    def start(self):
        """Start the progress bars."""
        if self.disable:
            return

        # Main chunk progress bar
        desc = f"Summarizing"
        if self.book_title:
            # Truncate long titles
            title = self.book_title[:30] + "..." if len(self.book_title) > 30 else self.book_title
            desc = f"[{title}]"

        self._pbar = tqdm(
            total=self.stats.total_chunks,
            desc=desc,
            unit="chunk",
            bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]",
            file=sys.stderr,
            leave=True,
        )

    def update_chunk(
        self,
        section_title: str = "",
        subsection_title: str = "",
        original_tokens: int = 0,
        summary_tokens: int = 0,
    ):
        """Update progress after processing a chunk."""
        self.stats.processed_chunks += 1
        self.stats.original_tokens += original_tokens
        self.stats.summary_tokens += summary_tokens
        self.stats.current_section = section_title
        self.stats.current_subsection = subsection_title

        if self._pbar and not self.disable:
            # Update description with current section info
            if subsection_title:
                short_title = subsection_title[:25] + "..." if len(subsection_title) > 25 else subsection_title
                self._pbar.set_postfix_str(short_title, refresh=False)
            self._pbar.update(1)

    def update_section(self, section_title: str = ""):
        """Update progress after completing a section."""
        self.stats.processed_sections += 1
        self.stats.current_section = section_title

    def finish(self):
        """Finish progress tracking and show summary."""
        if self._pbar and not self.disable:
            self._pbar.close()

        if not self.disable:
            # Print summary statistics
            compression = (
                self.stats.summary_tokens / self.stats.original_tokens
                if self.stats.original_tokens > 0
                else 0
            )
            print(
                f"\n{'─' * 50}\n"
                f"Summarization complete!\n"
                f"  Sections: {self.stats.processed_sections}\n"
                f"  Chunks:   {self.stats.processed_chunks}\n"
                f"  Tokens:   {self.stats.original_tokens:,} → {self.stats.summary_tokens:,} "
                f"({compression:.1%} compression)\n"
                f"{'─' * 50}",
                file=sys.stderr,
            )

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, _exc_type, _exc_val, _exc_tb):
        self.finish()
        return False


def count_total_chunks(json_data: dict, chunker) -> int:
    """Pre-count total chunks for progress bar initialization."""
    total = 0
    for section in json_data.get('sections', []):
        for subsection in section.get('subsections', []):
            content = subsection.get('content', '')
            if content:
                chunks = chunker.chunk(content)
                total += len(chunks)
    return total
