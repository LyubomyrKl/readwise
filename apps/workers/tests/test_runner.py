"""Ack on claim, the event sequence of a job, failures and cancellation."""
from unittest.mock import MagicMock

from conftest import make_envelope
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
