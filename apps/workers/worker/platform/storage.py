"""boto3 helper for the buckets the workers read and write."""

from __future__ import annotations

import logging
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from worker.platform.settings import WorkerSettings

logger = logging.getLogger(__name__)


class S3Storage:
    """Thin wrapper over a boto3 S3 client (MinIO in production)."""

    def __init__(self, endpoint: str, access_key: str, secret_key: str):
        self.endpoint = endpoint
        self.access_key = access_key
        self.secret_key = secret_key
        self.client = boto3.client(
            's3',
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )

    @classmethod
    def from_settings(cls, settings: WorkerSettings) -> "S3Storage":
        return cls(settings.s3_endpoint_url, settings.s3_access_key_id, settings.s3_secret_access_key)

    def download_text(self, bucket: str, key: str) -> str:
        try:
            response = self.client.get_object(Bucket=bucket, Key=key)
            return response['Body'].read().decode('utf-8')
        except ClientError as e:
            logger.error(f"Failed to download from S3: {e}")
            raise

    def upload_text(self, bucket: str, key: str, content: str,
                    content_type: str = 'text/plain', metadata: Optional[dict] = None) -> str:
        try:
            # S3 metadata must be ASCII
            safe_metadata = {}
            if metadata:
                for k, v in metadata.items():
                    if isinstance(v, str):
                        safe_metadata[k] = v.encode('ascii', 'replace').decode('ascii')
                    else:
                        safe_metadata[k] = str(v)

            self.client.put_object(
                Bucket=bucket,
                Key=key,
                Body=content.encode('utf-8'),
                ContentType=content_type,
                Metadata=safe_metadata or {},
            )
            logger.info(f"Uploaded to S3: s3://{bucket}/{key}")
            return key
        except ClientError as e:
            logger.error(f"Failed to upload to S3: {e}")
            raise

    def download_bytes(self, bucket: str, key: str) -> bytes:
        response = self.client.get_object(Bucket=bucket, Key=key)
        return response['Body'].read()

    def upload_bytes(self, bucket: str, key: str, data: bytes, content_type: str = 'application/octet-stream') -> str:
        self.client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
        logger.info(f"Uploaded to S3: s3://{bucket}/{key} ({len(data)} bytes)")
        return key

    def download_file(self, bucket: str, key: str, local_path: str):
        try:
            self.client.download_file(bucket, key, local_path)
        except ClientError as e:
            logger.error(f"Failed to download file from S3: {e}")
            raise

    def object_exists(self, bucket: str, key: str) -> bool:
        try:
            self.client.head_object(Bucket=bucket, Key=key)
            return True
        except ClientError:
            return False
