# Workbench workers

One Python process (`python -m worker`) that consumes the reader tool's job queues and runs four
handlers. It never touches the database: a job arrives as an envelope with everything the handler
needs, and the handler reports back through events the API applies to the `Job` row (see
`packages/contracts/jobs`).

| Queue | Job type | Does |
|---|---|---|
| `q.py.reader_fast` | `reader.ingest` | right after upload: reads the file's structure once (EPUB contents, PDF outline or fonts), its pictures (captions, decorative or not, drop caps) and language into the document IR, stored under the file's SHA-256 in the extractions bucket; returns `irStorageKey` |
| `q.py.reader_fast` | `reader.extract` | the old summarizer's input: PDF/EPUB to markdown in the extractions bucket |
| `q.py.reader` | `reader.abridge` | the abridged edition: per chapter a short summary and the text abridged part by part to a target set by how dense each part is, the pictures kept and described, a fact-check, an EPUB in the books bucket that the API adds to the library |
| `q.py.reader` | `reader.summarize` | the old summarizer (segmentation, chunk summaries, merges), kept until the edition has been validated on the owner's books |

The two queues have one consumer thread each, so an upload's ingest never waits behind a book.

Layout:

```
worker/
  __main__.py              entry point (python -m worker --queues reader,reader_fast)
  platform/                settings, JSON logging, contracts (pydantic), queue consumer,
                           event publisher + heartbeats + cancel listener, job runner, S3, LLM probe
  bench/                   python -m worker.bench: ingest and editions on local files, no infrastructure
  tools/reader/
    handlers.py            queues, bindings and handler factories of the reader tool
    ingest/                the document IR: EPUB and PDF readers, section kinds, pictures, language
    abridge/               the edition: plan, density targets, chapter pass, checks, fact-check,
                           pictures, OCR, manifest (resume), EPUB, the handler
    extract/               the extract handler and the PDF/EPUB extractors (old summarizer)
    summarize/             the summarize handler and the pipeline packages (old summarizer)
```

## The abridged edition

docs/summarizer-investigation.md has the design and the measurements behind each rule. In short:

1. **Plan.** The book's own chapters, in order, from the IR; front and back matter left out (contents,
   copyright, index, notes, bibliography, licence); parts become dividers; a chapter up to 12,000 words
   is one unit with its subsections as headings inside it.
2. **Chapter pass** (`chapter.py`): a 120-180 word summary of the chapter (of its segments, then of
   the segment summaries, when it does not fit one request), then parts of about 1,200 words in
   order. Each part gets the chapter summary and the last two sentences of the abridgement so far,
   and an explicit word target from its density score (`density.py`: names and numbers, sentence
   length, reasoning words, new vocabulary, abstract nouns, dialogue): 15-50% for `standard`,
   12-38% `short`, 20-55% `long`.
3. **Checks** on every part (`checks.py`): length band, language purity (no Russian in Ukrainian, no
   Ukrainian in Russian), Latin look-alike letters inside Cyrillic words, names and numbers against
   the source with near-miss names corrected. A part outside its band or breaking the language rule
   is retried once in the same conversation.
4. **Pictures** (`figures.py`): informative ones (key, or all) are described by the vision model and
   enter the text as `[[FIG n: caption — description]]`; the model places `[[FIG n]]`, and a marker it
   drops is put back at the same relative place.
5. **Fact-check** (`factcheck.py`), book-wide so each model loads once: the checker lists suspected
   errors per part, a noise filter drops non-errors, the writer confirms each (YES/NO) and rewrites
   the sentence, and a rewrite replaces it only when the writer prefers it to the original in both
   orders, so a fix can never make the text worse than no check.
6. **Overview and EPUB** (`edition.py`): the book overview from the chapter summaries, then the EPUB:
   the source's cover, the overview, every chapter with its summary box, the abridged text, the
   original pictures with their captions and the descriptions as alt text.

Scanned PDF pages are read by the vision model first (`ocr.py`, cached per page), then the IR is
rebuilt with their text. Progress is saved per chapter and stage in the checkpoints bucket
(`manifest.py`); a stopped job (cancel, restart, the Mac asleep) continues where it stopped.

Settings: `ABRIDGE_MODEL` (default `OLLAMA_MODEL`), `ABRIDGE_CHECK_MODEL` (empty: no fact-check),
`ABRIDGE_VISION_MODEL`, `ABRIDGE_FACTCHECK` (`dense` default, `all`, `off`), `ABRIDGE_OCR`,
`ABRIDGE_PROOFREAD` (Russian and Ukrainian slips listed by the writer and applied when spelling-sized,
`proofread.py`), `ABRIDGE_CALIBRATE_LENGTH` (ask for more words where the writer runs short: Ukrainian
×1.25, Russian ×1.08), `OLLAMA_NUM_CTX` (32768). The LLM host's own settings: docs/deploy.md, The LLM host.

Progress: the job reports its stage ("chapter 3 of 12: part 2 of 4", "fact-checking chapter 3 of 12",
"fixing …", "writing the book overview", "building the EPUB") with percentages that follow where the
time goes; the manifest holds every chapter's state, which `GET /api/reader/editions/:id/progress`
serves to the web app's progress view.

## Bench

```bash
python -m worker.bench structure book.epub                       # the IR: contents, kinds, sizes, units
python -m worker.bench abridge book.epub --out /tmp/run --chapters 2   # a real edition against Ollama
```

`abridge` keeps its objects under `<out>/store` (a second run resumes), writes `edition.epub`,
`result.json` (counts, warnings, tokens and seconds per model) and `parts.tsv` (per part: words in
and out, target, density, retries, checks, fixes, flags). Run it on a known chapter after any model
or Ollama update.

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
  python -m worker --queues reader,reader_fast
  ```

`PIPELINE_MODE` selects the `fast`, `balanced` or `quality` preset; the strategy and
the summary type come from each job.

## Tests

```bash
../../scripts/test-workers.sh    # pytest inside python:3.11-slim with the pinned dependencies
pytest                           # if you already have a 3.11 environment with the dev extra installed
```

The contract tests read the fixtures in `../../packages/contracts/jobs/fixtures`.
