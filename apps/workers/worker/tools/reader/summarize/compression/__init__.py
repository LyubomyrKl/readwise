"""Compression module with density analysis and adaptive compression."""

from .density_analyzer import DensityAnalyzer
from .adaptive_compressor import AdaptiveCompressor

__all__ = ["DensityAnalyzer", "AdaptiveCompressor"]
