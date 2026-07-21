"""Parser for existing segment tags."""

import re
from typing import List

from .models import Boundary


def parse_existing_segments(segmented_text: str) -> List[Boundary]:
    """Parse existing segment tags and adjust offsets for clean text."""
    boundaries = []
    offset_adjustment = 0

    combined_pattern = r'<<<(CHAPTER|Subsection) id="([^"]*)" title="([^"]*)">>>\n\n'

    for match in re.finditer(combined_pattern, segmented_text):
        tag_type = "chapter" if match.group(1) == "CHAPTER" else "subsection"
        title = match.group(3)

        clean_offset = match.start() - offset_adjustment

        boundaries.append(Boundary(
            char_offset=clean_offset,
            sentence_idx=0,
            score=0.8 if tag_type == "chapter" else 0.6,
            level=tag_type,
            title=title,
            keep=True
        ))

        tag_length = len(match.group(0))
        offset_adjustment += tag_length

    boundaries.sort(key=lambda b: b.char_offset)

    return boundaries


def remove_segment_tags(segmented_text: str) -> str:
    """Remove all segment tags to get clean text."""
    text = re.sub(r'<<<CHAPTER id="[^"]*" title="[^"]*">>>\n\n', '', segmented_text)
    text = re.sub(r'<<<Subsection id="[^"]*" title="[^"]*">>>\n\n', '', text)
    return text


def has_segment_tags(text: str) -> bool:
    """Check if text contains segment tags."""
    return '<<<CHAPTER id=' in text or '<<<Subsection id=' in text