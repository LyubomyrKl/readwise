"""Reachability of the LLM host. The host is started by hand, so a job waits for it instead of failing."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:  # pragma: no cover
    from worker.platform.jobs import JobContext
    from worker.platform.settings import WorkerSettings

logger = logging.getLogger(__name__)

# Exceptions the HTTP clients raise when the host is down (httpx: pipeline, requests: segmenter)
CONNECTION_ERROR_MARKERS = (
    "connection refused",
    "connect call failed",
    "name or service not known",
    "nodename nor servname",
    "failed to establish a new connection",
    "max retries exceeded",
    "connecterror",
    "connecttimeout",
    "remote protocol error",
    "all connection attempts failed",
    "network is unreachable",
    "no route to host",
    "temporary failure in name resolution",
    "server disconnected",
)


def probe_ollama(base_url: str, timeout: float = 5.0) -> bool:
    """True when the Ollama host answers GET /api/tags."""
    if not base_url:
        return False
    try:
        response = httpx.get(f"{base_url.rstrip('/')}/api/tags", timeout=timeout)
        return response.status_code < 500
    except httpx.HTTPError:
        return False
    except Exception:  # pragma: no cover - defensive
        return False


def looks_like_connection_error(error: BaseException) -> bool:
    """Heuristic over the exception chain: did the LLM host go away?"""
    seen: set[int] = set()
    current: Optional[BaseException] = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, (httpx.ConnectError, httpx.ConnectTimeout, httpx.RemoteProtocolError, ConnectionError)):
            return True
        text = f"{type(current).__name__}: {current}".lower()
        if any(marker in text for marker in CONNECTION_ERROR_MARKERS):
            return True
        current = current.__cause__ or current.__context__
    return False


def wait_for_llm(ctx: "JobContext", settings: "WorkerSettings", stage: Optional[str] = None) -> None:
    """Block until the LLM host is reachable, reporting `waiting` with backoff; honours cancellation.

    `probe_ollama` and `time.sleep` are looked up at call time so tests can replace them.
    """
    delay = max(1, settings.worker_llm_wait_min_seconds)
    waited = False
    while not probe_ollama(settings.ollama_base_url):
        waited = True
        ctx.waiting(f"LLM host unreachable: {settings.ollama_base_url}", stage=stage)
        ctx.check_cancelled()
        logger.warning("LLM host unreachable, retrying in %ss", delay, extra={"jobId": ctx.job_id})
        time.sleep(delay)
        ctx.check_cancelled()
        delay = min(delay * 2, max(delay, settings.worker_llm_wait_max_seconds))
    if waited:
        ctx.progress("LLM host reachable")
