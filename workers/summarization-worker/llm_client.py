#!/usr/bin/env python3

import logging
import openai
import tiktoken

logger = logging.getLogger(__name__)


class LLMClient:
    """Simple LLM client for summarization using Ollama"""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen2.5:14b-instruct-q5_k_m"):
        self.client = openai.OpenAI(
            base_url=f"{base_url}/v1",
            api_key="ollama"
        )
        self.model = model
        self.tokenizer = tiktoken.get_encoding("cl100k_base")

    def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        return len(self.tokenizer.encode(text))

    def extractive_summarize(self, text: str, summary_percent: float) -> str:
        """Extract key sentences from text"""
        try:
            prompt = f"""You are an extractive summarizer. Select and preserve the most important sentences from the original text.

Instructions:
- Extract approximately {int(summary_percent * 100)}% of the most important sentences
- Keep sentences EXACTLY as they appear in the original text
- Preserve the original order and structure
- Include key facts, conclusions, definitions, and important statements
- Return as plain text, preserving paragraph breaks

Text to extract from:
{text}

IMPORTANT: Preserve the original language of the text.
Return only the extracted sentences as plain text."""

            max_tokens = min(1200, int(self.count_tokens(text) * summary_percent * 1.5))

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert at extractive summarization."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=max_tokens,
                temperature=0.1
            )

            return response.choices[0].message.content.strip()

        except Exception as e:
            logger.error(f"Extractive summarization failed: {e}")
            return text

    def abstractive_summarize(self, text: str, summary_percent: float) -> str:
        """Rewrite and condense text"""
        try:
            prompt = f"""You are an abstractive summarizer. Rewrite and condense the content in your own words.

Instructions:
- Condense to approximately {int(summary_percent * 100)}% of the original length
- Rewrite in your own words while preserving all key information
- Maintain the logical flow and structure
- Keep all facts, numbers, and important details accurate
- Return as plain text, preserving paragraph breaks

Text to summarize:
{text}

IMPORTANT: Write the summary in the same language as the source text.
Return only the rewritten summary as plain text."""

            max_tokens = min(1800, int(self.count_tokens(text) * summary_percent * 1.5))

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert at abstractive summarization."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=max_tokens,
                temperature=0.3
            )

            return response.choices[0].message.content.strip()

        except Exception as e:
            logger.error(f"Abstractive summarization failed: {e}")
            return text