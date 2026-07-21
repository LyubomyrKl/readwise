"""Sentence processing utilities for text segmentation."""

from typing import List
import nltk
from nltk.tokenize import sent_tokenize

from .models import Sentence

# Download NLTK data if needed
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')


def split_into_sentences(text: str) -> List[Sentence]:
    """Split text into sentences with character offsets."""
    sentences = []
    current_pos = 0

    sent_texts = sent_tokenize(text)

    for i, sent_text in enumerate(sent_texts):
        start_pos = text.find(sent_text, current_pos)
        if start_pos == -1:
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


def create_windows(sentences: List[Sentence], window_size: int) -> List[str]:
    """Create overlapping windows of W sentences."""
    windows = []
    for i in range(len(sentences) - window_size + 1):
        window_text = " ".join(
            sent.text for sent in sentences[i:i + window_size]
        )
        windows.append(window_text)
    return windows