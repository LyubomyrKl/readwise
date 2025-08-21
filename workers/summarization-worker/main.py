#!/usr/bin/env python3

import json
import logging
import os
import asyncio
import sys
import boto3
from dotenv import load_dotenv

# Add parent directories to path for shared imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from shared.database import DatabaseManager
from shared.messaging import RabbitMQManager
from text_summarizer import TextSummarizer

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SummarizationWorker:
    def __init__(self):
        self.db_manager = DatabaseManager()
        self.messaging = RabbitMQManager()
        self.queue_name = 'summary_request'
        
        # Initialize S3 client for downloading extractions
        self.s3_client = boto3.client(
            's3',
            endpoint_url=os.getenv('S3_ENDPOINT', 'http://localhost:9000'),
            aws_access_key_id=os.getenv('S3_ACCESS_KEY_ID', 'minioadmin'),
            aws_secret_access_key=os.getenv('S3_SECRET_ACCESS_KEY', 'minioadmin')
        )
        
        # Initialize text summarizer
        self.text_summarizer = TextSummarizer(
            s3_endpoint=os.getenv('S3_ENDPOINT', 'http://localhost:9000'),
            s3_access_key=os.getenv('S3_ACCESS_KEY_ID', 'minioadmin'),
            s3_secret_key=os.getenv('S3_SECRET_ACCESS_KEY', 'minioadmin'),
            ollama_base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434'),
            ollama_model=os.getenv('OLLAMA_MODEL', 'qwen2.5:14b-instruct-q5_k_m')
        )
        
        # Worker configuration
        self.prefetch_count = int(os.getenv('WORKER_PREFETCH_COUNT', '1'))
        self.worker_id = os.getenv('WORKER_ID', 'summarization-worker-1')
    
    async def process_summarization(self, book_id: str, summary_type: str = 'extractive', summary_percent: float = 0.3):
        """Process summarization for a book with JSON segmentation"""
        try:
            # Get book from database
            book = await self.db_manager.get_book(book_id)
            if not book:
                logger.error(f"Book not found: {book_id}")
                return
            
            logger.info(f"📖 Processing {summary_type} summarization with segmentation for: {book.title}")
            
            # Check if extraction exists
            if not book.extractionStorageKey:
                logger.error(f"No extraction found for book {book_id}. Run extraction first.")
                return
            
            extraction_s3_key = book.extractionStorageKey
            logger.info(f"📂 Using extraction: {extraction_s3_key}")
            
            # Download extracted text from S3
            try:
                response = self.s3_client.get_object(
                    Bucket='summaries',
                    Key=extraction_s3_key
                )
                extracted_markdown = response['Body'].read().decode('utf-8')
                
                # Extract just the content section from the markdown
                if "## Content" in extracted_markdown:
                    extracted_text = extracted_markdown.split("## Content")[1].strip()
                else:
                    extracted_text = extracted_markdown
                
                logger.info(f"📄 Loaded extracted text: {len(extracted_text)} characters")
                
            except Exception as e:
                logger.error(f"Failed to download extraction from S3: {e}")
                return
            
            # Update status to processing
            await self.db_manager.update_book_status(book_id, 'processing')
            
            # First, convert text to JSON format using text segmentation
            logger.info("🔧 Converting text to segmented JSON format...")
            from text_segmentation import DeterministicSegmenter
            
            segmenter = DeterministicSegmenter()
            json_data = segmenter.segment_text_to_json(extracted_text)
            
            logger.info(f"📊 Segmented into {len(json_data.get('sections', []))} sections")
            
            # Perform JSON-based summarization with 600 token chunks
            logger.info(f"🤖 Starting {summary_type} summarization with 600-token segmentation...")
            summary_json, summary_metadata = self.text_summarizer.segment_and_summarize_json(
                json_data=json_data,
                summary_type=summary_type,
                summary_percent=summary_percent,
                target_tokens_per_chunk=600
            )
            
            # Convert summary JSON to string for storage
            summary_json_str = json.dumps(summary_json, indent=2, ensure_ascii=False)
            
            # Save summary to S3
            logger.info("💾 Saving segmented summary to S3...")
            summary_s3_key = self.text_summarizer.save_summary_to_s3(
                bucket='summaries',
                book_id=book_id,
                summary_json=summary_json_str,
                summary_type=summary_type,  # Use original summary type, not _segmented
                metadata=summary_metadata
            )
            
            # Update database with summary information (use original summary type)
            await self.db_manager.update_book_summary(book_id, summary_type, summary_s3_key)
            
            # Log success
            logger.info("✅ Segmented text summarization completed successfully!")
            logger.info(f"- Book: {book.title}")
            logger.info(f"- Summary type: {summary_type} (with segmentation)")
            logger.info(f"- Original tokens: {summary_metadata['original_tokens']:,}")
            logger.info(f"- Summary tokens: {summary_metadata['summary_tokens']:,}")
            logger.info(f"- Compression: {summary_metadata['compression_ratio']:.1%}")
            logger.info(f"- Target tokens per chunk: {summary_metadata.get('target_tokens_per_chunk', 600)}")
            logger.info(f"- Saved to: s3://summaries/{summary_s3_key}")
            
        except Exception as e:
            logger.error(f"❌ Error processing segmented summarization for book {book_id}: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            try:
                await self.db_manager.update_book_status(book_id, 'error')
            except:
                pass
    
    async def process_message_async(self, message_data):
        """Process a message asynchronously"""
        await self.db_manager.connect()
        try:
            logger.info(f"📨 Received message: {message_data}")
            
            if 'bookId' not in message_data:
                logger.warning("⚠️  Message missing 'bookId' field")
                return
            
            book_id = message_data['bookId']
            task_type = message_data.get('task', 'summarize')
            
            if task_type == 'summarize':
                summary_type = message_data.get('summaryType', 'extractive')
                summary_percent = message_data.get('summaryPercent', 0.3)
                
                logger.info(f"📝 Processing {summary_type} summarization for book: {book_id}")
                logger.info(f"📊 Target compression: {summary_percent:.1%}")
                
                await self.process_summarization(book_id, summary_type, summary_percent)
            else:
                logger.warning(f"⚠️  Unknown task type: {task_type}")
                
        finally:
            await self.db_manager.disconnect()
    
    def message_callback(self, ch, method, properties, body):
        """Handle incoming messages with enhanced error handling"""
        message_data = None
        processing_successful = False
        
        try:
            # Parse message
            message_data = json.loads(body)
            logger.info(f"📝 [{self.worker_id}] Received summarization request: {message_data}")
            
            # Log message properties for debugging
            if properties.message_id:
                logger.debug(f"📨 Message ID: {properties.message_id}")
            if properties.correlation_id:
                logger.debug(f"🔗 Correlation ID: {properties.correlation_id}")
            
            # Process message with async database operations
            asyncio.run(self.process_message_async(message_data))
            processing_successful = True
            logger.info(f"✅ [{self.worker_id}] Message processing completed successfully")
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ [{self.worker_id}] Invalid JSON in message: {e}")
            processing_successful = False
            
        except Exception as e:
            logger.error(f"❌ [{self.worker_id}] Error processing message: {e}")
            book_id = message_data.get('bookId', 'unknown') if message_data else 'unknown'
            logger.error(f"📖 Failed book ID: {book_id}")
            processing_successful = False
        
        # Handle message acknowledgment separately with robust error handling
        try:
            if hasattr(ch, 'is_closed') and ch.is_closed:
                logger.warning(f"⚠️ [{self.worker_id}] Channel is closed, cannot acknowledge message")
                return
                
            if processing_successful:
                ch.basic_ack(delivery_tag=method.delivery_tag)
                logger.debug(f"✅ [{self.worker_id}] Message acknowledged successfully")
            else:
                # Don't requeue failed messages to avoid infinite loops
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                logger.debug(f"❌ [{self.worker_id}] Message nacked (not requeued)")
                
        except Exception as ack_error:
            error_msg = str(ack_error)
            if "Transport indicated EOF" in error_msg or "Channel is closed" in error_msg:
                logger.warning(f"⚠️ [{self.worker_id}] Connection lost during acknowledgment - message may be redelivered")
            else:
                logger.error(f"❌ [{self.worker_id}] Unexpected acknowledgment error: {ack_error}")
            # Don't re-raise the error, let the worker continue
    
    def start(self):
        """Start the summarization worker with enhanced subscription management"""
        logger.info(f"🚀 Starting Summarization Worker [{self.worker_id}]...")
        logger.info(f"📋 Configuration:")
        logger.info(f"   - Queue: {self.queue_name}")
        logger.info(f"   - Prefetch Count: {self.prefetch_count}")
        logger.info(f"   - Worker ID: {self.worker_id}")
        logger.info(f"   - Ollama API: {'✅ Configured' if os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434') else '❌ Not configured'}")
        
        try:
            # Check queue status before starting
            try:
                queue_info = self.messaging.get_queue_info(self.queue_name)
                logger.info(f"📊 Queue status: {queue_info}")
            except Exception as queue_error:
                logger.warning(f"⚠️ Could not get queue info: {queue_error}")
            
            # Set up consumer with enhanced configuration
            connection, channel = self.messaging.setup_consumer(
                queue=self.queue_name,
                callback=self.message_callback,
                prefetch_count=self.prefetch_count
            )
            
            logger.info(f"📡 [{self.worker_id}] Consumer ready for '{self.queue_name}' queue")
            logger.info("💡 Worker is ready to process summarization requests...")
            
            # Start consuming with graceful shutdown
            self.messaging.start_consuming(self.queue_name)
            
        except KeyboardInterrupt:
            logger.info(f"🛑 [{self.worker_id}] Received keyboard interrupt, shutting down gracefully...")
            try:
                self.messaging.stop_consuming()
            except Exception as stop_error:
                logger.error(f"❌ Error during graceful shutdown: {stop_error}")
        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ Failed to start summarization worker: {e}")
            
            # Handle specific connection errors gracefully
            if any(term in error_msg for term in ["Channel is closed", "Connection closed", "Transport indicated EOF", "StreamLostError"]):
                logger.info(f"💭 [{self.worker_id}] RabbitMQ connection issue detected, worker will exit gracefully")
            elif "Connection refused" in error_msg:
                logger.error(f"🔌 [{self.worker_id}] Cannot connect to RabbitMQ - please check if RabbitMQ is running")
            else:
                logger.error(f"❌ [{self.worker_id}] Unexpected error: {e}")
                
        finally:
            logger.info(f"🛑 [{self.worker_id}] Summarization Worker stopped")
            try:
                if hasattr(self.messaging, 'connection') and self.messaging.connection:
                    self.messaging.close()
            except Exception as close_error:
                logger.debug(f"Error closing messaging connection: {close_error}")
                
    def restart_with_backoff(self, max_retries=3, base_delay=5):
        """Restart the worker with exponential backoff on connection failures"""
        for attempt in range(max_retries):
            try:
                logger.info(f"🔄 [{self.worker_id}] Attempt {attempt + 1}/{max_retries} to start worker")
                self.start()
                return  # Success, exit retry loop
                
            except KeyboardInterrupt:
                logger.info(f"🛑 [{self.worker_id}] Received keyboard interrupt during restart")
                raise
                
            except Exception as e:
                error_msg = str(e)
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)  # Exponential backoff
                    logger.warning(f"⏳ [{self.worker_id}] Retrying in {delay} seconds... ({error_msg})")
                    import time
                    time.sleep(delay)
                else:
                    logger.error(f"❌ [{self.worker_id}] Max retries exceeded. Final error: {e}")
                    raise

if __name__ == "__main__":
    worker = SummarizationWorker()
    
    # Check if restart with backoff is enabled via environment variable
    enable_restart = os.getenv('WORKER_AUTO_RESTART', 'false').lower() == 'true'
    
    try:
        if enable_restart:
            logger.info(f"🔄 [{worker.worker_id}] Auto-restart enabled")
            worker.restart_with_backoff()
        else:
            worker.start()
    except KeyboardInterrupt:
        logger.info(f"🛑 [{worker.worker_id}] Shutdown requested by user")
    except Exception as e:
        logger.error(f"❌ [{worker.worker_id}] Worker failed to start: {e}")
        exit(1)