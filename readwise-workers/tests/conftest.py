"""Shared test setup for the workers.

The workers were written as scripts that read configuration from the
environment at import time and talk to Postgres through a generated Prisma
client. This file makes them importable without a database, a broker, S3 or
an LLM host so the rules inside them can be tested in isolation.
"""
import importlib.util
import os
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTRACTION_DIR = ROOT / "workers" / "extraction-worker"
SUMMARIZATION_DIR = ROOT / "workers" / "summarization-worker"

# Connection settings that module-level code reads eagerly. Nothing connects.
_DEFAULTS = {
    "DATABASE_URL": "postgresql://test:test@localhost:5432/test",
    "POSTGRES_HOST": "localhost",
    "POSTGRES_USER": "test",
    "POSTGRES_PASSWORD": "test",
    "RABBITMQ_HOST": "localhost",
    "RABBITMQ_USER": "test",
    "RABBITMQ_PASS": "test",
    "S3_HOST": "localhost",
    "S3_ACCESS_KEY_ID": "test",
    "S3_SECRET_ACCESS_KEY": "test",
    "OLLAMA_BASE_URL": "http://ollama.invalid:11434",
    "OLLAMA_MODEL": "test-model",
    "OLLAMA_EMBED_MODEL": "test-embed",
}
for key, value in _DEFAULTS.items():
    os.environ.setdefault(key, value)

for path in (ROOT, SUMMARIZATION_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))


def _install_prisma_stub() -> None:
    """Provide a minimal `prisma` module when the generated client is unavailable.

    prisma-client-py raises when `Prisma` is accessed until `prisma generate` has
    run. The unit tests never touch the database, so a stub with the same
    surface suffices.
    """
    try:
        # The package itself always imports; the generated client is only
        # resolved on attribute access, so probe for the class explicitly.
        from prisma import Prisma  # noqa: F401
        return
    except Exception:
        sys.modules.pop("prisma", None)

    class _Table:
        def __init__(self):
            self.calls = []

        async def find_unique(self, **kwargs):
            self.calls.append(("find_unique", kwargs))
            return None

        async def update(self, **kwargs):
            self.calls.append(("update", kwargs))
            return kwargs

    class Prisma:
        def __init__(self, *args, **kwargs):
            self.book = _Table()
            self.connected = False

        async def connect(self):
            self.connected = True

        async def disconnect(self):
            self.connected = False

    stub = types.ModuleType("prisma")
    stub.Prisma = Prisma
    sys.modules["prisma"] = stub


_install_prisma_stub()


def load_module_from_path(name: str, path: Path):
    """Import a script file (for example a worker's main.py) under an explicit module name."""
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module
