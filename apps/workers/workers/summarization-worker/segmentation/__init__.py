"""Text segmentation package for breaking documents into chapters and subsections."""

from .models import Sentence, Boundary
from .segmenter import DeterministicSegmenter
from .ollama_client import OllamaClient

__all__ = [
    "DeterministicSegmenter",
    "Sentence",
    "Boundary",
    "OllamaClient",
]