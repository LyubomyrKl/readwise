#!/usr/bin/env python3

import re
import json
import hashlib
import numpy as np
import requests
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from scipy.stats import zscore
import nltk
from nltk.tokenize import sent_tokenize
import tiktoken
import sys
import argparse

# Download NLTK data if needed
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

@dataclass
class Sentence:
    text: str
    start_char: int
    end_char: int
    index: int

@dataclass
class Boundary:
    char_offset: int
    sentence_idx: int
    score: float
    level: Optional[str] = None
    title: Optional[str] = None
    keep: bool = False

class DeterministicSegmenter:
    def __init__(self, 
                 ollama_base_url: str = "http://localhost:11434",
                 llm_model: str = "qwen2.5:14b-instruct-q5_k_m",
                 embed_model: str = "bge-m3"):
        self.ollama_base_url = ollama_base_url
        self.llm_model = llm_model
        self.embed_model = embed_model
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

    def _get_ollama_embedding(self, text: str) -> np.ndarray:
        """Get L2-normalized embedding from bge-m3 via Ollama"""
        try:
            response = requests.post(
                f"{self.ollama_base_url}/api/embeddings",
                json={"model": self.embed_model, "prompt": text},
                timeout=30
            )
            if response.status_code == 200:
                embedding = np.array(response.json()["embedding"])
                # L2 normalize
                norm = np.linalg.norm(embedding)
                if norm > 0:
                    embedding = embedding / norm
                return embedding
            else:
                raise Exception(f"Embedding failed: {response.status_code}")
        except Exception as e:
            raise Exception(f"Ollama embedding error: {e}")

    def _call_llm(self, prompt: str) -> Dict:
        """Call LLM via Ollama and return JSON response"""
        try:
            response = requests.post(
                f"{self.ollama_base_url}/api/generate",
                json={
                    "model": self.llm_model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json"
                },
                timeout=60
            )
            if response.status_code == 200:
                result = response.json()["response"].strip()
                return json.loads(result)
            else:
                raise Exception(f"LLM call failed: {response.status_code}")
        except json.JSONDecodeError as e:
            raise Exception(f"Invalid JSON from LLM: {e}")
        except Exception as e:
            raise Exception(f"LLM error: {e}")

    def _sentence_split_with_offsets(self, text: str) -> List[Sentence]:
        """Split text into sentences with character offsets"""
        sentences = []
        current_pos = 0
        
        sent_texts = sent_tokenize(text)
        
        for i, sent_text in enumerate(sent_texts):
            # Find sentence in original text
            start_pos = text.find(sent_text, current_pos)
            if start_pos == -1:
                # Fallback: search for trimmed version
                start_pos = text.find(sent_text.strip(), current_pos)
                if start_pos == -1:
                    start_pos = current_pos
            
            end_pos = start_pos + len(sent_text)
            
            sentences.append(Sentence(
                text=sent_text,
                start_char=start_pos,
                end_char=end_pos,
                index=i
            ))
            
            current_pos = end_pos
        
        return sentences

    def _create_windows(self, sentences: List[Sentence]) -> List[str]:
        """Create overlapping windows of W sentences"""
        windows = []
        for i in range(len(sentences) - self.window_size + 1):
            window_text = " ".join(
                sent.text for sent in sentences[i:i + self.window_size]
            )
            windows.append(window_text)
        return windows

    def _compute_topic_shift_scores(self, embeddings: List[np.ndarray]) -> np.ndarray:
        """Compute topic shift scores: 1 - cos(E[i], E[i+1])"""
        scores = []
        for i in range(len(embeddings) - 1):
            cos_sim = np.dot(embeddings[i], embeddings[i + 1])
            topic_shift = 1.0 - cos_sim
            scores.append(topic_shift)
        return np.array(scores)

    def _find_peaks_zscore(self, scores: np.ndarray) -> List[int]:
        """Find peaks using rolling z-score with window=21, threshold=2.5"""
        if len(scores) < self.z_window:
            return []
        
        # Compute rolling z-scores
        z_scores = []
        half_window = self.z_window // 2
        
        for i in range(len(scores)):
            # Define window around position i
            start = max(0, i - half_window)
            end = min(len(scores), i + half_window + 1)
            window = scores[start:end]
            
            if len(window) > 1:
                mean = np.mean(window)
                std = np.std(window)
                if std > 0:
                    z_score = (scores[i] - mean) / std
                else:
                    z_score = 0.0
            else:
                z_score = 0.0
            
            z_scores.append(z_score)
        
        # Find peaks where z > threshold
        peaks = []
        for i, z in enumerate(z_scores):
            if z > self.z_threshold:
                peaks.append(i)
        
        return peaks

    def _map_to_sentence_boundaries(self, peak_indices: List[int], sentences: List[Sentence]) -> List[Boundary]:
        """Map peak indices to sentence boundaries"""
        boundaries = []
        
        for peak_idx in peak_indices:
            # Boundary is at start of sentence i+W
            sentence_idx = peak_idx + self.window_size
            if sentence_idx < len(sentences):
                sentence = sentences[sentence_idx]
                boundary = Boundary(
                    char_offset=sentence.start_char,
                    sentence_idx=sentence_idx,
                    score=0.0  # Will be filled with actual score if needed
                )
                boundaries.append(boundary)
        
        return boundaries

    def _merge_close_boundaries(self, boundaries: List[Boundary]) -> List[Boundary]:
        """Merge candidates within 200 chars, keep strongest"""
        if not boundaries:
            return []
        
        # Sort by character offset
        boundaries.sort(key=lambda b: b.char_offset)
        
        merged = []
        i = 0
        while i < len(boundaries):
            current = boundaries[i]
            group = [current]
            
            # Find all boundaries within merge distance
            j = i + 1
            while j < len(boundaries) and boundaries[j].char_offset - current.char_offset <= self.merge_distance:
                group.append(boundaries[j])
                j += 1
            
            # Keep the strongest (highest score) in the group
            strongest = max(group, key=lambda b: b.score)
            merged.append(strongest)
            
            i = j
        
        return merged

    def _enforce_min_token_gap(self, boundaries: List[Boundary], text: str) -> List[Boundary]:
        """Enforce minimum 400 token gap between boundaries"""
        if not boundaries:
            return []
        
        filtered = []
        last_offset = -1
        
        for boundary in boundaries:
            if last_offset == -1:
                filtered.append(boundary)
                last_offset = boundary.char_offset
            else:
                # Check token distance
                segment_text = text[last_offset:boundary.char_offset]
                token_count = len(self.tokenizer.encode(segment_text))
                
                if token_count >= self.min_token_gap:
                    filtered.append(boundary)
                    last_offset = boundary.char_offset
        
        return filtered

    def _verify_boundary_with_llm(self, boundary: Boundary, sentences: List[Sentence], text: str) -> Boundary:
        """Verify boundary using LLM with context"""
        # Get context around the boundary (±3 paragraphs approximation)
        context_sentences = 10  # Approximate 3 paragraphs
        
        start_idx = max(0, boundary.sentence_idx - context_sentences)
        end_idx = min(len(sentences), boundary.sentence_idx + context_sentences)
        
        left_context = " ".join(sent.text for sent in sentences[start_idx:boundary.sentence_idx])
        right_context = " ".join(sent.text for sent in sentences[boundary.sentence_idx:end_idx])
        
        prompt = f"""You verify a single candidate boundary and may retarget it within ±8 sentences to the nearest paragraph start.

OUTPUT JSON ONLY:
{{
  "keep": true|false,
  "level": "chapter"|"subsection"|"none",
  "title": "max 12 words, ascii, no quotes/brackets",
  "offset_sentences": -8..8,
  "confidence": 0.0-1.0,
  "rationale_tags": ["topic-shift","scope-reset","cue-heading","cue-discourse","entity-reset","list-closure"] 
}}

Decision checklist (apply strictly):

1) Keep only with CLEAR shift (need ≥2 signals):
   - Topic/Entity shift: new primary entity/concept appears while prior primary entity fades.
   - Intent/Style shift: setup→method, method→results, results→discussion; narrative→exposition; problem→solution.
   - Scope reset: time/place/dataset/audience changes.
   - Strong cue line: standalone Title Case/ALL CAPS/numbered heading, or metadiscourse ("In conclusion", "Next, we discuss", "We now turn to").
   - List/figure/table section ends and a new thread begins.

2) Reject if ANY of:
   - Enumeration/example continues; quote/dialogue continues.
   - Only light transition ("However", "Additionally") with same topic.
   - Only pronoun/tense change with same focus; mere figure/table callout.

3) Level selection:
   - "chapter" if ≥2 of: global scope reset; thesis/roadmap sentence; backward summary that closes prior unit; many new unique entities with ≥50% drop of prior entities; audience/register shift.
   - Otherwise "subsection".

4) Title rules:
   - Describe the AFTER segment; ≤12 words; ASCII; no quotes/brackets; noun-heavy; include key entity; avoid boilerplate ("Introduction", "Background", "Conclusion").

5) Snapping:
   - Set offset_sentences in [-8..8] to move the boundary to the nearest PARAGRAPH START that maximizes (topic-shift + cue strength).
   - Prefer leftward snap on ties; never snap into the middle of a list/quote.

6) Confidence thresholds:
   - Provide confidence ∈ [0,1].
   - Keep only if confidence ≥ 0.65 for "chapter" or ≥ 0.55 for "subsection".

CONTEXT_BEFORE:
<<<
{left_context}
>>>
CONTEXT_AFTER:
<<<
{right_context}
>>>"""

        try:
            result = self._call_llm(prompt)
            
            # Validate and clean title
            title = result.get("title", "").strip()
            if title:
                # Remove quotes and angle brackets, limit to ASCII
                title = re.sub(r'["\'\<\>]', '', title)
                title = ''.join(c for c in title if ord(c) < 128)
                # Limit to 12 words
                words = title.split()[:12]
                title = ' '.join(words)
            
            boundary.keep = result.get("keep", False)
            boundary.level = result.get("level", "none")
            boundary.title = title if title else None
            
        except Exception as e:
            # Fallback: don't keep boundary on LLM error
            boundary.keep = False
            boundary.level = "none"
            boundary.title = None
        
        return boundary

    def _get_title_with_llm(self, segment_text: str) -> str:
        """Get title for segment using LLM"""
        # Take first ~300 tokens
        tokens = self.tokenizer.encode(segment_text)[:300]
        text_sample = self.tokenizer.decode(tokens)
        
        prompt = f"""Return ONE title for this segment. Max 12 words, ascii, no quotes/brackets.
Focus on what the segment is about, not generic terms.

TEXT:
<<<
{text_sample}
>>>
JSON ONLY: {{"title":"..."}}"""

        try:
            result = self._call_llm(prompt)
            title = result.get("title", "").strip()
            
            if title:
                # Clean title
                title = re.sub(r'["\'\<\>]', '', title)
                title = ''.join(c for c in title if ord(c) < 128)
                words = title.split()[:12]
                title = ' '.join(words)
                return title
        except:
            pass
        
        return "Untitled Section"

    def _solve_consistency(self, boundaries: List[Boundary], text: str) -> List[Boundary]:
        """Apply consistency rules and length constraints"""
        if not boundaries:
            return []
        
        # Ensure first kept boundary is a chapter
        if boundaries and boundaries[0].level != "chapter":
            boundaries[0].level = "chapter"
        
        # Check length constraints and fix violations
        final_boundaries = []
        subsection_count = 0
        
        for i, boundary in enumerate(boundaries):
            # Calculate segment length
            start_offset = boundary.char_offset
            end_offset = boundaries[i + 1].char_offset if i + 1 < len(boundaries) else len(text)
            segment_text = text[start_offset:end_offset]
            token_count = len(self.tokenizer.encode(segment_text))
            
            # Enforce minimum lengths
            if boundary.level == "chapter" and token_count < self.min_chapter_tokens:
                # Try to merge with next or promote
                if i + 1 < len(boundaries) and boundaries[i + 1].level == "subsection":
                    # Merge by skipping this boundary
                    continue
                # Otherwise keep as chapter (edge case)
            elif boundary.level == "subsection" and token_count < self.min_subsection_tokens:
                # Drop or merge
                continue
            
            # Cap sequential subsections
            if boundary.level == "chapter":
                subsection_count = 0
            elif boundary.level == "subsection":
                subsection_count += 1
                if subsection_count > self.max_sequential_subsections:
                    # Force merge by skipping
                    subsection_count -= 1
                    continue
            
            # Fix missing titles
            if not boundary.title or len(boundary.title.strip()) == 0:
                boundary.title = self._get_title_with_llm(segment_text)
            
            final_boundaries.append(boundary)
        
        return final_boundaries

    def _generate_id(self, char_offset: int, level: str) -> str:
        """Generate stable ID using md5 of position"""
        pos_hash = hashlib.md5(str(char_offset).encode()).hexdigest()[:8]
        prefix = "ch" if level == "chapter" else "sub"
        return f"{prefix}-{pos_hash}"

    def _insert_tags(self, text: str, boundaries: List[Boundary]) -> str:
        """Insert tags at boundary positions (right-to-left)"""
        # Sort boundaries by character offset in descending order
        boundaries.sort(key=lambda b: b.char_offset, reverse=True)
        
        result_text = text
        
        for boundary in boundaries:
            # Generate ID
            boundary_id = self._generate_id(boundary.char_offset, boundary.level)
            
            # Create tag
            if boundary.level == "chapter":
                tag = f'<<<CHAPTER id="{boundary_id}" title="{boundary.title}">>>\n\n'
            else:  # subsection
                tag = f'<<<Subsection id="{boundary_id}" title="{boundary.title}">>>\n\n'
            
            # Insert tag
            result_text = result_text[:boundary.char_offset] + tag + result_text[boundary.char_offset:]
        
        return result_text

    def segment_text(self, text: str) -> str:
        """Main segmentation function - deterministic 2-pass algorithm"""
        
        # Step 1: Sentence splitting with offsets
        sentences = self._sentence_split_with_offsets(text)
        if len(sentences) < self.window_size + 1:
            return text  # Too short to segment
        
        # Step 2: Create windows and embed
        windows = self._create_windows(sentences)
        embeddings = []
        for window in windows:
            embedding = self._get_ollama_embedding(window)
            embeddings.append(embedding)
        
        # Step 3: Compute topic shift scores
        topic_scores = self._compute_topic_shift_scores(embeddings)
        
        # Step 4: Find peaks using z-score
        peak_indices = self._find_peaks_zscore(topic_scores)
        
        # Step 5: Map to sentence boundaries
        boundaries = self._map_to_sentence_boundaries(peak_indices, sentences)
        
        # Step 6: Apply merging and gap rules
        boundaries = self._merge_close_boundaries(boundaries)
        boundaries = self._enforce_min_token_gap(boundaries, text)
        
        # Step 7: LLM verification (Pass 1)
        verified_boundaries = []
        for boundary in boundaries:
            verified_boundary = self._verify_boundary_with_llm(boundary, sentences, text)
            if verified_boundary.keep:
                verified_boundaries.append(verified_boundary)
        
        # Step 8: Consistency solver (Pass 2)
        final_boundaries = self._solve_consistency(verified_boundaries, text)
        
        # Step 9: Insert tags
        result = self._insert_tags(text, final_boundaries)
        
        return result

def main():
    parser = argparse.ArgumentParser(description='Deterministic AI Text Segmentation')
    parser.add_argument('--input', '-i', help='Input file (default: stdin)')
    parser.add_argument('--output', '-o', help='Output file (default: stdout)')
    parser.add_argument('--ollama-url', default='http://localhost:11434', 
                       help='Ollama server URL')
    
    args = parser.parse_args()
    
    # Read input
    if args.input:
        with open(args.input, 'r', encoding='utf-8') as f:
            text = f.read()
    else:
        text = sys.stdin.read()
    
    # Process
    segmenter = DeterministicSegmenter(ollama_base_url=args.ollama_url)
    result = segmenter.segment_text(text)
    
    # Write output
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(result)
    else:
        sys.stdout.write(result)

if __name__ == "__main__":
    main()