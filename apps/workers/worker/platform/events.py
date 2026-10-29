"""Publishing job events and heartbeats; receiving control messages.

One background thread owns one AMQP connection and does all publishing, so the
handler thread never touches pika (BlockingConnection is not thread-safe).
Handlers hand events over through a queue; the thread also sends a progress
heartbeat for every running job at a fixed interval (the API's lease relies on
it) and polls the control queue for cancellations.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Optional

import pika

from worker.platform.contracts import JobControl, JobEvent

logger = logging.getLogger(__name__)

EVENTS_EXCHANGE = "workbench.job-events"
CONTROL_EXCHANGE = "workbench.job-control"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JobState:
    """Shared between a handler and the publisher thread: latest stage/progress, cancellation."""

    def __init__(self, job_id: str, attempt: int, interrupt: Optional[threading.Event] = None):
        self.job_id = job_id
        self.attempt = attempt
        self.stage: Optional[str] = None
        self.progress: Optional[int] = None
        self.wait_reason: Optional[str] = None
        self.cancel_requested = threading.Event()
        # set when the worker is stopping (the runner shares one event between all its jobs)
        self.interrupt_requested = interrupt or threading.Event()
        # the terminal event this run reported; nothing is reported for the run after it
        self.outcome: Optional[str] = None
        self.lock = threading.Lock()

    def heartbeat_event(self, worker_id: str) -> JobEvent:
        with self.lock:
            if self.wait_reason:
                return JobEvent(jobId=self.job_id, event="waiting", at=utcnow(), workerId=worker_id,
                                stage=self.stage, progress=self.progress, reason=self.wait_reason)
            return JobEvent(jobId=self.job_id, event="progress", at=utcnow(), workerId=worker_id,
                            stage=self.stage, progress=self.progress)


class EventPublisher(threading.Thread):
    """Daemon thread: drains the event queue, heartbeats active jobs, listens for cancels."""

    def __init__(self, amqp_url: str, worker_id: str, heartbeat_seconds: int = 60,
                 reconnect_seconds: int = 5):
        super().__init__(name="event-publisher", daemon=True)
        self.amqp_url = amqp_url
        self.worker_id = worker_id
        self.heartbeat_seconds = max(5, heartbeat_seconds)
        self.reconnect_seconds = reconnect_seconds
        self._outbox: "queue.Queue[JobEvent]" = queue.Queue()
        self._in_flight: Optional[JobEvent] = None  # taken from the outbox, not confirmed by the broker yet
        self._active: dict[str, JobState] = {}
        self._active_lock = threading.Lock()
        self._recent_cancels: "OrderedDict[str, datetime]" = OrderedDict()
        self._stop = threading.Event()
        self._connection: Optional[pika.BlockingConnection] = None
        self._channel = None
        self._control_queue: Optional[str] = None
        self._last_heartbeat = 0.0

    # ---- API used by the runner and handlers (any thread) --------------------------------

    def emit(self, event: JobEvent) -> None:
        self._outbox.put(event)

    def register(self, state: JobState, published_at: Optional[datetime] = None) -> None:
        with self._active_lock:
            self._active[state.job_id] = state
        if self.was_cancelled(state.job_id, published_at):
            state.cancel_requested.set()

    def unregister(self, job_id: str) -> None:
        with self._active_lock:
            self._active.pop(job_id, None)

    def was_cancelled(self, job_id: str, published_at: Optional[datetime] = None) -> bool:
        """True when a cancel for this job arrived after the envelope was published.

        A cancel older than the envelope belongs to an earlier run (the API re-published the
        job on retry or after a lost worker) and must not stop the new one.
        """
        cancelled_at = self._recent_cancels.get(job_id)
        if cancelled_at is None:
            return False
        if published_at is None:
            return True
        return cancelled_at >= published_at

    def flush(self, timeout: float = 30.0) -> bool:
        """Wait until the broker confirmed every queued event (terminal events must not be lost).

        The outbox counts an event until the publisher thread marks it done, so the one in
        flight (or waiting to be sent again after a reconnect) is included.
        """
        deadline = time.monotonic() + timeout
        while self._outbox.unfinished_tasks and time.monotonic() < deadline:
            time.sleep(0.05)
        return not self._outbox.unfinished_tasks

    def stop(self) -> None:
        self._stop.set()

    # ---- thread body -------------------------------------------------------------------

    def run(self) -> None:  # pragma: no cover - exercised against a real broker
        while not self._stop.is_set():
            try:
                self._ensure_connection()
                self._tick()
            except Exception as error:  # noqa: BLE001 - keep the thread alive, reconnect
                logger.warning("event publisher: %s; reconnecting in %ss", error, self.reconnect_seconds)
                self._close()
                time.sleep(self.reconnect_seconds)
        self._close()

    def _ensure_connection(self) -> None:
        if self._connection is not None and self._connection.is_open:
            return
        params = pika.URLParameters(self.amqp_url)
        self._connection = pika.BlockingConnection(params)
        self._channel = self._connection.channel()
        # publisher confirms: basic_publish returns once the broker has the event, raises otherwise
        self._channel.confirm_delivery()
        self._channel.exchange_declare(EVENTS_EXCHANGE, exchange_type="topic", durable=True)
        self._channel.exchange_declare(CONTROL_EXCHANGE, exchange_type="fanout", durable=True)
        result = self._channel.queue_declare(queue="", exclusive=True, auto_delete=True)
        self._control_queue = result.method.queue
        self._channel.queue_bind(self._control_queue, CONTROL_EXCHANGE)
        logger.info("event publisher connected (control queue %s)", self._control_queue)

    def _tick(self) -> None:
        # 1. drain the outbox (block briefly so the loop is not busy). An event stays in flight until
        #    the broker confirmed it; if publishing fails it goes out first after the reconnect.
        if self._in_flight is None:
            try:
                self._in_flight = self._outbox.get(timeout=1.0)
            except queue.Empty:
                pass
        while self._in_flight is not None:
            self._publish(self._in_flight)
            self._in_flight = None
            self._outbox.task_done()
            try:
                self._in_flight = self._outbox.get_nowait()
            except queue.Empty:
                break
        # 2. heartbeats
        now = time.monotonic()
        if now - self._last_heartbeat >= self.heartbeat_seconds:
            self._last_heartbeat = now
            with self._active_lock:
                states = list(self._active.values())
            for state in states:
                self._publish(state.heartbeat_event(self.worker_id))
        # 3. control messages
        self._poll_control()
        # keep the connection alive
        self._connection.process_data_events(time_limit=0)

    def _publish(self, event: JobEvent) -> None:
        self._channel.basic_publish(
            exchange=EVENTS_EXCHANGE,
            routing_key=event.routing_key(),
            body=event.to_json().encode("utf-8"),
            properties=pika.BasicProperties(delivery_mode=2, content_type="application/json",
                                            message_id=f"{event.jobId}:{event.event}:{int(event.at.timestamp()*1000)}"),
        )

    def _poll_control(self) -> None:
        if not self._control_queue:
            return
        for _ in range(100):
            method, _props, body = self._channel.basic_get(self._control_queue, auto_ack=True)
            if method is None:
                break
            self.handle_control(body)

    def handle_control(self, body: bytes) -> None:
        """Applies one control message (public for tests)."""
        try:
            control = JobControl.model_validate(json.loads(body))
        except Exception as error:  # noqa: BLE001
            logger.warning("ignoring malformed control message: %s", error)
            return
        if control.action == "cancel":
            self._recent_cancels[control.jobId] = utcnow()
            while len(self._recent_cancels) > 1000:
                self._recent_cancels.popitem(last=False)
            with self._active_lock:
                state = self._active.get(control.jobId)
            if state is not None:
                state.cancel_requested.set()
                logger.info("cancel requested", extra={"jobId": control.jobId})

    def _close(self) -> None:
        try:
            if self._connection is not None and self._connection.is_open:
                self._connection.close()
        except Exception:  # noqa: BLE001
            pass
        self._connection = None
        self._channel = None
        self._control_queue = None
