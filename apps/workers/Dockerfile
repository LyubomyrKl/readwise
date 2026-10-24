# syntax=docker/dockerfile:1.7
# Build from the repository root:  docker build -f apps/workers/Dockerfile -t workbench-workers .

FROM python:3.11-slim
WORKDIR /app

# tesseract + poppler for extraction, libatomic1 for the Prisma engine, procps for the health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-eng poppler-utils libatomic1 procps \
    && rm -rf /var/lib/apt/lists/*

# dependencies first, for layer caching
COPY apps/workers/pyproject.toml ./
COPY apps/workers/shared ./shared
RUN pip install --no-cache-dir .

# sources
COPY apps/workers/schema.prisma apps/workers/main.py apps/workers/entrypoint.sh ./
COPY apps/workers/workers ./workers
RUN prisma generate \
    && python -c "import nltk; [nltk.download(p, quiet=True) for p in ('punkt', 'punkt_tab')]" \
    && chmod +x entrypoint.sh

ENV PYTHONPATH=/app PYTHONUNBUFFERED=1
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD pgrep -f "python main.py" > /dev/null || exit 1
ENTRYPOINT ["./entrypoint.sh"]
