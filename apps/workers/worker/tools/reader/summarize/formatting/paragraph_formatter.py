"""Paragraph formatting for summaries."""

import re
import logging
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ParagraphConfig:
    """Configuration for paragraph formatting."""
    min_sentences_per_paragraph: int = 2
    max_sentences_per_paragraph: int = 5
    min_paragraph_length: int = 100  # characters
    sentence_endings: str = r'[.!?]'
    preserve_existing_paragraphs: bool = True


class ParagraphFormatter:
    """Format text into well-structured paragraphs.

    Handles:
    - Ensuring proper paragraph separation (double newlines)
    - Splitting long text into logical paragraphs
    - Cleaning up formatting inconsistencies
    - Preserving intentional paragraph breaks
    """

    def __init__(self, config: Optional[ParagraphConfig] = None):
        """Initialize the formatter.

        Args:
            config: Paragraph configuration options
        """
        self.config = config or ParagraphConfig()

    def format(self, text: str) -> str:
        """Format text into paragraphs.

        Args:
            text: Raw text to format

        Returns:
            Formatted text with proper paragraphs
        """
        if not text or not text.strip():
            return text

        # Step 1: Normalize whitespace and line endings
        text = self._normalize_whitespace(text)

        # Step 2: Check if already has paragraphs
        if self.config.preserve_existing_paragraphs and self._has_paragraphs(text):
            # Just clean up existing paragraph formatting
            return self._clean_paragraph_formatting(text)

        # Step 3: Split into paragraphs if needed
        return self._create_paragraphs(text)

    def _normalize_whitespace(self, text: str) -> str:
        """Normalize whitespace in text.

        Args:
            text: Text to normalize

        Returns:
            Normalized text
        """
        # Replace various line ending styles
        text = text.replace('\r\n', '\n').replace('\r', '\n')

        # Normalize multiple spaces to single space (but preserve newlines)
        text = re.sub(r'[ \t]+', ' ', text)

        # Remove trailing whitespace from lines
        text = re.sub(r' +\n', '\n', text)

        # Ensure space after sentence-ending punctuation followed by a capitalised word
        # This fixes cases like "word.Another" -> "word. Another" and leaves "3.5%",
        # "1,250,000", "10:30", "example.com" and "didn't" alone
        text = re.sub(r'([.!?])([A-Z][a-z])', r'\1 \2', text)

        return text.strip()

    def _has_paragraphs(self, text: str) -> bool:
        """Check if text already has paragraph structure.

        Args:
            text: Text to check

        Returns:
            True if text has multiple paragraphs
        """
        # Look for double newlines (paragraph breaks)
        paragraphs = re.split(r'\n\s*\n', text)
        return len(paragraphs) > 1

    def _clean_paragraph_formatting(self, text: str) -> str:
        """Clean up existing paragraph formatting.

        Args:
            text: Text with paragraphs

        Returns:
            Cleaned text
        """
        # Split into paragraphs
        paragraphs = re.split(r'\n\s*\n', text)

        # Clean each paragraph
        cleaned = []
        for para in paragraphs:
            para = para.strip()
            if para:
                # Ensure single line within paragraph (unless it's a list)
                if not self._is_list_paragraph(para):
                    para = re.sub(r'\n+', ' ', para)
                cleaned.append(para)

        # Rejoin with proper paragraph separators
        return '\n\n'.join(cleaned)

    def _is_list_paragraph(self, text: str) -> bool:
        """Check if paragraph is a list.

        Args:
            text: Paragraph text

        Returns:
            True if text appears to be a list
        """
        lines = text.split('\n')
        if len(lines) < 2:
            return False

        # Check if most lines start with list markers
        list_pattern = r'^\s*[-•*]|\d+[.)]\s'
        list_lines = sum(1 for line in lines if re.match(list_pattern, line))

        return list_lines / len(lines) > 0.5

    def _create_paragraphs(self, text: str) -> str:
        """Create paragraphs from continuous text.

        Args:
            text: Continuous text without paragraphs

        Returns:
            Text formatted into paragraphs
        """
        # If text is short, keep as single paragraph
        if len(text) < self.config.min_paragraph_length * 2:
            return text

        # Split into sentences
        sentences = self._split_into_sentences(text)

        if len(sentences) <= self.config.max_sentences_per_paragraph:
            return text

        # Group sentences into paragraphs
        paragraphs = []
        current_para = []

        for sentence in sentences:
            current_para.append(sentence)

            # Check if we should start a new paragraph
            if len(current_para) >= self.config.min_sentences_per_paragraph:
                para_text = ' '.join(current_para)

                # Start new paragraph if we have enough sentences or content
                if (len(current_para) >= self.config.max_sentences_per_paragraph or
                    len(para_text) >= self.config.min_paragraph_length * 2):
                    paragraphs.append(para_text)
                    current_para = []

        # Add remaining sentences
        if current_para:
            if paragraphs and len(current_para) < self.config.min_sentences_per_paragraph:
                # Append to last paragraph if too few sentences
                paragraphs[-1] += ' ' + ' '.join(current_para)
            else:
                paragraphs.append(' '.join(current_para))

        return '\n\n'.join(paragraphs)

    def _split_into_sentences(self, text: str) -> list:
        """Split text into sentences.

        Args:
            text: Text to split

        Returns:
            List of sentences
        """
        # Pattern for sentence boundaries
        # Handles: period, exclamation, question mark
        # Avoids: abbreviations, decimals, titles (Mr., Dr., etc.)
        pattern = r'(?<=[.!?])\s+(?=[A-Z])'

        sentences = re.split(pattern, text)

        # Clean up sentences
        sentences = [s.strip() for s in sentences if s.strip()]

        return sentences

    def format_summary(self, summary_content: str, target_paragraphs: int = 0) -> str:
        """Format a summary with intelligent paragraph breaks.

        This method is optimized for summary content, considering:
        - Topic transitions
        - Logical groupings
        - Readability

        Args:
            summary_content: Summary text to format
            target_paragraphs: Desired number of paragraphs (0 = auto)

        Returns:
            Formatted summary with paragraphs
        """
        if not summary_content or not summary_content.strip():
            return summary_content

        # First, apply basic formatting
        formatted = self.format(summary_content)

        # If target specified and not met, try to adjust
        if target_paragraphs > 0:
            paragraphs = formatted.split('\n\n')
            current_count = len(paragraphs)

            if current_count < target_paragraphs:
                # Need to split more
                formatted = self._split_to_target(formatted, target_paragraphs)
            elif current_count > target_paragraphs:
                # Need to merge
                formatted = self._merge_to_target(paragraphs, target_paragraphs)

        return formatted

    def _split_to_target(self, text: str, target: int) -> str:
        """Split text to reach target paragraph count.

        Args:
            text: Text to split
            target: Target number of paragraphs

        Returns:
            Text with more paragraphs
        """
        paragraphs = text.split('\n\n')

        while len(paragraphs) < target:
            # Find the longest paragraph to split
            longest_idx = max(range(len(paragraphs)), key=lambda i: len(paragraphs[i]))
            longest = paragraphs[longest_idx]

            # Try to split at a sentence boundary near the middle
            sentences = self._split_into_sentences(longest)
            if len(sentences) < 2:
                break

            mid = len(sentences) // 2
            first_half = ' '.join(sentences[:mid])
            second_half = ' '.join(sentences[mid:])

            paragraphs[longest_idx] = first_half
            paragraphs.insert(longest_idx + 1, second_half)

        return '\n\n'.join(paragraphs)

    def _merge_to_target(self, paragraphs: list, target: int) -> str:
        """Merge paragraphs to reach target count.

        Args:
            paragraphs: List of paragraphs
            target: Target number of paragraphs

        Returns:
            Text with fewer paragraphs
        """
        while len(paragraphs) > target:
            # Find the two shortest adjacent paragraphs to merge
            min_combined = float('inf')
            merge_idx = 0

            for i in range(len(paragraphs) - 1):
                combined_len = len(paragraphs[i]) + len(paragraphs[i + 1])
                if combined_len < min_combined:
                    min_combined = combined_len
                    merge_idx = i

            # Merge the paragraphs
            merged = paragraphs[merge_idx] + ' ' + paragraphs[merge_idx + 1]
            paragraphs[merge_idx] = merged
            paragraphs.pop(merge_idx + 1)

        return '\n\n'.join(paragraphs)


def format_as_paragraphs(
    text: str,
    min_sentences: int = 2,
    max_sentences: int = 5,
    preserve_existing: bool = True,
) -> str:
    """Convenience function to format text as paragraphs.

    Args:
        text: Text to format
        min_sentences: Minimum sentences per paragraph
        max_sentences: Maximum sentences per paragraph
        preserve_existing: Keep existing paragraph structure if present

    Returns:
        Formatted text with paragraphs
    """
    config = ParagraphConfig(
        min_sentences_per_paragraph=min_sentences,
        max_sentences_per_paragraph=max_sentences,
        preserve_existing_paragraphs=preserve_existing,
    )
    formatter = ParagraphFormatter(config)
    return formatter.format(text)
