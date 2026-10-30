"""The engine's one LLM client: Ollama's native chat API, one request at a time, numbers per call.

- `think: false`: the answer only, no reasoning tokens.
- `num_ctx` on every request, so the context is what the engine budgets for whatever the server's
  default is (Ollama's own default of 4,096 tokens silently cut the old pipeline's prompts).
- Server token counts and durations are kept per model: they become the job's metrics.
- A reply cut by `num_predict` is reported (`truncated`), never passed off as complete.
"""

from __future__ import annotations

import base64
import time
from dataclasses import asdict, dataclass, field
from typing import Optional

import httpx


class LLMUnavailable(Exception):
    """The host did not answer: wait for it, then repeat the call."""


class LLMError(Exception):
    """The host answered with an error."""


class ModelMissing(LLMError):
    """The model is not pulled on the host: retrying will not help."""


@dataclass
class Reply:
    text: str
    model: str
    prompt_tokens: int = 0
    output_tokens: int = 0
    seconds: float = 0.0
    load_seconds: float = 0.0
    done_reason: str = ""

    @property
    def truncated(self) -> bool:
        return self.done_reason == "length"


@dataclass
class Usage:
    calls: int = 0
    prompt_tokens: int = 0
    output_tokens: int = 0
    seconds: float = 0.0
    load_seconds: float = 0.0
    truncated: int = 0

    def add(self, reply: Reply) -> None:
        self.calls += 1
        self.prompt_tokens += reply.prompt_tokens
        self.output_tokens += reply.output_tokens
        self.seconds += reply.seconds
        self.load_seconds += reply.load_seconds
        self.truncated += int(reply.truncated)

    def to_json(self) -> dict:
        data = asdict(self)
        data["seconds"] = round(self.seconds, 1)
        data["load_seconds"] = round(self.load_seconds, 1)
        data["output_tokens_per_second"] = round(self.output_tokens / self.seconds, 1) if self.seconds else 0.0
        return data


@dataclass
class OllamaClient:
    base_url: str
    num_ctx: int = 32768
    timeout: float = 900.0
    keep_alive: str = "30m"
    transport: Optional[httpx.BaseTransport] = None
    usage: dict[str, Usage] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self._http = httpx.Client(base_url=self.base_url.rstrip("/"), transport=self.transport,
                                  timeout=httpx.Timeout(self.timeout, connect=10.0))

    def close(self) -> None:
        self._http.close()

    def chat(self, model: str, messages: list[dict] | str, *, num_predict: int, temperature: float = 0.2,
             top_p: float = 0.9, images: Optional[list[bytes]] = None) -> Reply:
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
        if images:
            messages = [dict(m) for m in messages]
            messages[-1]["images"] = [base64.b64encode(image).decode("ascii") for image in images]
        body = {"model": model, "stream": False, "think": False, "keep_alive": self.keep_alive, "messages": messages,
                "options": {"temperature": temperature, "top_p": top_p, "num_predict": int(num_predict),
                            "num_ctx": self.num_ctx}}
        started = time.perf_counter()
        response = self._post(body)
        if response.status_code == 400 and "think" in response.text.lower():
            body.pop("think")                      # a model that rejects the flag altogether
            response = self._post(body)
        if response.status_code == 404 and "not found" in response.text.lower():
            raise ModelMissing(f"model {model} is not available on the LLM host (ollama pull {model})")
        if response.status_code >= 400:
            raise LLMError(f"LLM host answered {response.status_code}: {response.text[:300]}")
        data = response.json()
        reply = Reply(
            text=(data.get("message") or {}).get("content", "") or "",
            model=model,
            prompt_tokens=int(data.get("prompt_eval_count") or 0),
            output_tokens=int(data.get("eval_count") or 0),
            seconds=round(time.perf_counter() - started, 3),
            load_seconds=round((data.get("load_duration") or 0) / 1e9, 3),
            done_reason=str(data.get("done_reason") or ""),
        )
        self.usage.setdefault(model, Usage()).add(reply)
        return reply

    def _post(self, body: dict) -> httpx.Response:
        try:
            return self._http.post("/api/chat", json=body)
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.RemoteProtocolError, httpx.ReadError,
                httpx.WriteError, httpx.PoolTimeout) as error:
            raise LLMUnavailable(f"{type(error).__name__}: {error}") from error
        except httpx.ReadTimeout as error:
            raise LLMError(f"no answer within {self.timeout:.0f} s") from error

    def models(self) -> set[str]:
        """Names of the models pulled on the host ("name" and "name:latest" both listed)."""
        try:
            response = self._http.get("/api/tags")
        except httpx.HTTPError as error:
            raise LLMUnavailable(f"{type(error).__name__}: {error}") from error
        if response.status_code >= 400:
            raise LLMError(f"LLM host answered {response.status_code}: {response.text[:300]}")
        names: set[str] = set()
        for entry in response.json().get("models", []):
            for name in (entry.get("name"), entry.get("model")):
                if name:
                    names.add(name)
                    if name.endswith(":latest"):
                        names.add(name[: -len(":latest")])
        return names

    def usage_json(self) -> dict:
        return {model: usage.to_json() for model, usage in self.usage.items()}
