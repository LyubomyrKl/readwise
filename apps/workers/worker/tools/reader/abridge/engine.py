"""The engine's call path: one request in flight, waiting for the host, cancellation between calls."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional, Protocol

from worker.platform.jobs import JobFailed
from worker.platform.llm import wait_for_llm
from worker.platform.settings import WorkerSettings
from worker.tools.reader.abridge.llm import LLMError, LLMUnavailable, ModelMissing, OllamaClient, Reply

logger = logging.getLogger(__name__)

# model tokens per word, measured for Gemma 4 (Appendix B.4) with a margin; used for caps and budgets
TOKENS_PER_WORD = {"en": 1.3, "ru": 2.3, "uk": 2.6}
OTHER_TOKENS_PER_WORD = 2.0


def tokens_per_word(lang: str) -> float:
    return TOKENS_PER_WORD.get(lang, OTHER_TOKENS_PER_WORD)


class Context(Protocol):
    """What the engine needs from a job (JobContext) or from the bench (LocalContext)."""

    def check_cancelled(self) -> None: ...
    def progress(self, stage: Optional[str] = None, progress: Optional[int] = None) -> None: ...
    def waiting(self, reason: str, stage: Optional[str] = None) -> None: ...


@dataclass
class Models:
    writer: str            # abridges, summarizes, confirms and fixes
    checker: str           # lists suspected errors ("" = no fact-check)
    vision: str            # describes pictures, reads scanned pages


class Engine:
    def __init__(self, client: OllamaClient, ctx: Context, settings: WorkerSettings, models: Models,
                 sleep=time.sleep):
        self.client = client
        self.ctx = ctx
        self.settings = settings
        self.models = models
        self.sleep = sleep
        self.stage: Optional[str] = None

    @property
    def num_ctx(self) -> int:
        return self.client.num_ctx

    def summary_budget_words(self, lang: str) -> int:
        """Words of source that fit one call with room for the instructions and the answer."""
        return int((self.num_ctx - 1500) * 0.85 / tokens_per_word(lang))

    def call(self, model: str, messages, num_predict: int, temperature: float = 0.2,
             images: Optional[list[bytes]] = None) -> Reply:
        errors = 0
        while True:
            self.ctx.check_cancelled()
            try:
                return self.client.chat(model, messages, num_predict=num_predict, temperature=temperature,
                                        images=images)
            except ModelMissing as error:
                raise JobFailed(str(error), retryable=False) from error
            except LLMUnavailable as error:
                logger.warning("LLM host unreachable (%s); waiting for it", error)
                wait_for_llm(self.ctx, self.settings, stage=self.stage)  # type: ignore[arg-type]
            except LLMError as error:
                errors += 1
                if errors >= 3:
                    raise JobFailed(f"LLM error: {error}", retryable=True) from error
                logger.warning("LLM error (%s), attempt %s of 3", error, errors)
                self.sleep(min(30, 5 * errors))
