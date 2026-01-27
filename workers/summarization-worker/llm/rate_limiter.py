"""Rate limiting and retry utilities for LLM calls."""

import asyncio
import logging
import random
from dataclasses import dataclass, field
from typing import TypeVar, Callable, Awaitable, Optional
from functools import wraps

logger = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""

    max_attempts: int = 3
    base_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0
    jitter: bool = True


class RateLimiter:
    """Semaphore-based rate limiter for concurrent LLM calls."""

    def __init__(self, max_concurrent: int = 5):
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._max_concurrent = max_concurrent
        self._active_count = 0
        self._total_requests = 0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Acquire a slot for making a request."""
        await self._semaphore.acquire()
        async with self._lock:
            self._active_count += 1
            self._total_requests += 1

    def release(self) -> None:
        """Release a slot after completing a request."""
        self._semaphore.release()
        asyncio.create_task(self._decrement_count())

    async def _decrement_count(self) -> None:
        async with self._lock:
            self._active_count -= 1

    @property
    def active_requests(self) -> int:
        """Number of currently active requests."""
        return self._active_count

    @property
    def total_requests(self) -> int:
        """Total number of requests made."""
        return self._total_requests

    async def __aenter__(self) -> "RateLimiter":
        await self.acquire()
        return self

    async def __aexit__(self, *args) -> None:
        self.release()


def calculate_backoff(
    attempt: int,
    config: RetryConfig,
) -> float:
    """Calculate backoff delay for a retry attempt."""
    delay = config.base_delay * (config.exponential_base ** attempt)
    delay = min(delay, config.max_delay)

    if config.jitter:
        delay = delay * (0.5 + random.random())

    return delay


async def retry_with_backoff(
    func: Callable[..., Awaitable[T]],
    config: RetryConfig,
    retryable_exceptions: tuple = (Exception,),
    on_retry: Optional[Callable[[int, Exception, float], None]] = None,
    *args,
    **kwargs,
) -> T:
    """Execute an async function with exponential backoff retry.

    Args:
        func: Async function to execute
        config: Retry configuration
        retryable_exceptions: Tuple of exceptions that should trigger retry
        on_retry: Optional callback called before each retry (attempt, exception, delay)
        *args, **kwargs: Arguments to pass to func

    Returns:
        Result of func

    Raises:
        The last exception if all retries fail
    """
    last_exception = None

    for attempt in range(config.max_attempts):
        try:
            return await func(*args, **kwargs)
        except retryable_exceptions as e:
            last_exception = e

            if attempt == config.max_attempts - 1:
                # Last attempt, don't retry
                raise

            delay = calculate_backoff(attempt, config)

            if on_retry:
                on_retry(attempt + 1, e, delay)
            else:
                logger.warning(
                    f"Attempt {attempt + 1}/{config.max_attempts} failed: {e}. "
                    f"Retrying in {delay:.2f}s..."
                )

            await asyncio.sleep(delay)

    # Should not reach here, but just in case
    raise last_exception


def with_retry(
    config: Optional[RetryConfig] = None,
    retryable_exceptions: tuple = (Exception,),
):
    """Decorator to add retry behavior to an async function.

    Args:
        config: Retry configuration (uses defaults if None)
        retryable_exceptions: Tuple of exceptions that should trigger retry

    Example:
        @with_retry(RetryConfig(max_attempts=3))
        async def my_function():
            ...
    """
    if config is None:
        config = RetryConfig()

    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            return await retry_with_backoff(
                func, config, retryable_exceptions, None, *args, **kwargs
            )

        return wrapper

    return decorator
