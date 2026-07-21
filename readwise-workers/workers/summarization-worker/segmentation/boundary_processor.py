"""Boundary processing utilities for text segmentation."""

from typing import List
import tiktoken

from .models import Sentence, Boundary


def map_peaks_to_boundaries(
    peak_indices: List[int],
    sentences: List[Sentence],
    window_size: int
) -> List[Boundary]:
    """Map peak indices to sentence boundaries."""
    boundaries = []

    for peak_idx in peak_indices:
        sentence_idx = peak_idx + window_size
        if sentence_idx < len(sentences):
            sentence = sentences[sentence_idx]
            boundary = Boundary(
                char_offset=sentence.start_char,
                sentence_idx=sentence_idx,
                score=0.0
            )
            boundaries.append(boundary)

    return boundaries


def merge_close_boundaries(
    boundaries: List[Boundary],
    merge_distance: int = 200
) -> List[Boundary]:
    """Merge candidates within merge_distance chars, keep strongest."""
    if not boundaries:
        return []

    boundaries.sort(key=lambda b: b.char_offset)

    merged = []
    i = 0
    while i < len(boundaries):
        current = boundaries[i]
        group = [current]

        j = i + 1
        while j < len(boundaries) and boundaries[j].char_offset - current.char_offset <= merge_distance:
            group.append(boundaries[j])
            j += 1

        strongest = max(group, key=lambda b: b.score)
        merged.append(strongest)

        i = j

    return merged


def enforce_min_token_gap(
    boundaries: List[Boundary],
    text: str,
    min_token_gap: int = 400,
    tokenizer: tiktoken.Encoding = None
) -> List[Boundary]:
    """Enforce minimum token gap between boundaries."""
    if not boundaries:
        return []

    if tokenizer is None:
        tokenizer = tiktoken.get_encoding("cl100k_base")

    filtered = []
    last_offset = -1

    for boundary in boundaries:
        if last_offset == -1:
            filtered.append(boundary)
            last_offset = boundary.char_offset
        else:
            segment_text = text[last_offset:boundary.char_offset]
            token_count = len(tokenizer.encode(segment_text))

            if token_count >= min_token_gap:
                filtered.append(boundary)
                last_offset = boundary.char_offset

    return filtered