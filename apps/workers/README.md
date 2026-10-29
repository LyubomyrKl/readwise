# Workbench workers

One Python process (`python -m worker`) that consumes the reader tool's job queue
`q.py.reader` and runs two handlers. It never touches the database: a job arrives as
an envelope with everything the handler needs, and the handler reports back through
events the API applies to the `Job` row (see `packages/contracts/jobs`).

| Job type | Does |
|---|---|
| `reader.extract` | downloads the uploaded PDF/EPUB from the books bucket, extracts text (pdfplumber / ebooklib), stores markdown in the extractions bucket, returns `extractionStorageKey` |
| `reader.summarize` | waits for the Ollama host if it is down, segments the text, runs the async summarization pipeline, checkpoints per section in the checkpoints bucket, stores JSON in the summaries bucket, returns `storageKey` |

Layout:

```
worker/
  __main__.py              entry point (python -m worker --queues reader)
  platform/                settings, JSON logging, contracts (pydantic), queue consumer,
                           event publisher + heartbeats + cancel listener, job runner, S3, LLM probe
  tools/reader/
    handlers.py            bindings and handler factory of the reader tool
    extract/               the extract handler and the PDF/EPUB extractors
    summarize/             the summarize handler and the pipeline packages
```

Long jobs: the queue message is acknowledged as soon as it is claimed; a heartbeat
thread emits `progress` every `WORKER_HEARTBEAT_SECONDS` so the API can tell a
running job from a dead worker (lease of `JOBS_LEASE_SECONDS` on the API side). A
`POST /jobs/:id/cancel` reaches the worker through the fanout exchange
`workbench.job-control`; the summarize handler stops between sections and keeps
its checkpoint (which also holds the segmentation, so a resume lines up with the
finished sections). On SIGTERM a running job stops at the same points and is
reported as a retryable `failed`, so the API runs it again; one that cannot stop
within `WORKER_SHUTDOWN_GRACE_SECONDS` (default 8, below Docker's 10 s stop
timeout) is reported the same way just before the process exits.

## Run

- In Docker: the root `docker-compose.yml` builds `apps/workers/Dockerfile` from the repository root.
- Locally: Python 3.11, then

  ```bash
  cp .env.example .env            # point at the Docker infrastructure and your Ollama host
  pip install -e ".[dev]"
  python -m worker --queues reader
  ```

`PIPELINE_MODE` selects the `fast`, `balanced` or `quality` preset; the strategy and
the summary type come from each job.

## Tests

```bash
../../scripts/test-workers.sh    # pytest inside python:3.11-slim with the pinned dependencies
pytest                           # if you already have a 3.11 environment with the dev extra installed
```

The contract tests read the fixtures in `../../packages/contracts/jobs/fixtures`.
