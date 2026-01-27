#!/usr/bin/env python3

import re
import tiktoken
from typing import List

class TextChunker:
    """Split text into overlapping chunks for summarization"""

    def __init__(self, target_tokens: int = 600, overlap_percent: float = 0.15):
        self.target_tokens = target_tokens
        self.overlap_percent = overlap_percent
        self.tokenizer = tiktoken.get_encoding("cl100k_base")

    def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        return len(self.tokenizer.encode(text))

    def chunk(self, content: str) -> List[str]:
        """
        Split content into chunks with overlap.

        Returns list of text chunks, each approximately target_tokens size.
        """
        content_tokens = self.count_tokens(content)
        if content_tokens <= self.target_tokens:
            return [content]

        sentences = re.split(r'(?<=[.!?])\s+', content)
        overlap_size = int(self.target_tokens * self.overlap_percent)

        chunks = []
        current_chunk = []
        current_tokens = 0
        sentence_idx = 0

        while sentence_idx < len(sentences):
            sentence = sentences[sentence_idx]
            sentence_tokens = self.count_tokens(sentence)

            if current_tokens + sentence_tokens > self.target_tokens and current_chunk:
                chunks.append(' '.join(current_chunk))

                # Keep overlap from end of current chunk
                overlap_tokens = 0
                overlap_sentences = []
                for sent in reversed(current_chunk):
                    sent_tokens = self.count_tokens(sent)
                    if overlap_tokens + sent_tokens <= overlap_size:
                        overlap_sentences.insert(0, sent)
                        overlap_tokens += sent_tokens
                    else:
                        break

                current_chunk = overlap_sentences
                current_tokens = overlap_tokens

            current_chunk.append(sentence)
            current_tokens += sentence_tokens
            sentence_idx += 1

        if current_chunk:
            chunks.append(' '.join(current_chunk))

        return chunks