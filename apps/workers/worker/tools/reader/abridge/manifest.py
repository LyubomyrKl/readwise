"""Per-edition progress in the checkpoints bucket, so a stopped job resumes with what it finished.

A job stops when it is cancelled, when the worker restarts, or when the Mac sleeps long enough for the
lease to run out. The manifest records each chapter's stage (generated, checked, fixed) and every
chapter's result is its own object; a resume skips what is done. The fingerprint covers the file, the
IR and prompt versions, the models and the settings, so a changed request starts afresh.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from typing import Optional

from botocore.exceptions import ClientError

from worker.platform.storage import S3Storage
from worker.tools.reader.abridge.chapter import ChapterResult

MANIFEST_VERSION = 1


def edition_prefix(edition_id: str) -> str:
    return f"edition/{edition_id}/"


def fingerprint(**parts) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True).encode("utf-8")).hexdigest()[:24]


@dataclass
class Manifest:
    fingerprint: str
    units: list[dict]
    state: dict[str, str] = field(default_factory=dict)          # unit id -> generated | checked | fixed
    descriptions: dict[str, str] = field(default_factory=dict)   # picture number -> description
    overview: str = ""
    result: Optional[dict] = None
    version: int = MANIFEST_VERSION


class ManifestStore:
    def __init__(self, storage: S3Storage, bucket: str, edition_id: str):
        self.storage = storage
        self.bucket = bucket
        self.prefix = edition_prefix(edition_id)

    def _read(self, key: str) -> Optional[str]:
        if not self.storage.object_exists(self.bucket, key):
            return None
        try:
            return self.storage.download_text(self.bucket, key)
        except ClientError:
            return None

    def load(self, expected: str) -> Optional[Manifest]:
        raw = self._read(self.prefix + "manifest.json")
        if raw is None:
            return None
        data = json.loads(raw)
        if data.get("version") != MANIFEST_VERSION or data.get("fingerprint") != expected:
            return None
        return Manifest(**data)

    def save(self, manifest: Manifest) -> None:
        self.storage.upload_text(self.bucket, self.prefix + "manifest.json",
                                 json.dumps(asdict(manifest), ensure_ascii=False), "application/json")

    def save_unit(self, chapter: ChapterResult) -> None:
        self.storage.upload_text(self.bucket, f"{self.prefix}units/{chapter.unit}.json",
                                 json.dumps(chapter.to_json(), ensure_ascii=False), "application/json")

    def load_unit(self, unit_id: str) -> Optional[ChapterResult]:
        raw = self._read(f"{self.prefix}units/{unit_id}.json")
        return ChapterResult.from_json(json.loads(raw)) if raw else None
