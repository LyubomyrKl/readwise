"""reader.summarize: extraction markdown -> summary JSON in the summaries bucket.

Payload: { bookId, summaryId, extractionStorageKey, summaryType, strategy, summaryPercent, title? }
Result:  { storageKey, metadata: { original_tokens, summary_tokens, compression_ratio, summarization_strategy } }

The pipeline itself is unchanged; this module replaces the old worker's main.py:
it waits for the LLM host instead of failing, resumes from the S3 checkpoint
after a restart or a lost host, reports real stages, and stops between sections
when the job is cancelled.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Callable, Optional

from worker.platform.jobs import JobCancelled, JobContext, JobFailed
from worker.platform import llm
from worker.platform.settings import WorkerSettings
from worker.platform.storage import S3Storage
from worker.tools.reader.summarize.checkpoint import Checkpoint, CheckpointManager
from worker.tools.reader.summarize.config.settings import SummarizationStrategy

logger = logging.getLogger(__name__)

STRATEGY_MAP = {
    'basic': SummarizationStrategy.BASIC,
    'structured': SummarizationStrategy.STRUCTURED,
    'two_pass': SummarizationStrategy.TWO_PASS,
    'chain_of_density': SummarizationStrategy.CHAIN_OF_DENSITY,
    'hybrid': SummarizationStrategy.HYBRID,
}
KNOWN_SUMMARY_TYPES = ('extractive', 'abstractive')
DEFAULT_PERCENT = 0.4


def extracted_content(markdown: str) -> str:
    """The extractors wrap the text in a small markdown header; the pipeline wants the content."""
    if "## Content" in markdown:
        return markdown.split("## Content", 1)[1].strip()
    return markdown


def ensure_subsections(json_data: dict) -> dict:
    """Give every section without subsections one subsection carrying its own text.

    The pipeline summarizes subsection content only. The segmenter returns a
    section with its text in `content` and no subsections for documents too short
    to segment (and for any chapter it could not split), which used to produce a
    "successful" empty summary. Sections that already have subsections are left
    alone, so nothing is summarized twice.
    """
    for section in json_data.get("sections", []):
        if not isinstance(section, dict) or section.get("subsections"):
            continue
        content = (section.get("content") or "").strip()
        if not content:
            continue
        section["subsections"] = [{
            "id": f"{section.get('id', 'section')}-all",
            "title": section.get("title") or "Text",
            "level": "subsection",
            "start_char": section.get("start_char", 0),
            "end_char": section.get("end_char", len(content)),
            "content": content,
        }]
    return json_data


class SummarizeHandler:
    def __init__(self, settings: WorkerSettings, storage: S3Storage,
                 run_pipeline: Optional[Callable[..., tuple[dict, dict]]] = None,
                 segment: Optional[Callable[[str], dict]] = None):
        self.settings = settings
        self.storage = storage
        self._run_pipeline = run_pipeline or self._run_pipeline_default
        self._segment = segment or self._segment_default
        self._checkpoints: Optional[CheckpointManager] = None
        self._builder = None
        self._segmenter = None

    # ---- lazy, heavy dependencies ------------------------------------------------------------

    @property
    def checkpoints(self) -> CheckpointManager:
        if self._checkpoints is None:
            self._checkpoints = CheckpointManager(self.storage, bucket=self.settings.s3_checkpoints_bucket_name)
        return self._checkpoints

    def _pipeline_builder(self):
        if self._builder is None:
            from worker.tools.reader.summarize.orchestration.pipeline_builder import PipelineBuilder
            builder = PipelineBuilder()
            mode = self.settings.pipeline_mode
            if mode == 'fast':
                builder.fast()
            elif mode == 'quality':
                builder.quality()
            else:
                builder.balanced()
            builder.with_ollama(
                base_url=self.settings.ollama_base_url,
                model=self.settings.ollama_model,
                embed_model=self.settings.ollama_embed_model,
            )
            self._builder = builder
        return self._builder

    def _segment_default(self, text: str) -> dict:
        if self._segmenter is None:
            from worker.tools.reader.summarize.segmentation import DeterministicSegmenter
            self._segmenter = DeterministicSegmenter(
                ollama_base_url=self.settings.ollama_base_url,
                llm_model=self.settings.ollama_model,
                embed_model=self.settings.ollama_embed_model,
            )
        return self._segmenter.segment_text_to_json(text)

    # ---- the job ------------------------------------------------------------------------------

    def __call__(self, ctx: JobContext) -> dict[str, Any]:
        p = ctx.payload
        book_id = str(p.get("bookId") or "")
        summary_id = str(p.get("summaryId") or "")
        extraction_key = str(p.get("extractionStorageKey") or "")
        summary_type = str(p.get("summaryType") or "abstractive").lower()
        strategy = str(p.get("strategy") or "structured")
        percent = float(p.get("summaryPercent") or DEFAULT_PERCENT)
        title = str(p.get("title") or "")
        if not book_id or not summary_id or not extraction_key:
            raise JobFailed("payload needs bookId, summaryId and extractionStorageKey", retryable=False)
        if summary_type not in KNOWN_SUMMARY_TYPES:
            raise JobFailed(f"unknown summary type: {summary_type}", retryable=False)
        if strategy not in STRATEGY_MAP:
            raise JobFailed(f"unknown strategy: {strategy}", retryable=False)

        llm.wait_for_llm(ctx, self.settings, stage="waiting for LLM host")

        ctx.progress("loading extraction", 1)
        markdown = self.storage.download_text(self.settings.s3_extractions_bucket_name, extraction_key)
        text = extracted_content(markdown)
        if not text.strip():
            raise JobFailed("extraction is empty", retryable=False)
        ctx.log.info("loaded %s characters", len(text))

        # Both stages talk to the LLM host; if it disappears mid-run we wait and start the stage
        # again (segmentation is cheap, summarization resumes from the checkpoint).
        timings: dict[str, float] = {}
        while True:
            ctx.check_cancelled()
            try:
                ctx.progress("segmenting", 3)
                t0 = time.monotonic()
                json_data = ensure_subsections(self._segment(text))
                timings["segmentation_seconds"] = round(time.monotonic() - t0, 3)
                total_sections = len(json_data.get('sections', []))
                ctx.log.info("segmented into %s sections", total_sections)
                t0 = time.monotonic()
                summary_json, metadata = self._run_pipeline(ctx, json_data, book_id, summary_type, strategy, percent, title)
                timings["summarization_seconds"] = round(time.monotonic() - t0, 3)
                break
            except JobCancelled:
                raise
            except Exception as error:  # noqa: BLE001
                if llm.looks_like_connection_error(error) and not llm.probe_ollama(self.settings.ollama_base_url):
                    ctx.log.warning("LLM host went away (%s); waiting for it", error)
                    llm.wait_for_llm(ctx, self.settings, stage=ctx.stage or "waiting for LLM host")
                    continue
                raise

        metadata = dict(metadata or {})
        metadata['summarization_strategy'] = strategy
        metadata['sections'] = len(json_data.get('sections', []))
        metadata.update(timings)
        if self._segmenter is not None and hasattr(self._segmenter, "ollama_client"):
            calls = getattr(self._segmenter.ollama_client, "calls", {})
            metadata['segmentation_embedding_calls'] = int(calls.get("embeddings", 0))
            metadata['segmentation_llm_calls'] = int(calls.get("llm", 0))
        ctx.progress("storing summary", 98)
        key = self.storage.upload_summary(
            bucket=self.settings.s3_summaries_bucket_name,
            book_id=book_id,
            summary_id=summary_id,
            summary_json=json.dumps(summary_json, indent=2, ensure_ascii=False),
            summary_type=summary_type,
            metadata=metadata,
        )
        self.checkpoints.delete(book_id, summary_type)
        ctx.log.info("summary stored at %s (%s -> %s tokens)", key,
                     metadata.get('original_tokens', '?'), metadata.get('summary_tokens', '?'))
        return {
            "storageKey": key,
            "metadata": {k: v for k, v in metadata.items() if isinstance(v, (int, float, str, bool))},
        }

    # ---- the pipeline run with checkpoints (the old _process_with_pipeline) -----------------

    def _run_pipeline_default(self, ctx: JobContext, json_data: dict, book_id: str, summary_type: str,
                              strategy: str, percent: float, title: str) -> tuple[dict, dict]:
        builder = self._pipeline_builder()
        builder.with_strategy(STRATEGY_MAP[strategy])
        pipeline = builder.build()
        total_sections = len(json_data.get('sections', []))

        checkpoint = self.checkpoints.load(book_id, summary_type)
        skip_indices: list[int] = []
        preloaded_sections: list[dict] = []
        if checkpoint:
            if (checkpoint.strategy == strategy and checkpoint.summary_percent == percent
                    and checkpoint.total_sections == total_sections):
                skip_indices = checkpoint.completed_section_indices
                preloaded_sections = checkpoint.completed_sections
                ctx.log.info("resuming from checkpoint: %s/%s sections done", len(skip_indices), total_sections)
            else:
                ctx.log.warning("checkpoint does not match this request, starting fresh")
                self.checkpoints.delete(book_id, summary_type)
                checkpoint = None
        if not checkpoint:
            checkpoint = Checkpoint(book_id=book_id, summary_type=summary_type, strategy=strategy,
                                    summary_percent=percent, total_sections=total_sections)

        async def run() -> tuple[dict, dict]:
            async with pipeline:
                total_chunks = await pipeline.count_total_chunks(json_data)
                done_chunks = sum(len(sub.get('chunks', [])) for sec in preloaded_sections
                                  for sub in sec.get('subsections', []))
                state = {"chunks": done_chunks, "sections": len(skip_indices)}

                def pct() -> int:
                    if total_chunks <= 0:
                        return 5
                    return 5 + int(90 * min(state["chunks"], total_chunks) / total_chunks)

                def on_chunk(section_title: str, subsection_title: str, original_tokens: int, summary_tokens: int):
                    state["chunks"] += 1
                    ctx.progress(f"section {state['sections'] + 1}/{total_sections}: {section_title[:60]}", pct())

                def on_section(section_index: int, section_data: dict):
                    checkpoint.add_completed_section(section_index, section_data)
                    self.checkpoints.save(checkpoint)
                    state["sections"] += 1
                    ctx.progress(f"section {state['sections']}/{total_sections} done", pct())
                    ctx.check_cancelled()  # a cancel between sections keeps the checkpoint

                pipeline.set_progress_callback(on_chunk)
                pipeline.set_section_callback(on_section)
                ctx.progress(f"summarizing {total_sections} sections", pct())
                result_json, result_meta = await pipeline.process(
                    json_data=json_data,
                    summary_type=summary_type,
                    summary_percent=percent,
                    skip_section_indices=skip_indices,
                    preloaded_sections=preloaded_sections,
                )
                # how many LLM requests this run made (the rate limiter counts them)
                llm_stats = pipeline.stats.get("llm", {}) if isinstance(pipeline.stats, dict) else {}
                result_meta = dict(result_meta or {})
                result_meta["llm_calls"] = int(llm_stats.get("total_requests", 0))
                result_meta["chunks_total"] = int(total_chunks)
                result_meta["resumed_sections"] = len(skip_indices)
                return result_json, result_meta

        return asyncio.run(run())
