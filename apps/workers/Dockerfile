# syntax=docker/dockerfile:1.7
# Build from the repository root:  docker build -f apps/workers/Dockerfile -t workbench-workers .

FROM python:3.11-slim
WORKDIR /app

# tesseract + poppler for extraction, procps for the health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-eng poppler-utils procps \
    && rm -rf /var/lib/apt/lists/*

# dependencies first, for layer caching
COPY apps/workers/pyproject.toml ./
RUN mkdir -p worker && touch worker/__init__.py && pip install --no-cache-dir . && rm -rf worker build *.egg-info

# sources
COPY apps/workers/worker ./worker
RUN pip install --no-cache-dir --no-deps . \
    && python -c "import nltk; [nltk.download(p, quiet=True) for p in ('punkt', 'punkt_tab')]"

ENV PYTHONUNBUFFERED=1
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD pgrep -f "python -m worker" > /dev/null || exit 1
CMD ["python", "-m", "worker"]
