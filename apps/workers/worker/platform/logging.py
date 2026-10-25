"""JSON logs with the same field names as the API (context, jobId, toolId, type, stage)."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Mapping

JOB_FIELDS = ("jobId", "toolId", "type", "attempt", "stage", "workerId", "requestId")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line: dict[str, Any] = {
            "level": record.levelname.lower(),
            "time": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "context": record.name,
            "msg": record.getMessage(),
        }
        for field in JOB_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                line[field] = value
        if record.exc_info:
            line["err"] = self.formatException(record.exc_info)
        return json.dumps(line, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # third-party chatter
    for noisy in ("pika", "botocore", "boto3", "urllib3", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


class JobLogger(logging.LoggerAdapter):
    """A logger that stamps every line with the job's identity."""

    def process(self, msg: str, kwargs: Mapping[str, Any]):
        extra = dict(kwargs.get("extra") or {})
        extra.update(self.extra or {})
        return msg, {**kwargs, "extra": extra}


def job_logger(name: str, **fields: Any) -> JobLogger:
    return JobLogger(logging.getLogger(name), fields)
