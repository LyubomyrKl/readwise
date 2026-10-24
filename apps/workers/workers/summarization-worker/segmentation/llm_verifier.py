"""LLM-based boundary verification and title generation."""

import re
from typing import List
import tiktoken

from .models import Sentence, Boundary
from .ollama_client import OllamaClient


VERIFICATION_PROMPT = """You verify a single candidate boundary and may retarget it within ±8 sentences to the nearest paragraph start.

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


TITLE_PROMPT = """Return ONE title for this segment. Max 12 words, ascii, no quotes/brackets.
Focus on what the segment is about, not generic terms.

TEXT:
<<<
{text_sample}
>>>
JSON ONLY: {{"title":"..."}}"""


def clean_title(title: str) -> str:
    """Clean and normalize a title string."""
    if not title:
        return ""
    title = re.sub(r'["\'\<\>]', '', title)
    title = ''.join(c for c in title if ord(c) < 128)
    words = title.split()[:12]
    return ' '.join(words)


def verify_boundary(
    boundary: Boundary,
    sentences: List[Sentence],
    text: str,
    ollama_client: OllamaClient,
    context_sentences: int = 10
) -> Boundary:
    """Verify boundary using LLM with context."""
    start_idx = max(0, boundary.sentence_idx - context_sentences)
    end_idx = min(len(sentences), boundary.sentence_idx + context_sentences)

    left_context = " ".join(sent.text for sent in sentences[start_idx:boundary.sentence_idx])
    right_context = " ".join(sent.text for sent in sentences[boundary.sentence_idx:end_idx])

    prompt = VERIFICATION_PROMPT.format(
        left_context=left_context,
        right_context=right_context
    )

    try:
        result = ollama_client.call_llm(prompt)

        title = clean_title(result.get("title", ""))

        boundary.keep = result.get("keep", False)
        boundary.level = result.get("level", "none")
        boundary.title = title if title else None

    except Exception:
        boundary.keep = False
        boundary.level = "none"
        boundary.title = None

    return boundary


def generate_title(
    segment_text: str,
    ollama_client: OllamaClient,
    tokenizer: tiktoken.Encoding = None
) -> str:
    """Get title for segment using LLM."""
    if tokenizer is None:
        tokenizer = tiktoken.get_encoding("cl100k_base")

    tokens = tokenizer.encode(segment_text)[:300]
    text_sample = tokenizer.decode(tokens)

    prompt = TITLE_PROMPT.format(text_sample=text_sample)

    try:
        result = ollama_client.call_llm(prompt)
        title = clean_title(result.get("title", ""))
        if title:
            return title
    except Exception:
        pass

    return "Untitled Section"