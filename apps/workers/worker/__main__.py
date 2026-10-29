"""`python -m worker [--queues reader]`: consume the tools' job queues until stopped."""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading
import time

from worker.platform.events import EventPublisher
from worker.platform.jobs import JobRunner
from worker.platform.logging import configure_logging
from worker.platform.queue import JobConsumer
from worker.platform.settings import get_settings
from worker.platform.storage import S3Storage

logger = logging.getLogger("worker")

# tool id -> (bindings, handler factory). Adding a Python tool means one line here.
def _tools():
    from worker.tools.reader import handlers as reader

    return {
        reader.TOOL_ID: (reader.BINDINGS, reader.build_handlers),
    }


def main(argv: list[str] | None = None) -> int:
    settings = get_settings()
    parser = argparse.ArgumentParser(prog="worker", description="Workbench Python job worker")
    parser.add_argument("--queues", default=settings.worker_queues,
                        help="comma-separated tool ids to consume (default: %(default)s)")
    args = parser.parse_args(argv)
    configure_logging(settings.log_level)

    tools = _tools()
    tool_ids = [t.strip() for t in args.queues.split(",") if t.strip()]
    unknown = [t for t in tool_ids if t not in tools]
    if unknown or not tool_ids:
        logger.error("unknown tool(s) %s; known: %s", unknown, sorted(tools))
        return 2

    storage = S3Storage.from_settings(settings)
    publisher = EventPublisher(settings.amqp, settings.worker_id, settings.worker_heartbeat_seconds,
                               settings.worker_reconnect_seconds)
    publisher.start()

    handlers = {}
    consumers: list[JobConsumer] = []
    for tool_id in tool_ids:
        bindings, factory = tools[tool_id]
        handlers.update(factory(settings, storage))
        consumers.append(JobConsumer(settings.amqp, tool_id, bindings, on_envelope=None,  # set below
                                     prefetch=settings.worker_prefetch_count,
                                     reconnect_seconds=settings.worker_reconnect_seconds))
    runner = JobRunner(settings, storage, publisher, handlers)
    for consumer in consumers:
        consumer.on_envelope = runner.handle

    stop = threading.Event()

    def shutdown(signum, _frame):
        logger.info("signal %s received, stopping: a running job stops at its next safe point", signum)
        stop.set()
        runner.interrupt()
        for consumer in consumers:
            consumer.stop()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    logger.info("worker %s starting: tools=%s handlers=%s", settings.worker_id, tool_ids, sorted(handlers))
    threads = [threading.Thread(target=c.run_forever, name=f"consumer-{c.tool_id}", daemon=True) for c in consumers]
    for thread in threads:
        thread.start()
    try:
        while not stop.is_set() and any(t.is_alive() for t in threads):
            stop.wait(1.0)
        # A running job stops at its next safe point (the summarizer: between sections, keeping its
        # checkpoint) and reports a retryable failure. One that cannot within the grace period is
        # reported here instead; the consumer threads are daemons and end with the process.
        deadline = time.monotonic() + settings.worker_shutdown_grace_seconds
        for thread in threads:
            thread.join(max(0.0, deadline - time.monotonic()))
        for job_id in runner.abandon():
            logger.warning("job still running after %ss, reported for a retry", settings.worker_shutdown_grace_seconds,
                           extra={"jobId": job_id})
    finally:
        publisher.flush()
        publisher.stop()
    logger.info("worker stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
