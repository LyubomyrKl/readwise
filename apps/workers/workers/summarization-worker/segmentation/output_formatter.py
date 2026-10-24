"""Output formatting utilities for segmentation results."""

import hashlib
from typing import List, Dict
import tiktoken

from .models import Boundary
from .ollama_client import OllamaClient
from .llm_verifier import generate_title


def generate_id(char_offset: int, level: str) -> str:
    """Generate stable ID using md5 of position."""
    pos_hash = hashlib.md5(str(char_offset).encode()).hexdigest()[:8]
    prefix = "ch" if level == "chapter" else "sub"
    return f"{prefix}-{pos_hash}"


def insert_tags(text: str, boundaries: List[Boundary]) -> str:
    """Insert tags at boundary positions (right-to-left)."""
    boundaries.sort(key=lambda b: b.char_offset, reverse=True)

    result_text = text

    for boundary in boundaries:
        boundary_id = generate_id(boundary.char_offset, boundary.level)

        if boundary.level == "chapter":
            tag = f'<<<CHAPTER id="{boundary_id}" title="{boundary.title}">>>\n\n'
        else:
            tag = f'<<<Subsection id="{boundary_id}" title="{boundary.title}">>>\n\n'

        result_text = result_text[:boundary.char_offset] + tag + result_text[boundary.char_offset:]

    return result_text


def boundaries_to_json(
    text: str,
    boundaries: List[Boundary],
    ollama_client: OllamaClient,
    tokenizer: tiktoken.Encoding = None
) -> Dict:
    """Convert boundaries to structured JSON format."""
    if tokenizer is None:
        tokenizer = tiktoken.get_encoding("cl100k_base")

    if not boundaries:
        return {
            "sections": [{
                "id": "ch-" + hashlib.md5("0".encode()).hexdigest()[:8],
                "title": "Complete Text",
                "level": "chapter",
                "start_char": 0,
                "end_char": len(text),
                "content": text,
                "subsections": []
            }]
        }

    boundaries.sort(key=lambda b: b.char_offset)

    sections = []
    current_chapter = None

    # Add implicit first section if first boundary is not at start
    if boundaries[0].char_offset > 0:
        first_boundary = Boundary(
            char_offset=0,
            sentence_idx=0,
            score=0.0,
            level="chapter",
            title=generate_title(text[:min(1000, len(text))], ollama_client, tokenizer),
            keep=True
        )
        boundaries.insert(0, first_boundary)

    for i, boundary in enumerate(boundaries):
        start_pos = boundary.char_offset
        end_pos = boundaries[i + 1].char_offset if i + 1 < len(boundaries) else len(text)
        content = text[start_pos:end_pos].strip()

        boundary_id = generate_id(boundary.char_offset, boundary.level)

        section_obj = {
            "id": boundary_id,
            "title": boundary.title or "Untitled Section",
            "level": boundary.level,
            "start_char": start_pos,
            "end_char": end_pos,
            "content": content
        }

        if boundary.level == "chapter":
            section_obj["subsections"] = []
            sections.append(section_obj)
            current_chapter = section_obj
        elif boundary.level == "subsection" and current_chapter is not None:
            current_chapter["subsections"].append(section_obj)
        else:
            section_obj["level"] = "chapter"
            section_obj["subsections"] = []
            sections.append(section_obj)
            current_chapter = section_obj

    return {"sections": sections}