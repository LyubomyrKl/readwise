"""The job queue consumer: one tool queue, ack on claim, reconnect forever."""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Callable

import pika
from pika.exceptions import AMQPConnectionError, AMQPChannelError, StreamLostError

from worker.platform.contracts import JobEnvelope

logger = logging.getLogger(__name__)

JOBS_EXCHANGE = "workbench.jobs"
DLX_EXCHANGE = "workbench.dlx"


def queue_for_tool(tool_id: str) -> str:
    return f"q.py.{tool_id}"


def declare_tool_queue(channel, tool_id: str, bindings: list[str]) -> str:
    """Declares the tool's queue exactly like the API does (same arguments or the broker refuses)."""
    queue_name = queue_for_tool(tool_id)
    channel.exchange_declare(JOBS_EXCHANGE, exchange_type="topic", durable=True)
    channel.exchange_declare(DLX_EXCHANGE, exchange_type="direct", durable=True)
    channel.queue_declare(f"{queue_name}.dlq", durable=True)
    channel.queue_bind(f"{queue_name}.dlq", DLX_EXCHANGE, routing_key=queue_name)
    channel.queue_declare(
        queue_name,
        durable=True,
        arguments={"x-dead-letter-exchange": DLX_EXCHANGE, "x-dead-letter-routing-key": queue_name},
    )
    for key in bindings:
        channel.queue_bind(queue_name, JOBS_EXCHANGE, routing_key=key)
    return queue_name


class JobConsumer:
    """Consumes q.py.<tool>; each delivery is acknowledged as soon as it parses, then handled."""

    def __init__(self, amqp_url: str, tool_id: str, bindings: list[str],
                 on_envelope: Callable[[JobEnvelope], object], prefetch: int = 1,
                 reconnect_seconds: int = 5):
        self.amqp_url = amqp_url
        self.tool_id = tool_id
        self.bindings = bindings
        self.on_envelope = on_envelope
        self.prefetch = prefetch
        self.reconnect_seconds = reconnect_seconds
        self.queue_name = queue_for_tool(tool_id)
        self._stop = threading.Event()
        self._connection = None

    def on_message(self, channel, method, properties, body: bytes) -> None:
        """pika callback (public for tests)."""
        try:
            envelope = JobEnvelope.model_validate(json.loads(body))
        except Exception as error:  # noqa: BLE001 - malformed: dead-letter, never requeue
            logger.warning("dead-lettering malformed job message on %s: %s", self.queue_name, error)
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            return
        # Ack on claim: from here on the Job row (fed by our events) is the source of truth.
        channel.basic_ack(delivery_tag=method.delivery_tag)
        try:
            self.on_envelope(envelope)
        except Exception as error:  # noqa: BLE001 - the runner reports failures itself; never die here
            logger.error("unhandled error while running job %s: %s", envelope.jobId, error, exc_info=True)

    def stop(self) -> None:
        self._stop.set()
        connection = self._connection
        if connection is not None and connection.is_open:
            try:
                connection.add_callback_threadsafe(connection.close)
            except Exception:  # noqa: BLE001
                pass

    def run_forever(self) -> None:  # pragma: no cover - needs a broker
        while not self._stop.is_set():
            try:
                self._connection = pika.BlockingConnection(pika.URLParameters(self.amqp_url))
                channel = self._connection.channel()
                declare_tool_queue(channel, self.tool_id, self.bindings)
                channel.basic_qos(prefetch_count=self.prefetch)
                channel.basic_consume(queue=self.queue_name, on_message_callback=self.on_message, auto_ack=False)
                logger.info("consuming %s (%s)", self.queue_name, ", ".join(self.bindings))
                channel.start_consuming()
            except (AMQPConnectionError, AMQPChannelError, StreamLostError, OSError) as error:
                if self._stop.is_set():
                    break
                logger.warning("broker connection lost (%s); reconnecting in %ss", error, self.reconnect_seconds)
                time.sleep(self.reconnect_seconds)
            except KeyboardInterrupt:
                break
            finally:
                try:
                    if self._connection is not None and self._connection.is_open:
                        self._connection.close()
                except Exception:  # noqa: BLE001
                    pass
        logger.info("consumer for %s stopped", self.queue_name)
