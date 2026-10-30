"""reader.abridge: a book -> its abridged edition, an EPUB in the books bucket.

Payload: { bookId, editionId, fileStorageKey, mime, title, author, length?: short|standard|long,
           figures?: key|all|none }
Result:  { storageKey, bytes, sha256, title, language, chapters, sourceWords, editionWords, ratio,
           pictures, checkedParts, fixedSentences, warnings, metrics }

Stages, each resumable from the manifest: (A) per chapter, pictures described, summary, abridged
parts with their checks; (B) the checker model flags suspected errors; (C) the writer confirms and
fixes them; (D) the book overview; (E) the EPUB. B and C run book-wide so each model is loaded once.
"""

from __future__ import annotations

import hashlib
import re
import time
from typing import Any, Callable, Optional

from worker.platform.jobs import JobContext, JobFailed
from worker.platform.llm import wait_for_llm
from worker.platform.settings import WorkerSettings
from worker.platform.storage import S3Storage
from worker.tools.reader.ingest.handler import PDF, load_or_build
from worker.tools.reader.ingest.ir import IR_VERSION, Document
from worker.tools.reader.ingest.language import detect_language, language_name
from worker.tools.reader.abridge import edition, factcheck, prompts
from worker.tools.reader.abridge.chapter import ChapterResult, abridge_chapter
from worker.tools.reader.abridge.density import LENGTHS
from worker.tools.reader.abridge.engine import Engine, Models
from worker.tools.reader.abridge.figures import for_vision, marker, selected
from worker.tools.reader.abridge.llm import LLMError, LLMUnavailable, OllamaClient
from worker.tools.reader.abridge.manifest import Manifest, ManifestStore, fingerprint
from worker.tools.reader.abridge.plan import Unit, figure_numbers_referenced, plan, unit_items
from worker.tools.reader.abridge.text import clean_output, keep_whole_sentences, words

FIGURE_MODES = ("key", "all", "none")
PASS_THROUGH_WORDS = 120      # a unit this short (an epigraph, a one-page preface) is kept as written


def output_key(user_id: str, edition_id: str) -> str:
    return f"{user_id}-edition-{edition_id}.epub"


class AbridgeHandler:
    def __init__(self, settings: WorkerSettings, storage: S3Storage,
                 client_factory: Optional[Callable[[], OllamaClient]] = None, sleep=time.sleep):
        self.settings = settings
        self.storage = storage
        self.client_factory = client_factory or (lambda: OllamaClient(
            settings.ollama_base_url, num_ctx=settings.ollama_num_ctx, timeout=settings.ollama_timeout_seconds,
            keep_alive=settings.ollama_keep_alive))
        self.sleep = sleep

    # ---- the job ---------------------------------------------------------------------------

    def __call__(self, ctx: JobContext) -> dict[str, Any]:
        p = ctx.payload
        book_id, edition_id = str(p.get("bookId") or ""), str(p.get("editionId") or "")
        file_key, mime = str(p.get("fileStorageKey") or ""), str(p.get("mime") or "").lower()
        length = str(p.get("length") or "standard")
        figure_mode = str(p.get("figures") or "key")
        if not book_id or not edition_id or not file_key:
            raise JobFailed("payload needs bookId, editionId and fileStorageKey", retryable=False)
        if length not in LENGTHS or figure_mode not in FIGURE_MODES:
            raise JobFailed(f"unknown length {length!r} or figures {figure_mode!r}", retryable=False)
        started = time.monotonic()
        out_key = output_key(ctx.envelope.userId, edition_id)
        store = ManifestStore(self.storage, self.settings.s3_checkpoints_bucket_name, edition_id)

        ctx.progress("reading the book", 1)
        doc, _ = load_or_build(self.storage, self.settings, file_key, mime)
        writer = self.settings.abridge_model or self.settings.ollama_model
        if not writer:
            raise JobFailed("no model configured: set ABRIDGE_MODEL or OLLAMA_MODEL", retryable=False)
        models = Models(writer=writer, checker=self.settings.abridge_check_model,
                        vision=self.settings.abridge_vision_model or writer)
        mode = self.settings.abridge_factcheck if models.checker else "off"
        key = fingerprint(sha256=doc.sha256, ir=IR_VERSION, prompts=prompts.PROMPT_VERSION, writer=models.writer,
                          checker=models.checker, vision=models.vision, factcheck=mode, length=length,
                          figures=figure_mode)
        manifest = store.load(key)
        if manifest and manifest.result and self.storage.object_exists(self.settings.s3_book_bucket_name, out_key):
            ctx.progress("already made", 100)
            return {**manifest.result, "skipped": True}

        client = self.client_factory()
        engine = Engine(client, ctx, self.settings, models, sleep=self.sleep)
        warnings: list[str] = []
        try:
            wait_for_llm(ctx, self.settings, stage="waiting for the LLM host")
            models, mode = self._check_models(client, models, mode, warnings)
            engine.models = models
            doc = self._read_scans(ctx, engine, doc, file_key, warnings)
            result = self._run(ctx, engine, doc, store, manifest, key, length, figure_mode, mode, out_key, p, warnings)
        finally:
            client.close()
        result["metrics"]["seconds"] = round(time.monotonic() - started, 1)
        result["metrics"]["secondsPer1000Words"] = round(1000 * result["metrics"]["seconds"]
                                                         / max(1, result["sourceWords"]), 1)
        return result

    # ---- stages ----------------------------------------------------------------------------

    def _check_models(self, client: OllamaClient, models: Models, mode: str, warnings: list[str]) -> tuple[Models, str]:
        """Fails early when the writer is missing; goes on without the fact-check when its model is."""
        try:
            available = client.models()
        except (LLMUnavailable, LLMError):
            return models, mode
        if models.writer not in available:
            raise JobFailed(f"model {models.writer} is not on the LLM host (ollama pull {models.writer})",
                            retryable=False)
        if models.vision not in available:
            warnings.append(f"vision model {models.vision} missing; pictures kept without descriptions")
            models = Models(models.writer, models.checker, "")
        if models.checker and models.checker not in available:
            warnings.append(f"fact-check skipped: model {models.checker} is not on the LLM host")
            models, mode = Models(models.writer, "", models.vision), "off"
        return models, mode

    def _read_scans(self, ctx: JobContext, engine: Engine, doc: Document, file_key: str, warnings: list[str]
                    ) -> Document:
        if not doc.ocr_pages or doc.mime != PDF:
            return doc
        if not self.settings.abridge_ocr or not engine.models.vision:
            warnings.append(f"{len(doc.ocr_pages)} scanned pages left out (OCR is off)")
            return doc
        from worker.tools.reader.abridge.ocr import read_pages
        from worker.tools.reader.ingest.pdf_reader import read_pdf

        data = self.storage.download_bytes(self.settings.s3_book_bucket_name, file_key)
        engine.stage = "reading scanned pages"
        texts = read_pages(engine, self.storage, self.settings.s3_checkpoints_bucket_name, data, doc.sha256,
                           doc.ocr_pages, doc.language if doc.language in ("en", "ru", "uk") else "",
                           on_page=lambda done, total: ctx.progress(f"reading scanned page {done} of {total}",
                                                                    1 + int(9 * done / total)))
        rebuilt = read_pdf(data, sha256=doc.sha256, mime=doc.mime, ocr_text=texts)
        rebuilt.title, rebuilt.authors = doc.title, doc.authors
        # pictures of the rebuilt document are the same objects; reuse the stored keys
        stored = {f.digest: f.key for f in doc.figures.values() if f.key}
        for figure in rebuilt.figures.values():
            figure.key = stored.get(figure.digest, "")
        return rebuilt

    def _run(self, ctx: JobContext, engine: Engine, doc: Document, store: ManifestStore, manifest: Optional[Manifest],
             key: str, length: str, figure_mode: str, mode: str, out_key: str, p: dict, warnings: list[str]
             ) -> dict[str, Any]:
        book, author = str(p.get("title") or doc.title or ""), str(p.get("author") or ", ".join(doc.authors))
        self._read_drop_caps(engine, doc)
        units = plan(doc)
        limit = int(p.get("maxChapters") or 0)        # the bench's quick runs; the API never sends it
        if limit:
            last = [u for u in units if u.kind == "chapter"][:limit][-1:]
            units = units[: units.index(last[0]) + 1] if last else units
        chapters = [u for u in units if u.kind == "chapter"]
        if not chapters:
            raise JobFailed("No text to abridge: the file has no readable chapters", retryable=False)
        full_text = "\n\n".join(doc.text_of(u.start, u.end) for u in chapters)
        pictures = selected(doc, figure_mode, figure_numbers_referenced(full_text))
        numbers = {figure.id: index for index, figure in enumerate(pictures, 1)}
        if manifest is None:
            manifest = Manifest(fingerprint=key, units=[u.to_json() for u in units],
                                settings={"length": length, "figures": figure_mode, "factcheck": mode,
                                          "writer": engine.models.writer, "checker": engine.models.checker})
            store.save(manifest)
        book_lang = doc.language if doc.language in ("en", "ru", "uk") else (detect_language(full_text) or "other")
        total_words = max(1, sum(u.words for u in chapters))

        # The bar's shares follow where the time goes, so it moves evenly and the time left holds: with
        # the fact-check on, writing took about a third of the time, checking half, fixing a sixth (§20.3).
        shares = {"generated": 32, "checked": 48, "fixed": 14} if mode != "off" else {"generated": 93, "checked": 0,
                                                                                      "fixed": 0}
        base = {"generated": 2, "checked": 2 + shares["generated"], "fixed": 2 + shares["generated"] + shares["checked"]}
        position = {u.id: i for i, u in enumerate(chapters, 1)}

        def report(stage: str, label: str, words_done: float) -> None:
            ctx.progress(label, base[stage] + int(shares[stage] * min(1.0, words_done / total_words)))

        # (A) generation, chapter by chapter
        done_words = sum(u.words for u in chapters if manifest.state.get(u.id))
        for unit in chapters:
            if manifest.state.get(unit.id):
                continue
            label = f"chapter {position[unit.id]} of {len(chapters)}"
            engine.stage = label
            report("generated", label, done_words)
            markers = self._markers(ctx, engine, doc, unit, pictures, numbers, manifest, book, book_lang)
            items = unit_items(doc, unit, markers)
            unit_text = "\n\n".join(items)
            lang = detect_language(unit_text) if words(unit_text) >= 200 else book_lang
            lang = lang if lang != "other" else book_lang

            def on_part(done: int, total: int, unit=unit, label=label) -> None:
                report("generated", f"{label}: part {done} of {total}", done_words + unit.words * done / total)

            if words(unit_text) < PASS_THROUGH_WORDS:
                result = self._pass_through(unit, items, lang)
            else:
                result = abridge_chapter(engine, unit=unit.id, book=book, author=author, title=unit.title, lang=lang,
                                         length=length, items=items, on_part=on_part)
            store.save_unit(result)
            manifest.state[unit.id] = "generated"
            store.save(manifest)
            done_words += unit.words

        # (B) suspected errors, by the checker model; (C) confirmations and fixes, by the writer
        if mode != "off":
            for stage, verb in (("checked", "fact-checking"), ("fixed", "fixing")):
                finished = ("checked", "fixed") if stage == "checked" else ("fixed",)
                stage_words = sum(u.words for u in chapters if manifest.state.get(u.id) in finished)
                for unit in chapters:
                    if manifest.state.get(unit.id) in finished:
                        continue
                    label = f"{verb} chapter {position[unit.id]} of {len(chapters)}"
                    engine.stage = label
                    report(stage, label, stage_words)
                    chapter = store.load_unit(unit.id)
                    if chapter is None:
                        continue

                    def on_step(done: int, total: int, unit=unit, label=label, stage=stage, before=stage_words) -> None:
                        report(stage, f"{label}: part {done} of {total}", before + unit.words * done / max(1, total))

                    source = "\n\n".join(p.source for p in chapter.parts)
                    context = factcheck.header(book, author, chapter.title)
                    if stage == "checked":
                        factcheck.check_chapter(engine, chapter, mode, source, context, on_part=on_step)
                    else:
                        factcheck.fix_chapter(engine, chapter, source, context, on_part=on_step)
                    store.save_unit(chapter)
                    manifest.state[unit.id] = stage
                    store.save(manifest)
                    stage_words += unit.words
        else:
            # without the checker, the spelling fixes (mixed scripts) still run
            for unit in chapters:
                chapter = store.load_unit(unit.id)
                if chapter and any(p.mixed_unfixed and not p.changes for p in chapter.parts):
                    factcheck.fix_chapter(engine, chapter, "\n\n".join(p.source for p in chapter.parts),
                                          factcheck.header(book, author, chapter.title))
                    store.save_unit(chapter)

        # (D) the overview, from the chapter summaries
        results = {u.id: store.load_unit(u.id) for u in chapters}
        if not manifest.overview:
            engine.stage = "the book overview"
            ctx.progress("writing the book overview", 96)
            manifest.overview = self._overview(engine, book, author, book_lang,
                                               [(u.title, results[u.id].summary) for u in chapters
                                                if results.get(u.id) and results[u.id].summary])
            store.save(manifest)

        # (E) the EPUB
        ctx.progress("building the EPUB", 98)
        return self._build(doc, units, results, pictures, numbers, manifest, store, book, author, book_lang,
                           engine, out_key, mode, length, figure_mode, warnings)

    def _read_drop_caps(self, engine: Engine, doc: Document) -> None:
        """A drop cap whose alt text does not name its letter: the vision model reads it (Gemma 4 read 4 of 4;
        the alt text stays the first source because a smaller model once read «Б» as «В»)."""
        if not engine.models.vision:
            return
        lang = doc.language if doc.language in ("en", "ru", "uk") else ""
        for index, block in enumerate(doc.blocks[:-1]):
            figure = doc.figures.get(block.figure or "") if block.type == "figure" else None
            following = doc.blocks[index + 1]
            if not figure or figure.reason != "drop-cap" or figure.drop_cap or not figure.key \
                    or not following.text or not following.text[0].islower():
                continue
            try:
                data = self.storage.download_bytes(self.settings.s3_extractions_bucket_name, figure.key)
            except Exception:  # noqa: BLE001 - the picture object is gone: the paragraph keeps its gap
                continue
            reply = engine.call(engine.models.vision, prompts.DROP_CAP.format(language=language_name(lang)),
                                num_predict=8, temperature=0.0, images=[for_vision(data)])
            letter = re.search(r"[A-Za-zА-Яа-яЁёЇїІіЄєҐґ]", reply.text.replace("*", ""))
            if letter:
                figure.drop_cap = letter.group(0).upper()
                following.text = figure.drop_cap + following.text

    def _markers(self, ctx: JobContext, engine: Engine, doc: Document, unit: Unit, pictures, numbers: dict[str, int],
                 manifest: Manifest, book: str, lang: str) -> dict[str, str]:
        ids = {b.figure for b in doc.blocks[unit.start:unit.end] if b.type == "figure"}
        markers = {}
        for figure in pictures:
            if figure.id not in ids:
                continue
            number = numbers[figure.id]
            if str(number) not in manifest.descriptions:
                manifest.descriptions[str(number)] = self._describe(engine, figure, book, lang)
            markers[figure.id] = marker(number, figure, manifest.descriptions[str(number)])
        return markers

    def _describe(self, engine: Engine, figure, book: str, lang: str) -> str:
        if not engine.models.vision or not figure.key or figure.media_type == "image/svg+xml":
            return ""
        try:
            data = self.storage.download_bytes(self.settings.s3_extractions_bucket_name, figure.key)
        except Exception:  # noqa: BLE001 - a missing picture object: keep the picture's caption only
            return ""
        caption = figure.caption or figure.alt or "—"
        reply = engine.call(engine.models.vision, prompts.DESCRIBE.format(book=book, caption=caption,
                                                                          language=language_name(lang)),
                            num_predict=200, temperature=0.2, images=[for_vision(data)])
        return keep_whole_sentences(clean_output(reply.text)).replace("\n", " ")[:600]

    @staticmethod
    def _pass_through(unit: Unit, items: list[str], lang: str) -> ChapterResult:
        from worker.tools.reader.abridge.chapter import PartResult

        text = "\n\n".join(items)
        part = PartResult(index=0, source=text, output=text, words_in=words(text), words_out=words(text), density=0.0,
                          target=1.0, target_words=words(text), facts=0.0, flags=["kept as written (short)"])
        return ChapterResult(unit=unit.id, title=unit.title, language=lang, summary="", parts=[part],
                             words_in=words(text), seconds=0.0)

    def _overview(self, engine: Engine, book: str, author: str, lang: str, summaries: list[tuple[str, str]]) -> str:
        if not summaries:
            return ""
        budget = engine.summary_budget_words(lang)
        lines, count = [], 0
        for title, summary in summaries:
            count += words(summary) + words(title)
            if count > budget:
                break
            lines.append(f"{title}: {summary}")
        reply = engine.call(engine.models.writer, prompts.OVERVIEW.format(
            book=book, author=author, language=language_name(lang), rule=prompts.LANG_RULES.get(lang, prompts.OTHER_RULE),
            summaries="\n\n".join(lines)), num_predict=900)
        return keep_whole_sentences(clean_output(reply.text))

    def _build(self, doc: Document, units: list[Unit], results: dict[str, Optional[ChapterResult]], pictures,
               numbers: dict[str, int], manifest: Manifest, store: ManifestStore, book: str, author: str, lang: str,
               engine: Engine, out_key: str, mode: str, length: str, figure_mode: str, warnings: list[str]
               ) -> dict[str, Any]:
        chapters_out: list[edition.EditionChapter] = []
        for unit in units:
            if unit.kind == "divider":
                chapters_out.append(edition.EditionChapter(title=unit.title, level=unit.level, divider=True))
                continue
            result = results.get(unit.id)
            if result is None:
                warnings.append(f"chapter missing from the manifest: {unit.title}")
                continue
            chapters_out.append(edition.EditionChapter(title=unit.title, level=unit.level, summary=result.summary,
                                                       text=result.text))
        used = {int(n) for c in chapters_out for n in re.findall(r"\[\[FIG (\d+)\]\]", c.text)}
        edition_pictures = {}
        for figure in pictures:
            number = numbers[figure.id]
            if number not in used or not figure.key:
                continue
            try:
                data = self.storage.download_bytes(self.settings.s3_extractions_bucket_name, figure.key)
            except Exception:  # noqa: BLE001 - the picture object went missing: leave the picture out
                warnings.append(f"picture {number} missing from storage")
                continue
            edition_pictures[number] = edition.EditionPicture(number, figure, data,
                                                              manifest.descriptions.get(str(number), ""))
        cover = None
        if doc.cover and doc.cover in doc.figures and doc.figures[doc.cover].key:
            try:
                cover = (self.storage.download_bytes(self.settings.s3_extractions_bucket_name,
                                                     doc.figures[doc.cover].key), doc.figures[doc.cover].media_type)
            except Exception:  # noqa: BLE001
                cover = None
        source_words = sum(r.words_in for r in results.values() if r)
        edition_words = sum(words(edition.plain_text(r.text)) for r in results.values() if r)
        ratio = edition_words / max(1, source_words)
        title = edition.edition_title(book or doc.title or "Untitled", lang)
        data = edition.build(edition.EditionBook(
            identifier=f"workbench-edition-{store.prefix.split('/')[1]}", title=title,
            authors=[author] if author else doc.authors, language=lang, overview=manifest.overview,
            chapters=chapters_out, pictures=edition_pictures, cover=cover, ratio=ratio, model=engine.models.writer))
        self.storage.upload_bytes(self.settings.s3_book_bucket_name, out_key, data, "application/epub+zip")

        parts = [p for r in results.values() if r for p in r.parts]
        result = {
            "storageKey": out_key,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "title": title,
            "language": lang,
            "chapters": sum(1 for c in chapters_out if not c.divider),
            "sourceWords": source_words,
            "editionWords": edition_words,
            "ratio": round(ratio, 3),
            "pictures": len(edition_pictures),
            "picturesPutBack": sum(len(p.figures_put_back) for p in parts),
            "length": length,
            "figures": figure_mode,
            "factcheck": mode,
            "checkedParts": sum(1 for p in parts if p.checked),
            "fixedSentences": sum(1 for p in parts for c in p.changes if c.get("action") in ("fixed", "deleted")),
            "retriedParts": sum(1 for p in parts if p.retried),
            "correctedNames": sum(len(p.corrected) for p in parts),
            "flaggedParts": sum(1 for p in parts if p.flags),
            "warnings": warnings[:20],
            "models": {"writer": engine.models.writer, "checker": engine.models.checker, "vision": engine.models.vision},
            "metrics": {"llm": engine.client.usage_json(),
                        "calls": sum(u.calls for u in engine.client.usage.values())},
        }
        manifest.result = result
        store.save(manifest)
        return result
