"""Async LLM client with connection pooling and retry logic."""

import asyncio
import logging
import time
from typing import List, Optional, Dict, Any

import httpx
import tiktoken

from worker.tools.reader.summarize.core.models import LLMRequest, LLMResponse
from worker.tools.reader.summarize.core.exceptions import LLMError, LLMTimeoutError, LLMRateLimitError, LLMResponseError
from worker.tools.reader.summarize.config.settings import SummarizationSettings
from .rate_limiter import RateLimiter, RetryConfig, retry_with_backoff

logger = logging.getLogger(__name__)


class AsyncLLMClient:
    """Async LLM client with connection pooling, rate limiting, and retry logic.

    Uses the OpenAI-compatible API (works with Ollama, vLLM, etc.)
    """

    def __init__(
        self,
        base_url: str = None,
        model: str = None,
        embed_model: str = None,
        max_concurrent: int = 5,
        timeout: float = 120.0,
        retry_config: Optional[RetryConfig] = None,
        tokenizer_encoding: str = "cl100k_base",
    ):
        import os
        # Use environment variables as defaults
        if base_url is None:
            base_url = os.environ['OLLAMA_BASE_URL']
        if model is None:
            model = os.environ['OLLAMA_MODEL']
        if embed_model is None:
            embed_model = os.environ['OLLAMA_EMBED_MODEL']

        self.base_url = base_url.rstrip("/")
        self.model = model
        self.embed_model = embed_model
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None
        self._rate_limiter = RateLimiter(max_concurrent)
        self._retry_config = retry_config or RetryConfig()
        self._tokenizer = tiktoken.get_encoding(tokenizer_encoding)
        self._is_open = False

    @classmethod
    def from_settings(cls, settings: SummarizationSettings) -> "AsyncLLMClient":
        """Create client from settings."""
        return cls(
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
            embed_model=settings.ollama_embed_model,
            max_concurrent=settings.llm_max_concurrent,
            timeout=settings.llm_timeout,
            retry_config=RetryConfig(
                max_attempts=settings.llm_retry_attempts,
                base_delay=settings.llm_retry_base_delay,
            ),
            tokenizer_encoding=settings.tokenizer_encoding,
        )

    async def __aenter__(self) -> "AsyncLLMClient":
        """Open the client connection pool."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.timeout, connect=10.0),
                limits=httpx.Limits(
                    max_keepalive_connections=20,
                    max_connections=100,
                ),
            )
        self._is_open = True
        return self

    async def __aexit__(self, *args) -> None:
        """Close the client connection pool."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        self._is_open = False

    def _ensure_open(self) -> None:
        """Ensure the client is open."""
        if not self._is_open or self._client is None:
            raise LLMError("Client is not open. Use 'async with' context manager.")

    def count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken."""
        return len(self._tokenizer.encode(text))

    async def complete(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.3,
    ) -> str:
        """Complete a prompt with the LLM.

        Args:
            prompt: The user prompt
            system_prompt: Optional system prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature

        Returns:
            The generated text

        Raises:
            LLMError: If the host answers with an HTTP error
            LLMTimeoutError: If the request times out
            LLMResponseError: If the answer is unusable (malformed body, missing fields)
            httpx.TransportError: If the host cannot be reached (after retries)
        """
        self._ensure_open()
        assert self._client is not None  # Guaranteed by _ensure_open()

        client = self._client  # Local reference for type checker

        async def _make_request() -> str:
            async with self._rate_limiter:
                messages = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": prompt})

                # Transport errors (connection refused or reset, protocol errors) propagate as
                # they are: they are retried below and then reach the job handler, which waits
                # for the host instead of failing.
                try:
                    response = await client.post(
                        "/v1/chat/completions",
                        json={
                            "model": self.model,
                            "messages": messages,
                            "max_tokens": max_tokens,
                            "temperature": temperature,
                        },
                    )
                    response.raise_for_status()
                except httpx.TimeoutException as e:
                    raise LLMTimeoutError(
                        f"Request timed out after {self.timeout}s", timeout=self.timeout
                    ) from e
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429:
                        raise LLMRateLimitError("Rate limit exceeded")
                    raise LLMError(
                        f"HTTP error: {e.response.status_code}",
                        status_code=e.response.status_code,
                    ) from e

                try:
                    data = response.json()
                    return data["choices"][0]["message"]["content"].strip()
                except (ValueError, KeyError, IndexError, TypeError, AttributeError) as e:
                    raise LLMResponseError(f"Unusable response: {e!r}") from e

        return await retry_with_backoff(
            _make_request,
            self._retry_config,
            retryable_exceptions=(LLMTimeoutError, LLMRateLimitError, httpx.TransportError),
        )

    async def complete_batch(
        self, requests: List[LLMRequest]
    ) -> List[LLMResponse]:
        """Complete multiple prompts in parallel.

        Args:
            requests: List of LLM requests

        Returns:
            List of LLM responses in the same order
        """
        self._ensure_open()

        async def _process_request(request: LLMRequest) -> LLMResponse:
            start_time = time.perf_counter()
            try:
                content = await self.complete(
                    prompt=request.prompt,
                    system_prompt=request.system_prompt,
                    max_tokens=request.max_tokens,
                    temperature=request.temperature,
                )
                latency_ms = (time.perf_counter() - start_time) * 1000
                return LLMResponse(
                    content=content,
                    request_id=request.request_id,
                    tokens_used=self.count_tokens(content),
                    latency_ms=latency_ms,
                    success=True,
                )
            except Exception as e:
                latency_ms = (time.perf_counter() - start_time) * 1000
                logger.error(f"Batch request {request.request_id} failed: {e}")
                return LLMResponse(
                    content="",
                    request_id=request.request_id,
                    latency_ms=latency_ms,
                    success=False,
                    error=str(e),
                )

        tasks = [_process_request(req) for req in requests]
        return await asyncio.gather(*tasks)

    async def get_embedding(self, text: str) -> List[float]:
        """Get embedding for text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector as list of floats

        Raises:
            LLMError: If the request fails
        """
        self._ensure_open()
        assert self._client is not None  # Guaranteed by _ensure_open()

        client = self._client  # Local reference for type checker

        async def _make_request() -> List[float]:
            async with self._rate_limiter:
                try:
                    response = await client.post(
                        "/api/embed",
                        json={
                            "model": self.embed_model,
                            "input": text,
                        },
                    )
                    response.raise_for_status()
                    data = response.json()
                    # Ollama returns embeddings in 'embeddings' field
                    if "embeddings" in data:
                        return data["embeddings"][0]
                    # OpenAI-compatible format
                    elif "data" in data:
                        return data["data"][0]["embedding"]
                    else:
                        raise LLMError(f"Unexpected embedding response format: {data.keys()}")

                except httpx.TimeoutException as e:
                    raise LLMTimeoutError(
                        f"Embedding request timed out after {self.timeout}s"
                    ) from e
                except httpx.HTTPStatusError as e:
                    raise LLMError(
                        f"Embedding HTTP error: {e.response.status_code}",
                        status_code=e.response.status_code,
                    ) from e
                except Exception as e:
                    if isinstance(e, LLMError):
                        raise
                    raise LLMError(f"Embedding request failed: {str(e)}") from e

        return await retry_with_backoff(
            _make_request,
            self._retry_config,
            retryable_exceptions=(LLMTimeoutError, httpx.TransportError),
        )

    async def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings for multiple texts in parallel.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        tasks = [self.get_embedding(text) for text in texts]
        return await asyncio.gather(*tasks)

    async def extractive_summarize(
        self,
        text: str,
        summary_percent: float = 0.3,
        context: Optional[str] = None,
    ) -> str:
        """Extract key sentences from text.

        Args:
            text: Text to summarize
            summary_percent: Target percentage of original length
            context: Optional context from previous chunks

        Returns:
            Extracted key sentences
        """
        context_section = ""
        if context:
            context_section = f"""
Previous context:
{context}

"""

        prompt = f"""{context_section}You are an extractive summarizer. Select and preserve the most important sentences from the original text.

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

        return await self.complete(
            prompt=prompt,
            system_prompt="You are an expert at extractive summarization.",
            max_tokens=max_tokens,
            temperature=0.1,
        )

    async def abstractive_summarize(
        self,
        text: str,
        summary_percent: float = 0.3,
        context: Optional[str] = None,
        entities: Optional[str] = None,
    ) -> str:
        """Rewrite and condense text.

        Args:
            text: Text to summarize
            summary_percent: Target percentage of original length
            context: Optional context from previous chunks
            entities: Optional entity context string

        Returns:
            Rewritten summary
        """
        context_section = ""
        if context:
            context_section = f"""
Previous context:
{context}

"""

        entity_section = ""
        if entities:
            entity_section = f"""
Key entities to maintain consistency:
{entities}

"""

        prompt = f"""{context_section}{entity_section}You are an abstractive summarizer. Rewrite and condense the content in your own words.

Instructions:
- Condense to approximately {int(summary_percent * 100)}% of the original length
- Rewrite in your own words while preserving all key information
- Maintain the logical flow and structure
- Keep all facts, numbers, and important details accurate
- Maintain consistency with any mentioned entities
- Return as plain text, preserving paragraph breaks

Text to summarize:
{text}

IMPORTANT: Write the summary in the same language as the source text.
Return only the rewritten summary as plain text."""

        max_tokens = min(1800, int(self.count_tokens(text) * summary_percent * 1.5))

        return await self.complete(
            prompt=prompt,
            system_prompt="You are an expert at abstractive summarization.",
            max_tokens=max_tokens,
            temperature=0.3,
        )

    @property
    def stats(self) -> Dict[str, Any]:
        """Get client statistics."""
        return {
            "active_requests": self._rate_limiter.active_requests,
            "total_requests": self._rate_limiter.total_requests,
            "is_open": self._is_open,
        }
