#!/usr/bin/env python3

import json
import logging
import os
import asyncio
import sys
import time
from dotenv import load_dotenv

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from shared.database import DatabaseManager
from shared.messaging import RabbitMQManager
from shared.s3_storage import S3Storage
from text_summarizer import TextSummarizer
from segmentation import DeterministicSegmenter

# New pipeline imports
from config.settings import SummarizationSettings
from config.feature_flags import FeatureFlags
from orchestration.pipeline import SummarizationPipeline
from orchestration.pipeline_builder import PipelineBuilder

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Feature flag to enable new pipeline
USE_NEW_PIPELINE = os.getenv('USE_NEW_PIPELINE', 'false').lower() == 'true'


class SummarizationWorker:
    def __init__(self):
        self.db = DatabaseManager()
        self.messaging = RabbitMQManager()
        self.queue_name = 'summary_request'
        self.use_new_pipeline = USE_NEW_PIPELINE

        self.s3 = S3Storage(
            endpoint=os.getenv('S3_ENDPOINT', 'http://localhost:9000'),
            access_key=os.getenv('S3_ACCESS_KEY_ID', 'minioadmin'),
            secret_key=os.getenv('S3_SECRET_ACCESS_KEY', 'minioadmin')
        )

        # Legacy summarizer (always available for backward compatibility)
        self.summarizer = TextSummarizer(
            s3_endpoint=os.getenv('S3_ENDPOINT', 'http://localhost:9000'),
            s3_access_key=os.getenv('S3_ACCESS_KEY_ID', 'minioadmin'),
            s3_secret_key=os.getenv('S3_SECRET_ACCESS_KEY', 'minioadmin'),
            ollama_base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434'),
            ollama_model=os.getenv('OLLAMA_MODEL', 'qwen2.5:14b-instruct-q5_k_m')
        )

        # New pipeline (configured via environment/feature flags)
        if self.use_new_pipeline:
            pipeline_mode = os.getenv('PIPELINE_MODE', 'balanced')  # fast, balanced, quality
            builder = PipelineBuilder()

            # Apply preset
            if pipeline_mode == 'fast':
                builder.fast()
            elif pipeline_mode == 'quality':
                builder.quality()
            else:
                builder.balanced()

            # Configure Ollama
            builder.with_ollama(
                base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434'),
                model=os.getenv('OLLAMA_MODEL', 'qwen2.5:14b-instruct-q5_k_m'),
                embed_model=os.getenv('OLLAMA_EMBED_MODEL', 'bge-m3'),
            )

            self.pipeline_builder = builder
            logger.info(f"New pipeline enabled (mode: {pipeline_mode})")
        else:
            self.pipeline_builder = None

        self.segmenter = DeterministicSegmenter()

        self.prefetch_count = int(os.getenv('WORKER_PREFETCH_COUNT', '1'))
        self.worker_id = os.getenv('WORKER_ID', 'summarization-worker-1')

    async def process_summarization(self, book_id: str, summary_type: str = 'extractive', summary_percent: float = 0.3):
        """Process summarization for a book"""
        book = await self.db.get_book(book_id)
        if not book:
            logger.error(f"Book not found: {book_id}")
            return

        logger.info(f"Processing {summary_type} summarization for: {book.title}")

        if not book.extractionStorageKey:
            logger.error(f"No extraction found for book {book_id}")
            return

        # Download extraction
        extracted_markdown = self.s3.download_text('extractions', book.extractionStorageKey)

        # Extract content section
        if "## Content" in extracted_markdown:
            extracted_text = extracted_markdown.split("## Content")[1].strip()
        else:
            extracted_text = extracted_markdown

        logger.info(f"Loaded {len(extracted_text)} characters")

        await self.db.update_book_status(book_id, 'processing')

        # Segment text
        logger.info("Segmenting text...")
        json_data = self.segmenter.segment_text_to_json(extracted_text)
        logger.info(f"Segmented into {len(json_data.get('sections', []))} sections")

        # Use new pipeline or legacy summarizer
        if self.use_new_pipeline and self.pipeline_builder:
            logger.info(f"Using new pipeline for {summary_type} summarization...")
            summary_json, metadata = await self._process_with_new_pipeline(
                json_data, summary_type, summary_percent
            )
        else:
            logger.info(f"Using legacy summarizer for {summary_type} summarization...")
            summary_json, metadata = self.summarizer.segment_and_summarize_json(
                json_data=json_data,
                summary_type=summary_type,
                summary_percent=summary_percent,
                target_tokens_per_chunk=600,
                book_title=book.title,
                show_progress=True
            )

        # Save to S3
        summary_json_str = json.dumps(summary_json, indent=2, ensure_ascii=False)
        summary_s3_key = self._save_summary_to_s3(
            bucket='summaries',
            book_id=book_id,
            summary_json=summary_json_str,
            summary_type=summary_type,
            metadata=metadata
        )

        # Update database
        await self.db.update_book_summary(book_id, summary_type, summary_s3_key)

        logger.info(f"Summarization complete: {metadata['original_tokens']:,} → {metadata['summary_tokens']:,} tokens")

    async def _process_with_new_pipeline(self, json_data: dict, summary_type: str, summary_percent: float):
        """Process using the new async pipeline."""
        pipeline = self.pipeline_builder.build()

        async with pipeline:
            summary_json, metadata = await pipeline.process(
                json_data=json_data,
                summary_type=summary_type,
                summary_percent=summary_percent,
            )

        return summary_json, metadata

    def _save_summary_to_s3(self, bucket: str, book_id: str, summary_json: str,
                           summary_type: str, metadata: dict) -> str:
        """Save summary to S3 storage."""
        # Try new summarizer method first, fall back to legacy
        if hasattr(self.summarizer, 'save_summary_to_s3'):
            return self.summarizer.save_summary_to_s3(
                bucket=bucket,
                book_id=book_id,
                summary_json=summary_json,
                summary_type=summary_type,
                metadata=metadata
            )
        else:
            # Direct S3 upload
            key = f'summary/{book_id}_{summary_type}_summary.json'
            self.s3.upload_text(
                bucket=bucket,
                key=key,
                content=summary_json,
                content_type='application/json',
                metadata={
                    'book_id': book_id,
                    'summary_type': summary_type,
                    'original_tokens': str(metadata.get('original_tokens', 0)),
                    'summary_tokens': str(metadata.get('summary_tokens', 0)),
                }
            )
            return key

    async def process_message_async(self, message_data):
        """Process a message asynchronously"""
        await self.db.connect()
        try:
            if 'bookId' not in message_data:
                logger.warning("Message missing 'bookId' field")
                return

            book_id = message_data['bookId']
            task_type = message_data.get('task', 'summarize')

            if task_type == 'summarize':
                summary_type = message_data.get('summaryType', 'extractive')
                summary_percent = message_data.get('summaryPercent', 0.3)
                await self.process_summarization(book_id, summary_type, summary_percent)
            else:
                logger.warning(f"Unknown task type: {task_type}")

        except Exception as e:
            logger.error(f"Error processing book {message_data.get('bookId', 'unknown')}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            try:
                await self.db.update_book_status(message_data.get('bookId'), 'error')
            except:
                pass
        finally:
            await self.db.disconnect()

    def message_callback(self, ch, method, properties, body):
        """Handle incoming messages"""
        try:
            message_data = json.loads(body)
            logger.info(f"[{self.worker_id}] Received: {message_data}")

            asyncio.run(self.process_message_async(message_data))

            ch.basic_ack(delivery_tag=method.delivery_tag)
            logger.info(f"[{self.worker_id}] Message processed")

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON: {e}")
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

        except Exception as e:
            logger.error(f"Error: {e}")
            try:
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            except:
                pass

    def start(self):
        """Start the worker"""
        logger.info(f"Starting Summarization Worker [{self.worker_id}]")

        self.messaging.setup_consumer(
            queue=self.queue_name,
            callback=self.message_callback,
            prefetch_count=self.prefetch_count
        )

        logger.info(f"[{self.worker_id}] Ready for '{self.queue_name}' queue")
        self.messaging.start_consuming(self.queue_name)


def main():
    worker = SummarizationWorker()
    reconnect_delay = int(os.getenv('WORKER_RECONNECT_DELAY', '5'))

    while True:
        try:
            worker.messaging = RabbitMQManager()
            worker.start()
            break
        except KeyboardInterrupt:
            logger.info("Shutdown requested")
            break
        except Exception as e:
            logger.warning(f"Connection lost: {e}. Reconnecting in {reconnect_delay}s...")
            time.sleep(reconnect_delay)


if __name__ == "__main__":
    main()