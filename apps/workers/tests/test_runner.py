"""Ack on claim, the event sequence of a job, failures, cancellation and stopping the worker."""
import signal
import threading
import time
from unittest.mock import MagicMock

import pytest

from conftest import FakePublisher, make_envelope
from worker.platform.contracts import JobEvent
from worker.platform.events import utcnow
from worker.platform.jobs import JobCancelled, JobFailed, JobRunner
from worker.platform.queue import JobConsumer


def _runner(settings, storage, publisher, handlers):
    return JobRunner(settings, storage, publisher, handlers)


def test_success_emits_started_progress_succeeded_with_result(settings, storage, publisher):
    def handler(ctx):
        ctx.progress("working", 40)
        return {"extractionStorageKey": "extraction/book-1_extraction.md"}

    outcome = _runner(settings, storage, publisher, {"reader.extract": handler}).handle(make_envelope())

    assert outcome == "succeeded"
    assert publisher.kinds() == ["started", "progress", "succeeded"]
    started, progress, done = publisher.events
    assert started.attempt == 1 and started.workerId == "workers-test"
    assert (progress.stage, progress.progress) == ("working", 40)
    assert done.result == {"extractionStorageKey": "extraction/book-1_extraction.md"} and done.progress == 100
    assert publisher.flushed >= 1 and publisher.states == {}


def test_exception_is_a_retryable_failure_and_job_failed_controls_retryable(settings, storage, publisher):
    def boom(ctx):
        raise RuntimeError("disk full")

    assert _runner(settings, storage, publisher, {"reader.extract": boom}).handle(make_envelope()) == "failed"
    assert publisher.last().event == "failed"
    assert publisher.last().retryable is True
    assert "disk full" in publisher.last().error

    publisher.events.clear()

    def unsupported(ctx):
        raise JobFailed("Unsupported file type: text/plain", retryable=False)

    _runner(settings, storage, publisher, {"reader.extract": unsupported}).handle(make_envelope())
    assert publisher.last().event == "failed" and publisher.last().retryable is False
    assert publisher.last().error == "Unsupported file type: text/plain"


def test_cancel_during_run_ends_with_cancelled(settings, storage, publisher):
    def slow(ctx):
        ctx.progress("section 1/3", 10)
        publisher.cancel_now(ctx.job_id)  # the control message arrives
        ctx.check_cancelled()
        raise AssertionError("must not get here")

    outcome = _runner(settings, storage, publisher, {"reader.extract": slow}).handle(make_envelope())

    assert outcome == "cancelled"
    assert publisher.kinds() == ["started", "progress", "cancelled"]


def test_job_cancelled_before_start_is_not_run(settings, storage, publisher):
    handler = MagicMock()
    publisher.cancelled.add("job-1")

    outcome = _runner(settings, storage, publisher, {"reader.extract": handler}).handle(make_envelope())

    assert outcome == "cancelled"
    handler.assert_not_called()
    assert publisher.kinds() == ["cancelled"]


def test_unknown_type_fails_without_retry(settings, storage, publisher):
    outcome = _runner(settings, storage, publisher, {}).handle(make_envelope(type="reader.other"))
    assert outcome == "failed"
    assert publisher.last().retryable is False


def test_waiting_event_carries_reason_and_heartbeat_repeats_it(make_ctx, publisher):
    ctx = make_ctx()
    ctx.progress("segmenting", 3)
    ctx.waiting("LLM host unreachable: http://ollama.invalid:11434")

    waiting = publisher.last()
    assert (waiting.event, waiting.stage, waiting.progress) == ("waiting", "segmenting", 3)
    assert waiting.reason == "LLM host unreachable: http://ollama.invalid:11434"
    heartbeat = publisher.states["job-1"].heartbeat_event("workers-test")
    assert heartbeat.event == "waiting" and heartbeat.reason == waiting.reason

    ctx.progress("segmenting", 4)
    assert publisher.states["job-1"].heartbeat_event("workers-test").event == "progress"


def test_consumer_acks_on_claim_before_running_and_dead_letters_garbage(settings):
    seen = []
    channel = MagicMock()
    method = MagicMock(delivery_tag=7)

    def on_envelope(envelope):
        channel.basic_ack.assert_called_once_with(delivery_tag=7)  # already acknowledged
        seen.append(envelope.jobId)

    consumer = JobConsumer(settings.amqp, "reader", ["jobs.reader.extract"], on_envelope)
    consumer.on_message(channel, method, None, make_envelope().model_dump_json().encode())
    assert seen == ["job-1"]

    channel.reset_mock()
    consumer.on_message(channel, method, None, b'{"v": 1, "bookId": "old-style message"}')
    channel.basic_nack.assert_called_once_with(delivery_tag=7, requeue=False)
    channel.basic_ack.assert_not_called()

    channel.reset_mock()
    consumer.on_message(channel, method, None, b"not json")
    channel.basic_nack.assert_called_once_with(delivery_tag=7, requeue=False)


def test_consumer_survives_a_handler_that_raises(settings):
    channel = MagicMock()
    method = MagicMock(delivery_tag=1)

    def explode(envelope):
        raise RuntimeError("runner bug")

    JobConsumer(settings.amqp, "reader", [], explode).on_message(channel, method, None, make_envelope().model_dump_json().encode())
    channel.basic_ack.assert_called_once()


def test_job_cancelled_is_the_exception_check_cancelled_raises(make_ctx, publisher):
    ctx = make_ctx()
    publisher.cancel_now("job-1")
    try:
        ctx.check_cancelled()
    except JobCancelled:
        pass
    else:
        raise AssertionError("expected JobCancelled")


def test_real_publisher_ignores_cancels_older_than_the_envelope():
    """A retry re-publishes a job id the worker may remember as cancelled."""
    from datetime import datetime, timedelta, timezone

    from worker.platform.events import EventPublisher

    publisher = EventPublisher("amqp://unused", "w", heartbeat_seconds=60)
    publisher.handle_control(b'{"v": 1, "jobId": "job-1", "action": "cancel"}')
    cancelled_at = publisher._recent_cancels["job-1"]

    assert publisher.was_cancelled("job-1")
    assert publisher.was_cancelled("job-1", cancelled_at - timedelta(seconds=5)), "published before the cancel: skip"
    assert not publisher.was_cancelled("job-1", cancelled_at + timedelta(seconds=5)), "re-published after the cancel: run"
    assert not publisher.was_cancelled("job-2", datetime.now(timezone.utc))
    publisher.handle_control(b"garbage")  # ignored


def test_a_stopping_worker_ends_the_job_at_its_next_safe_point_as_a_retryable_failure(settings, storage, publisher):
    runner = _runner(settings, storage, publisher, {})

    def summarize(ctx):
        ctx.progress("section 1/3 done", 30)
        runner.interrupt()  # SIGTERM
        ctx.check_cancelled()
        raise AssertionError("must not get here")

    runner.handlers = {"reader.extract": summarize}
    assert runner.handle(make_envelope()) == "failed"
    assert publisher.kinds() == ["started", "progress", "failed"]
    assert publisher.last().retryable is True and "worker stopped" in publisher.last().error

    publisher.events.clear()
    late = MagicMock()
    runner.handlers = {"reader.extract": late}
    assert runner.handle(make_envelope(jobId="job-2")) == "failed", "claimed while stopping: handed back"
    late.assert_not_called()
    assert publisher.kinds() == ["failed"] and publisher.last().retryable is True


def test_a_job_still_running_when_the_worker_exits_is_reported_once(settings, storage, publisher):
    started, release, done = threading.Event(), threading.Event(), threading.Event()

    def extract(ctx):  # one long step that cannot stop halfway
        started.set()
        release.wait(5)
        ctx.progress("late", 90)
        return {"extractionStorageKey": "k"}

    runner = _runner(settings, storage, publisher, {"reader.extract": extract})
    threading.Thread(target=lambda: (runner.handle(make_envelope()), done.set())).start()
    assert started.wait(5)

    runner.interrupt()
    assert runner.abandon() == ["job-1"]
    release.set()
    assert done.wait(5)

    assert publisher.kinds() == ["started", "failed"], "no progress or second terminal event after the report"
    assert publisher.last().retryable is True and publisher.states == {}


def _run_main(monkeypatch, settings, handler, grace):
    """`python -m worker --queues reader` with one delivery, fakes for the broker and S3, SIGTERM once the job runs."""
    import worker.__main__ as entry

    publisher = FakePublisher()
    publisher.start = publisher.stop = lambda: None
    signals, running, consumer_done = {}, threading.Event(), threading.Event()
    monkeypatch.setattr(entry, "get_settings", lambda: settings.model_copy(update={"worker_shutdown_grace_seconds": grace}))
    monkeypatch.setattr(entry, "configure_logging", lambda level: None)
    monkeypatch.setattr(entry, "EventPublisher", lambda *args: publisher)
    monkeypatch.setattr(entry, "S3Storage", MagicMock())
    monkeypatch.setattr(entry.signal, "signal", lambda signum, handler_: signals.setdefault(signum, handler_))

    def job(ctx):
        running.set()
        return handler(ctx)

    monkeypatch.setattr(entry, "_tools", lambda: {"reader": (["jobs.reader.summarize"], lambda s, st: {"reader.summarize": job})})

    def run_forever(consumer):  # one delivery, then idle until stopped
        consumer.on_envelope(make_envelope(type="reader.summarize"))
        consumer._stop.wait(5)
        consumer_done.set()

    monkeypatch.setattr(entry.JobConsumer, "run_forever", run_forever)
    threading.Thread(target=lambda: running.wait(5) and signals[signal.SIGTERM](signal.SIGTERM, None)).start()
    started_at = time.monotonic()
    assert entry.main(["--queues", "reader"]) == 0
    return publisher, time.monotonic() - started_at, consumer_done


def test_sigterm_lets_the_running_job_stop_between_sections(settings, monkeypatch):
    def summarize(ctx):
        while True:  # a section ends every 10 ms
            time.sleep(0.01)
            ctx.check_cancelled()

    publisher, seconds, consumer_done = _run_main(monkeypatch, settings, summarize, grace=5)

    assert publisher.kinds() == ["started", "failed"] and publisher.last().retryable is True
    assert seconds < 2 and consumer_done.is_set(), "the consumer thread ended within the grace period"


def test_sigterm_reports_a_job_that_cannot_stop_within_the_grace_period(settings, monkeypatch):
    release = threading.Event()

    def extract(ctx):
        release.wait(5)
        ctx.progress("late", 90)
        return {"extractionStorageKey": "k"}

    publisher, seconds, consumer_done = _run_main(monkeypatch, settings, extract, grace=0.2)

    assert publisher.kinds() == ["started", "failed"] and publisher.last().retryable is True
    release.set()
    assert consumer_done.wait(5)
    assert publisher.kinds() == ["started", "failed"], "nothing reported after the process gave up on the job"


def test_publisher_resends_an_event_it_failed_to_publish_first_and_flush_waits_for_it():
    from pika.exceptions import StreamLostError

    from worker.platform.events import EventPublisher

    publisher = EventPublisher("amqp://unused", "w", heartbeat_seconds=60)
    publisher._connection = MagicMock()          # what _ensure_connection() opened
    publisher._last_heartbeat = time.monotonic()  # no heartbeat in these ticks
    sent, broken = [], {"now": True}

    def publish(event):
        if event.event == "succeeded" and broken["now"]:
            raise StreamLostError("Transport indicated EOF")
        sent.append(event.event)

    publisher._publish = publish
    for kind in ("progress", "succeeded", "progress"):
        publisher.emit(JobEvent(jobId="job-1", event=kind, at=utcnow(), workerId="w"))

    with pytest.raises(StreamLostError):
        publisher._tick()  # run() reconnects after this
    assert sent == ["progress"]
    assert publisher.flush(timeout=0.1) is False, "the terminal event is not confirmed yet"

    broken["now"] = False
    publisher._tick()
    assert sent == ["progress", "succeeded", "progress"], "nothing lost, nothing reordered"
    assert publisher.flush(timeout=0.1) is True


def test_publisher_waits_for_broker_confirms(monkeypatch):
    from worker.platform import events

    connection = MagicMock()
    monkeypatch.setattr(events.pika, "BlockingConnection", lambda params: connection)

    events.EventPublisher("amqp://guest:guest@localhost:5672/", "w")._ensure_connection()

    connection.channel.return_value.confirm_delivery.assert_called_once_with()
