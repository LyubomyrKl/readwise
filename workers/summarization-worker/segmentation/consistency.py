f"""Consistency solver for boundary validation."""

from typing import List
import tiktoken

from .models import Boundary
from .ollama_client import OllamaClient
from .llm_verifier import generate_title


def solve_consistency(
    boundaries: List[Boundary],
    text: str,
    ollama_client: OllamaClient,
    min_chapter_tokens: int = 1500,
    min_subsection_tokens: int = 400,
    max_sequential_subsections: int = 6,
    tokenizer: tiktoken.Encoding = None
) -> List[Boundary]:
    """Apply consistency rules and length constraints."""
    if not boundaries:
        return []

    if tokenizer is None:
        tokenizer = tiktoken.get_encoding("cl100k_base")

    # Ensure first kept boundary is a chapter
    if boundaries and boundaries[0].level != "chapter":
        boundaries[0].level = "chapter"

    final_boundaries = []
    subsection_count = 0

    for i, boundary in enumerate(boundaries):
        start_offset = boundary.char_offset
        end_offset = boundaries[i + 1].char_offset if i + 1 < len(boundaries) else len(text)
        segment_text = text[start_offset:end_offset]
        token_count = len(tokenizer.encode(segment_text))

        # Enforce minimum lengths
        if boundary.level == "chapter" and token_count < min_chapter_tokens:
            if i + 1 < len(boundaries) and boundaries[i + 1].level == "subsection":
                continue

        elif boundary.level == "subsection" and token_count < min_subsection_tokens:
            continue

        # Cap sequential subsections
        if boundary.level == "chapter":
            subsection_count = 0
        elif boundary.level == "subsection":
            subsection_count += 1
            if subsection_count > max_sequential_subsections:
                subsection_count -= 1
                continue

        # Fix missing titles
        if not boundary.title or len(boundary.title.strip()) == 0:
            boundary.title = generate_title(segment_text, ollama_client, tokenizer)

        final_boundaries.append(boundary)

    return final_boundaries