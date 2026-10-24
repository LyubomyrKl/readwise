# Pipeline speed backlog (separate track, not part of the Workbench refactor)

Date: 2026-10-24
Status: parked. Start after the refactor in `docs/toolbox-architecture-plan.md` is done, or any time as an independent effort. Nothing in the refactor depends on this, and nothing here should be mixed into refactor commits.

## Baseline

- One book can take up to 12 hours end to end (your report). No measurements exist yet.
- The refactor's `Job` table records `startedAt`, `finishedAt` and `stage` per job, with extraction and summarization as separate jobs. That is the only overlap and gives this track its baseline for free.

## Observations from the code (not verified at runtime)

1. **Client concurrency vs server parallelism.** `config/settings.py` sets `llm_max_concurrent = 5`, but Ollama serves requests according to `OLLAMA_NUM_PARALLEL` on the host. If that is 1, the five concurrent requests only queue. Check the host setting first; it is the cheapest possible win or non-win.
2. **Calls per chunk depend on the preset.** `PIPELINE_MODE` (default `balanced`) selects a `PipelineBuilder` preset. `balanced` = structured summary + validation (2 attempts) + overlap dedup + hierarchical merge + running context. `quality` adds semantic chunking (embeddings), entity tracking (extra LLM calls), the two-pass strategy (2x calls) and 3 validation attempts. Each enabled feature multiplies LLM calls; `fast` disables all of them.
3. **Segmentation runs before summarization.** `segmentation/` (`DeterministicSegmenter`, `llm_verifier.py`, `topic_detection.py`, `ollama_client.py`) calls Ollama for embeddings and JSON verification over the whole book. Its share of total time is unknown; measure it as its own stage.
4. **Target length is hard-coded higher than the worker default.** The gateway publishes `summaryPercent: 0.4` (`rabbitmq.service.ts`) while the worker defaults to 0.3. Longer targets mean more output tokens per call.
5. **Validation retries regenerate whole chunk summaries.** `validation_max_attempts` and the coverage/coherence thresholds in `config/settings.py` control how often that happens.
6. **Model choice is the biggest lever.** `OLLAMA_MODEL` (README example `qwen2.5:14b-instruct-q5_k_m`). The `AsyncLLMClient` speaks the OpenAI-compatible API, so a smaller local model for a draft mode, or a hosted API for the summarize step, is a configuration change once the client's base URL and key are made provider-switchable.
7. **Interrupted runs may be repeating work today.** If RabbitMQ's default 30-minute consumer timeout is interrupting long deliveries (see the plan, §1.7), each redelivery re-runs segmentation before resuming from the per-section checkpoint. The refactor's ack-on-claim removes that; measure before and after.
8. **Checkpoint granularity is per section.** Very long sections mean long re-runs after any interruption. Finer checkpoints (per subsection) would reduce lost work.

## Suggested approach when this track starts

1. Pick one fixed test book and capture per-stage timings from the `Job` records.
2. Run it under `fast`, `balanced` and `quality`, record time and judge output quality by eye.
3. Count LLM calls per run (log a counter in `AsyncLLMClient`) to see which feature dominates.
4. Decide defaults and whether to expose a "draft vs full" choice in the summary dialog.
5. Only then consider model or provider changes.
