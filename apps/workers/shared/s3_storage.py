#!/usr/bin/env python3

import logging
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class S3Storage:
    """Simple S3 storage helper for reading and writing files"""

    def __init__(self, endpoint: str, access_key: str, secret_key: str):
        self.client = boto3.client(
            's3',
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key
        )

    def download_text(self, bucket: str, key: str) -> str:
        """Download text file from S3"""
        try:
            response = self.client.get_object(Bucket=bucket, Key=key)
            return response['Body'].read().decode('utf-8')
        except ClientError as e:
            logger.error(f"Failed to download from S3: {e}")
            raise

    def upload_text(self, bucket: str, key: str, content: str,
                    content_type: str = 'text/plain', metadata: dict = None) -> str:
        """Upload text content to S3"""
        try:
            # Sanitize metadata values for ASCII
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
                Metadata=safe_metadata or {}
            )
            logger.info(f"Uploaded to S3: s3://{bucket}/{key}")
            return key
        except ClientError as e:
            logger.error(f"Failed to upload to S3: {e}")
            raise

    def download_file(self, bucket: str, key: str, local_path: str):
        """Download file from S3 to local path"""
        try:
            self.client.download_file(bucket, key, local_path)
        except ClientError as e:
            logger.error(f"Failed to download file from S3: {e}")
            raise

    def upload_summary(self, bucket: str, book_id: str, summary_json: str,
                       summary_type: str, metadata: dict) -> str:
        """Store a finished summary and return its object key.

        Key layout: summary/<bookId>_<type>_summary.json. Unchanged since the
        first release so existing Book.summaryStorageKey values stay valid.
        """
        key = f"summary/{book_id}_{summary_type}_summary.json"
        self.upload_text(
            bucket=bucket,
            key=key,
            content=summary_json,
            content_type='application/json',
            metadata={
                'book_id': book_id,
                'summary_type': summary_type,
                'original_tokens': str(metadata.get('original_tokens', 0)),
                'summary_tokens': str(metadata.get('summary_tokens', 0)),
                'compression_ratio': str(metadata.get('compression_ratio', 0)),
                'summarization_strategy': str(metadata.get('summarization_strategy', '')),
            },
        )
        return key
