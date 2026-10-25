"""Checkpoint manager for resumable summarization.

Saves progress after each section to allow resuming interrupted summarizations.
"""

import json
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# S3 bucket for checkpoints
CHECKPOINT_BUCKET = "checkpoints"


@dataclass
class Checkpoint:
    """Represents a summarization checkpoint."""

    book_id: str
    summary_type: str
    strategy: str
    summary_percent: float

    # Progress tracking
    total_sections: int = 0
    completed_section_indices: List[int] = field(default_factory=list)

    # Partial results (sections that are done)
    completed_sections: List[Dict[str, Any]] = field(default_factory=list)

    # Metadata
    created_at: str = ""
    updated_at: str = ""
    pipeline_version: str = "2.0"

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.utcnow().isoformat()
        self.updated_at = datetime.utcnow().isoformat()

    @property
    def progress_percent(self) -> float:
        """Get completion percentage."""
        if self.total_sections == 0:
            return 0.0
        return len(self.completed_section_indices) / self.total_sections * 100

    @property
    def is_complete(self) -> bool:
        """Check if all sections are done."""
        return len(self.completed_section_indices) >= self.total_sections

    def add_completed_section(self, section_index: int, section_data: Dict[str, Any]):
        """Mark a section as completed."""
        if section_index not in self.completed_section_indices:
            self.completed_section_indices.append(section_index)
            self.completed_sections.append(section_data)
            self.updated_at = datetime.utcnow().isoformat()

    def get_next_section_index(self) -> int:
        """Get the index of the next section to process."""
        for i in range(self.total_sections):
            if i not in self.completed_section_indices:
                return i
        return self.total_sections  # All done

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Checkpoint":
        """Create from dictionary."""
        return cls(**data)


class CheckpointManager:
    """Manages saving and loading checkpoints to S3."""

    def __init__(self, s3_storage, bucket: str = CHECKPOINT_BUCKET):
        """Initialize with S3 storage client.

        Args:
            s3_storage: S3Storage instance
            bucket: bucket that holds the checkpoints (S3_CHECKPOINTS_BUCKET_NAME)
        """
        self._s3 = s3_storage
        self._bucket = bucket
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self):
        """Ensure the checkpoints bucket exists."""
        try:
            self._s3.client.head_bucket(Bucket=self._bucket)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchBucket"):
                try:
                    self._s3.client.create_bucket(Bucket=self._bucket)
                    logger.info(f"Created bucket: {self._bucket}")
                except ClientError as create_error:
                    logger.warning(f"Could not create bucket {self._bucket}: {create_error}")
            else:
                logger.warning(f"Could not check bucket {self._bucket}: {e}")

    def _get_checkpoint_key(self, book_id: str, summary_type: str) -> str:
        """Generate S3 key for a checkpoint."""
        return f"checkpoint/{book_id}_{summary_type}.json"

    def save(self, checkpoint: Checkpoint) -> bool:
        """Save checkpoint to S3.

        Args:
            checkpoint: Checkpoint to save

        Returns:
            True if saved successfully
        """
        try:
            key = self._get_checkpoint_key(checkpoint.book_id, checkpoint.summary_type)
            content = json.dumps(checkpoint.to_dict(), indent=2, ensure_ascii=False)

            self._s3.upload_text(
                bucket=self._bucket,
                key=key,
                content=content,
                content_type="application/json",
                metadata={
                    "book_id": checkpoint.book_id,
                    "summary_type": checkpoint.summary_type,
                    "progress": f"{checkpoint.progress_percent:.1f}%",
                },
            )

            logger.info(
                f"Checkpoint saved: {checkpoint.book_id} "
                f"({len(checkpoint.completed_section_indices)}/{checkpoint.total_sections} sections, "
                f"{checkpoint.progress_percent:.1f}%)"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to save checkpoint for {checkpoint.book_id}: {e}")
            return False

    def load(self, book_id: str, summary_type: str) -> Optional[Checkpoint]:
        """Load checkpoint from S3 if it exists.

        Args:
            book_id: Book ID
            summary_type: Summary type

        Returns:
            Checkpoint if found, None otherwise
        """
        try:
            key = self._get_checkpoint_key(book_id, summary_type)
            content = self._s3.download_text(self._bucket, key)
            data = json.loads(content)
            checkpoint = Checkpoint.from_dict(data)

            logger.info(
                f"Checkpoint loaded: {book_id} "
                f"({len(checkpoint.completed_section_indices)}/{checkpoint.total_sections} sections, "
                f"{checkpoint.progress_percent:.1f}%)"
            )
            return checkpoint

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchKey"):
                logger.debug(f"No checkpoint found for {book_id}")
                return None
            logger.error(f"Failed to load checkpoint for {book_id}: {e}")
            return None

        except Exception as e:
            logger.error(f"Failed to load checkpoint for {book_id}: {e}")
            return None

    def delete(self, book_id: str, summary_type: str) -> bool:
        """Delete checkpoint after successful completion.

        Args:
            book_id: Book ID
            summary_type: Summary type

        Returns:
            True if deleted successfully
        """
        try:
            key = self._get_checkpoint_key(book_id, summary_type)
            self._s3.client.delete_object(Bucket=self._bucket, Key=key)
            logger.info(f"Checkpoint deleted: {book_id}")
            return True

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchKey"):
                return True  # Already deleted
            logger.error(f"Failed to delete checkpoint for {book_id}: {e}")
            return False

        except Exception as e:
            logger.error(f"Failed to delete checkpoint for {book_id}: {e}")
            return False

    def exists(self, book_id: str, summary_type: str) -> bool:
        """Check if a checkpoint exists.

        Args:
            book_id: Book ID
            summary_type: Summary type

        Returns:
            True if checkpoint exists
        """
        try:
            key = self._get_checkpoint_key(book_id, summary_type)
            self._s3.client.head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False
