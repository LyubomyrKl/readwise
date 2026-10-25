"""The job runner: one envelope in, a sequence of events out.

Semantics shared with the API's Node runner (docs/toolbox-architecture-plan.md 2.9):
the queue message is acknowledged on claim; `started`, `progress`, `waiting` and a
terminal `succeeded` / `failed` / `cancelled` event tell the API what happened.
Handlers read only the payload and object storage, never a database.
"""

from __future__ import annotations

import logging
import traceback
from typing import Any, Callable, Optional, Protocol

from worker.platform.contracts import JobEnvelope, JobEvent
from worker.platform.events import EventPublisher, JobState, utcnow
from worker.platform.logging import job_logger
from worker.platform.settings import WorkerSettings
from worker.platform.storage import S3Storage

logger = logging.getLogger(__name__)


class JobFailed(Exception):
    """Raise from a handler to fail the job with a message; retryable=False means do not re-run."""

    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


class JobCancelled(Exception):
    """Raised by JobContext.check_cancelled() when the API asked to stop."""


class JobContext:
    """What a handler gets: identity, payload, dependencies and the way to report."""

    def __init__(self, envelope: JobEnvelope, state: JobState, publisher: EventPublisher,
                 settings: WorkerSettings, storage: S3Storage, worker_id: str):
        self.envelope = envelope
        self.job_id = envelope.jobId
        self.type = envelope.type
        self.attempt = envelope.attempt
        self.payload: dict[str, Any] = envelope.payload
        self.settings = settings
        self.storage = storage
        self.worker_id = worker_id
        self.log = job_logger(f"job.{envelope.type}", jobId=envelope.jobId, toolId=envelope.toolId,
                              type=envelope.type, attempt=envelope.attempt)
        self._state = state
        self._publisher = publisher

    @property
    def stage(self) -> Optional[str]:
        return self._state.stage

    @property
    def cancelled(self) -> bool:
        return self._state.cancel_requested.is_set()

    def check_cancelled(self) -> None:
        if self.cancelled:
            raise JobCancelled(f"job {self.job_id} cancelled")

    def progress(self, stage: Optional[str] = None, progress: Optional[int] = None) -> None:
        with self._state.lock:
            if stage is not None:
                self._state.stage = stage[:200]
            if progress is not None:
                self._state.progress = max(0, min(100, int(progress)))
            self._state.wait_reason = None
            event = JobEvent(jobId=self.job_id, event="progress", at=utcnow(), workerId=self.worker_id,
                             stage=self._state.stage, progress=self._state.progress)
        self._publisher.emit(event)

    def waiting(self, reason: str, stage: Optional[str] = None) -> None:
        with self._state.lock:
            if stage is not None:
                self._state.stage = stage[:200]
            self._state.wait_reason = reason[:2000]
            event = JobEvent(jobId=self.job_id, event="waiting", at=utcnow(), workerId=self.worker_id,
                             stage=self._state.stage, progress=self._state.progress, reason=self._state.wait_reason)
        self._publisher.emit(event)


class Handler(Protocol):
    def __call__(self, ctx: JobContext) -> Optional[dict[str, Any]]: ...


class JobRunner:
    """Dispatches envelopes to handlers and turns the outcome into events."""

    def __init__(self, settings: WorkerSettings, storage: S3Storage, publisher: EventPublisher,
                 handlers: dict[str, Handler]):
        self.settings = settings
        self.storage = storage
        self.publisher = publisher
        self.handlers = handlers
        self.worker_id = settings.worker_id

    def _event(self, job_id: str, event: str, **fields: Any) -> JobEvent:
        return JobEvent(jobId=job_id, event=event, at=utcnow(), workerId=self.worker_id, **fields)

    def handle(self, envelope: JobEnvelope) -> str:
        """Runs one job to completion; returns the terminal event kind."""
        job_id = envelope.jobId
        log = job_logger(__name__, jobId=job_id, toolId=envelope.toolId, type=envelope.type, attempt=envelope.attempt)
        handler = self.handlers.get(envelope.type)
        if handler is None:
            log.error("no handler for %s", envelope.type)
            self.publisher.emit(self._event(job_id, "failed", error=f"no handler for {envelope.type}", retryable=False))
            self.publisher.flush()
            return "failed"

        if self.publisher.was_cancelled(job_id, envelope.publishedAt):
            log.info("job was cancelled before it started")
            self.publisher.emit(self._event(job_id, "cancelled", error="cancelled before start"))
            self.publisher.flush()
            return "cancelled"

        state = JobState(job_id, envelope.attempt)
        self.publisher.register(state, envelope.publishedAt)
        self.publisher.emit(self._event(job_id, "started", attempt=envelope.attempt))
        ctx = JobContext(envelope, state, self.publisher, self.settings, self.storage, self.worker_id)
        log.info("job started")
        outcome = "failed"
        try:
            result = handler(ctx)
            self.publisher.emit(self._event(job_id, "succeeded", result=result or {}, progress=100, stage=state.stage))
            outcome = "succeeded"
            log.info("job succeeded")
        except JobCancelled:
            self.publisher.emit(self._event(job_id, "cancelled", error="cancelled by request"))
            outcome = "cancelled"
            log.info("job cancelled")
        except JobFailed as error:
            self.publisher.emit(self._event(job_id, "failed", error=str(error)[:4000], retryable=error.retryable))
            log.error("job failed: %s (retryable=%s)", error, error.retryable)
        except Exception as error:  # noqa: BLE001 - every other error fails the job, retryable
            message = f"{type(error).__name__}: {error}"[:4000]
            log.error("job failed: %s\n%s", message, traceback.format_exc())
            self.publisher.emit(self._event(job_id, "failed", error=message, retryable=True))
        finally:
            self.publisher.unregister(job_id)
            self.publisher.flush()
        return outcome


HandlerFactory = Callable[[WorkerSettings, S3Storage], dict[str, Handler]]
