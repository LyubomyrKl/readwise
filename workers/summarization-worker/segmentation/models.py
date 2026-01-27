"""Data models for text segmentation."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Sentence:
    """Represents a sentence with its position in the original text."""
    text: str
    start_char: int
    end_char: int
    index: int


@dataclass
class Boundary:
    """Represents a segment boundary with metadata."""
    char_offset: int
    sentence_idx: int
    score: float
    level: Optional[str] = None
    title: Optional[str] = None
    keep: bool = False
