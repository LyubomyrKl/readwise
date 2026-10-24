"""The message the extraction worker sends to the summarization queue."""
import json
from unittest.mock import MagicMock, patch

from shared.messaging import RabbitMQManager


def _publish(call):
    """Run `call(manager)` against a fake pika connection; return (channel, published)."""
    channel = MagicMock()
    connection = MagicMock()
    connection.channel.return_value = channel
    with patch("shared.messaging.pika.BlockingConnection", return_value=connection):
        manager = RabbitMQManager(amqp_url="amqp://test:test@localhost:5672/")
        call(manager)
    published = [
        (kwargs["routing_key"], json.loads(kwargs["body"]), kwargs["properties"])
        for _, kwargs in channel.basic_publish.call_args_list
    ]
    return channel, published


def test_send_summary_request_forwards_strategy_and_user():
    channel, published = _publish(
        lambda m: m.send_summary_request(
            "book-1", summary_type="abstractive", summary_percent=0.4,
            strategy="two_pass", user_id="user-1",
        )
    )

    assert len(published) == 1
    routing_key, body, props = published[0]
    assert routing_key == "summary_request"
    assert body == {
        "bookId": "book-1",
        "task": "summarize",
        "summaryType": "abstractive",
        "summaryPercent": 0.4,
        "summarizationStrategy": "two_pass",
        "userId": "user-1",
    }
    assert props.delivery_mode == 2, "summary requests must be persistent"
    channel.queue_declare.assert_called_once_with(queue="summary_request", durable=True)


def test_send_summary_request_omits_optional_fields_when_absent():
    _, published = _publish(lambda m: m.send_summary_request("book-1"))

    _, body, _ = published[0]
    assert body == {
        "bookId": "book-1",
        "task": "summarize",
        "summaryType": "extractive",
        "summaryPercent": 0.3,
    }
