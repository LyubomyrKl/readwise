"""Main DeterministicSegmenter class that orchestrates text segmentation."""

import os
from typing import Dict, List
import tiktoken

from .models import Boundary
from .ollama_client import OllamaClient
from .sentence_processor import split_into_sentences, create_windows
from .topic_detection import compute_topic_shift_scores, find_peaks_zscore
from .boundary_processor import (
    map_peaks_to_boundaries,
    merge_close_boundaries,
    enforce_min_token_gap
)
from .llm_verifier import verify_boundary
from .consistency import solve_consistency
from .output_formatter import insert_tags, boundaries_to_json
from .tag_parser import has_segment_tags, parse_existing_segments, remove_segment_tags


class DeterministicSegmenter:
    """Two-pass deterministic text segmenter using embeddings and LLM verification."""

    def __init__(
        self,
        ollama_base_url: str = None,
        llm_model: str = None,
        embed_model: str = None
    ):
        # Use environment variables as defaults
        if ollama_base_url is None:
            ollama_base_url = os.environ['OLLAMA_BASE_URL']
        if llm_model is None:
            llm_model = os.environ['OLLAMA_MODEL']
        if embed_model is None:
            embed_model = os.environ['OLLAMA_EMBED_MODEL']

        self.ollama_client = OllamaClient(
            base_url=ollama_base_url,
            llm_model=llm_model,
            embed_model=embed_model
        )
        self.tokenizer = tiktoken.get_encoding("cl100k_base")

        # Algorithm parameters
        self.window_size = 6
        self.z_window = 21
        self.z_threshold = 2.5
        self.merge_distance = 200
        self.min_token_gap = 400
        self.min_chapter_tokens = 1500
        self.min_subsection_tokens = 400
        self.max_sequential_subsections = 6

    def _run_pass1_detection(self, text: str) -> List[Boundary]:
        """Pass 1: Embedding-based topic shift detection."""
        sentences = split_into_sentences(text)
        if len(sentences) < self.window_size + 1:
            return []

        windows = create_windows(sentences, self.window_size)
        embeddings = [self.ollama_client.get_embedding(w) for w in windows]

        topic_scores = compute_topic_shift_scores(embeddings)
        peak_indices = find_peaks_zscore(topic_scores, self.z_window, self.z_threshold)

        boundaries = map_peaks_to_boundaries(peak_indices, sentences, self.window_size)
        boundaries = merge_close_boundaries(boundaries, self.merge_distance)
        boundaries = enforce_min_token_gap(
            boundaries, text, self.min_token_gap, self.tokenizer
        )

        return boundaries, sentences

    def _run_pass2_verification(
        self,
        boundaries: List[Boundary],
        sentences,
        text: str
    ) -> List[Boundary]:
        """Pass 2: LLM verification and consistency solving."""
        verified_boundaries = []
        for boundary in boundaries:
            verified = verify_boundary(
                boundary, sentences, text, self.ollama_client
            )
            if verified.keep:
                verified_boundaries.append(verified)

        final_boundaries = solve_consistency(
            verified_boundaries,
            text,
            self.ollama_client,
            self.min_chapter_tokens,
            self.min_subsection_tokens,
            self.max_sequential_subsections,
            self.tokenizer
        )

        return final_boundaries

    def segment_text(self, text: str) -> str:
        """Main segmentation function - returns text with embedded tags."""
        result = self._run_pass1_detection(text)
        if not result:
            return text

        boundaries, sentences = result
        final_boundaries = self._run_pass2_verification(boundaries, sentences, text)

        return insert_tags(text, final_boundaries)

    def segment_text_to_json(self, text: str) -> Dict:
        """
        Segment text and return structured JSON with chapters and subsections.

        Auto-detects if text is already segmented (has tags) or needs segmentation.
        """
        if has_segment_tags(text):
            print("Found existing chapter structure, parsing segments...")
            boundaries = parse_existing_segments(text)
            clean_text = remove_segment_tags(text)
            result = boundaries_to_json(
                clean_text, boundaries, self.ollama_client, self.tokenizer
            )
            print(f"Parsed {len(result.get('sections', []))} sections from existing structure")
            return result

        print("No existing structure found, generating chapters with AI...")
        detection_result = self._run_pass1_detection(text)
        if not detection_result:
            # too few sentences to find topic shifts (a short note, or CJK text punkt cannot split)
            print("Text too short for segmentation, returning as single section")
            return boundaries_to_json(text, [], self.ollama_client, self.tokenizer)

        boundaries, sentences = detection_result
        print(f"Analyzing {len(sentences)} sentences for chapter boundaries...")
        print(f"Found {len(boundaries)} potential boundaries, verifying with AI...")

        final_boundaries = self._run_pass2_verification(boundaries, sentences, text)

        result = boundaries_to_json(text, final_boundaries, self.ollama_client, self.tokenizer)
        print(f"Generated {len(result.get('sections', []))} sections using AI segmentation")
        return result