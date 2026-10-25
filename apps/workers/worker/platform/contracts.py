"""Pydantic mirror of packages/contracts/jobs (tested against the same fixtures as the API's zod mirror)."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

CONTRACT_VERSION = 1
JOB_TYPE_PATTERN = r"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$"

EventKind = Literal["started", "progress", "waiting", "succeeded", "failed", "cancelled"]


class JobEnvelope(BaseModel):
    """A job as published by the API to exchange workbench.jobs (routing key jobs.<type>)."""

    model_config = ConfigDict(extra="forbid")

    v: Literal[1]
    jobId: str = Field(min_length=1)
    type: str = Field(pattern=JOB_TYPE_PATTERN)
    toolId: str = Field(min_length=1)
    userId: str = Field(min_length=1)
    attempt: int = Field(ge=1)
    publishedAt: AwareDatetime
    correlationId: Optional[str] = Field(default=None, min_length=1)
    payload: dict[str, Any]


class JobEvent(BaseModel):
    """A progress report to exchange workbench.job-events (routing key job.<event>)."""

    model_config = ConfigDict(extra="forbid")

    v: Literal[1] = 1
    jobId: str = Field(min_length=1)
    event: EventKind
    at: AwareDatetime
    workerId: str = Field(min_length=1)
    attempt: Optional[int] = Field(default=None, ge=1)
    stage: Optional[str] = Field(default=None, max_length=200)
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    reason: Optional[str] = Field(default=None, max_length=2000)
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = Field(default=None, max_length=4000)
    retryable: Optional[bool] = None

    def routing_key(self) -> str:
        return f"job.{self.event}"

    def to_json(self) -> str:
        return self.model_dump_json(exclude_none=True)


class JobControl(BaseModel):
    """A control message from the API to all workers (fanout workbench.job-control)."""

    model_config = ConfigDict(extra="forbid")

    v: Literal[1]
    jobId: str = Field(min_length=1)
    action: Literal["cancel"]
