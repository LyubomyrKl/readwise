"""Worker configuration from the environment (one source for every module)."""

from __future__ import annotations

import socket
from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    """Read from the environment; a local `.env` next to the package is honoured for development."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # ---- broker
    rabbitmq_host: str = "localhost"
    rabbitmq_port: int = 5672
    rabbitmq_user: str = "guest"
    rabbitmq_pass: str = "guest"
    # 0 disables AMQP heartbeats on the consumer connection: it sits idle for hours while a
    # job runs (the message was acknowledged on claim), and pika only answers heartbeats
    # between deliveries.
    rabbitmq_heartbeat: int = 0
    amqp_url: Optional[str] = None

    # ---- object storage
    s3_host: str = "localhost"
    s3_port: int = 9000
    s3_endpoint: Optional[str] = None
    s3_access_key_id: str = "minioadmin"
    s3_secret_access_key: str = "minioadmin"
    s3_book_bucket_name: str = "books"
    s3_extractions_bucket_name: str = "extractions"
    s3_summaries_bucket_name: str = "summaries"
    s3_checkpoints_bucket_name: str = "checkpoints"

    # ---- LLM host (Ollama, started by hand)
    ollama_base_url: str = ""
    ollama_model: str = ""
    ollama_embed_model: str = ""
    pipeline_mode: str = "balanced"

    # ---- this process
    worker_id: str = Field(default_factory=lambda: f"workers-{socket.gethostname()}")
    worker_queues: str = "reader"
    worker_prefetch_count: int = 1
    worker_heartbeat_seconds: int = 60
    worker_reconnect_seconds: int = 5
    worker_llm_wait_min_seconds: int = 30
    worker_llm_wait_max_seconds: int = 300
    log_level: str = "INFO"

    @property
    def amqp(self) -> str:
        if self.amqp_url:
            return self.amqp_url
        return (
            f"amqp://{self.rabbitmq_user}:{self.rabbitmq_pass}@{self.rabbitmq_host}:{self.rabbitmq_port}/"
            f"?heartbeat={self.rabbitmq_heartbeat}"
        )

    @property
    def s3_endpoint_url(self) -> str:
        return self.s3_endpoint or f"http://{self.s3_host}:{self.s3_port}"

    @property
    def tool_ids(self) -> list[str]:
        return [t.strip() for t in self.worker_queues.split(",") if t.strip()]


@lru_cache(maxsize=1)
def get_settings() -> WorkerSettings:
    return WorkerSettings()
