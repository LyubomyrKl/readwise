"""`python -m worker.bench`: run ingest and the abridged edition on a local file, against a real Ollama.

    python -m worker.bench structure book.epub
    python -m worker.bench abridge book.epub --out /tmp/run1 --chapters 2 [--writer gemma4:26b-mlx]
        [--checker qwen3.6:35b-mlx | --checker none] [--factcheck dense|all|off] [--length standard]
        [--figures key|all|none] [--ollama http://localhost:11434]

Objects go to <out>/store/<bucket>/<key> instead of MinIO, so a second run resumes from the manifest
(delete <out>/store/checkpoints to start over). The run writes <out>/edition.epub, <out>/result.json
and a per-part report, <out>/parts.tsv: words in and out, target, density, retries, flags, fixes.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from worker.platform.contracts import JobEnvelope
from worker.platform.events import JobState
from worker.platform.settings import WorkerSettings


class LocalStorage:
    """The S3Storage subset the reader's handlers use, over a directory."""

    def __init__(self, root: Path):
        self.root = root

    def _path(self, bucket: str, key: str) -> Path:
        path = self.root / bucket / key
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def object_exists(self, bucket: str, key: str) -> bool:
        return (self.root / bucket / key).exists()

    def download_bytes(self, bucket: str, key: str) -> bytes:
        return self._path(bucket, key).read_bytes()

    def upload_bytes(self, bucket: str, key: str, data: bytes, content_type: str = "") -> str:
        self._path(bucket, key).write_bytes(data)
        return key

    def download_text(self, bucket: str, key: str) -> str:
        return self._path(bucket, key).read_text(encoding="utf-8")

    def upload_text(self, bucket: str, key: str, content: str, content_type: str = "", metadata=None) -> str:
        self._path(bucket, key).write_text(content, encoding="utf-8")
        return key


class LocalContext:
    """JobContext for a terminal: progress lines on stderr, never cancelled."""

    def __init__(self, payload: dict, settings: WorkerSettings, storage: LocalStorage):
        self.envelope = JobEnvelope(v=1, jobId="bench", type="reader.abridge", toolId="reader", userId="bench",
                                    attempt=1, publishedAt=datetime.now(timezone.utc), payload=payload)
        self.job_id, self.payload, self.settings, self.storage = "bench", payload, settings, storage
        self._state = JobState("bench", 1)
        self._started = time.monotonic()
        import logging

        self.log = logging.getLogger("bench")

    def check_cancelled(self) -> None:
        pass

    def progress(self, stage: Optional[str] = None, progress: Optional[int] = None) -> None:
        print(f"[{time.monotonic() - self._started:7.1f}s] {progress if progress is not None else '':>3}% {stage or ''}",
              file=sys.stderr, flush=True)

    def waiting(self, reason: str, stage: Optional[str] = None) -> None:
        print(f"waiting: {reason}", file=sys.stderr, flush=True)


def _mime(path: str) -> str:
    return "application/pdf" if path.lower().endswith(".pdf") else "application/epub+zip"


def structure(args) -> None:
    from worker.tools.reader.ingest.handler import parse
    from worker.tools.reader.abridge.plan import plan

    data = Path(args.file).read_bytes()
    started = time.perf_counter()
    doc = parse(data, _mime(args.file), "bench")
    info = doc.structure()
    print(json.dumps({k: v for k, v in info.items() if k != "sections"}, ensure_ascii=False))
    print(f"parsed in {time.perf_counter() - started:.2f}s")
    for section in info["sections"]:
        mark = "+" if section["included"] else "-"
        print(f"{mark} {'  ' * (section['level'] - 1)}{section['title'][:90]}  [{section['kind']}, {section['words']} words,"
              f" {section['figures']} pictures]")
    print("\nunits:")
    for unit in plan(doc):
        print(f"  {unit.id:>4} {unit.kind:8} L{unit.level} {unit.words:6} words  {unit.title[:80]}")


def abridge(args) -> None:
    from worker.tools.reader.abridge.handler import AbridgeHandler

    out = Path(args.out)
    store = LocalStorage(out / "store")
    settings = WorkerSettings(_env_file=None, ollama_base_url=args.ollama, ollama_model=args.writer,
                              abridge_model=args.writer, abridge_check_model="" if args.checker == "none" else args.checker,
                              abridge_factcheck=args.factcheck, worker_llm_wait_min_seconds=5,
                              worker_llm_wait_max_seconds=30)
    key = "bench-" + Path(args.file).name
    store.upload_bytes(settings.s3_book_bucket_name, key, Path(args.file).read_bytes())
    payload = {"bookId": "bench", "editionId": args.edition or Path(args.file).stem, "fileStorageKey": key,
               "mime": _mime(args.file), "title": args.title or "", "author": args.author or "",
               "length": args.length, "figures": args.figures, "maxChapters": args.chapters}
    ctx = LocalContext(payload, settings, store)
    result = AbridgeHandler(settings, store)(ctx)  # type: ignore[arg-type]
    (out / "edition.epub").write_bytes(store.download_bytes(settings.s3_book_bucket_name, result["storageKey"]))
    (out / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    rows = ["unit\tpart\twords_in\twords_out\tratio\ttarget\tdensity\tfacts\tretried\tchecked\tfixes\tflags"]
    units_dir = out / "store" / settings.s3_checkpoints_bucket_name / "edition" / payload["editionId"] / "units"
    for path in sorted(units_dir.glob("*.json"), key=lambda p: int(p.stem[1:])):
        chapter = json.loads(path.read_text(encoding="utf-8"))
        for part in chapter["parts"]:
            fixes = [c for c in part.get("changes", []) if c.get("action") in ("fixed", "deleted")]
            rows.append("\t".join(str(x) for x in (
                chapter["unit"], part["index"] + 1, part["words_in"], part["words_out"],
                f"{part['words_out'] / max(1, part['words_in']):.2f}", f"{part['target']:.2f}", f"{part['density']:.2f}",
                part["facts"], ",".join(part["retried"]), part["checked"], len(fixes), "; ".join(part["flags"])[:200])))
    (out / "parts.tsv").write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("chapters", "sourceWords", "editionWords", "ratio", "pictures",
                                             "checkedParts", "fixedSentences", "retriedParts", "warnings")},
                     ensure_ascii=False))
    print(json.dumps(result["metrics"], ensure_ascii=False))
    print(f"wrote {out / 'edition.epub'}")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m worker.bench")
    sub = parser.add_subparsers(dest="command", required=True)
    s = sub.add_parser("structure", help="print the IR structure and the planned units of a file")
    s.add_argument("file")
    a = sub.add_parser("abridge", help="make the abridged edition of a file")
    a.add_argument("file")
    a.add_argument("--out", required=True)
    a.add_argument("--chapters", type=int, default=0, help="only the first N chapters")
    a.add_argument("--writer", default=os.environ.get("ABRIDGE_MODEL", "gemma4:26b-mlx"))
    a.add_argument("--checker", default=os.environ.get("ABRIDGE_CHECK_MODEL", "qwen3.6:35b-mlx"))
    a.add_argument("--factcheck", default="dense", choices=("all", "dense", "off"))
    a.add_argument("--length", default="standard", choices=("short", "standard", "long"))
    a.add_argument("--figures", default="key", choices=("key", "all", "none"))
    a.add_argument("--ollama", default=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"))
    a.add_argument("--title")
    a.add_argument("--author")
    a.add_argument("--edition", help="edition id (the manifest's folder); default the file name")
    args = parser.parse_args(argv)
    {"structure": structure, "abridge": abridge}[args.command](args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
