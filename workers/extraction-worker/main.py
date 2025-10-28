#!/usr/bin/env python3

import json
import logging
import os
import asyncio
import re
import sys
from dotenv import load_dotenv

# Add parent directories to path for shared imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from shared.database import DatabaseManager
from shared.messaging import RabbitMQManager
from pdf_extractor import SimplePDFExtractor
from epub_extractor import SimpleEPUBExtractor

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def clean_text(text: str) -> str:
    if not text or not isinstance(text, str):
        return text

    # Remove various newline patterns
    text = re.sub(r'\\n+', ' ', text)  # Remove \n patterns
    text = re.sub(r'\\\\n+', ' ', text)  # Remove \\n patterns
    text = re.sub(r'\n+', ' ', text)  # Remove actual newlines
    text = re.sub(r'\\r+', ' ', text)  # Remove \r patterns
    text = re.sub(r'\r+', ' ', text)  # Remove actual carriage returns
    text = re.sub(r'\\t+', ' ', text)  # Remove \t patterns
    text = re.sub(r'\t+', ' ', text)  # Remove actual tabs

    # Normalize multiple spaces to single space
    text = re.sub(r' +', ' ', text)

    # Clean up whitespace at beginning and end
    text = text.strip()

    return text


class ExtractionWorker:
    def __init__(self):
        self.db_manager = DatabaseManager()
        self.messaging = RabbitMQManager()
        self.queue_name = 'extract_request'
        
        # Initialize extractors
        s3_config = {
            's3_endpoint': os.getenv('S3_ENDPOINT', 'http://localhost:9000'),
            's3_access_key': os.getenv('S3_ACCESS_KEY_ID', 'minioadmin'),
            's3_secret_key': os.getenv('S3_SECRET_ACCESS_KEY', 'minioadmin')
        }
        
        self.pdf_extractor = SimplePDFExtractor(**s3_config)
        self.epub_extractor = SimpleEPUBExtractor(**s3_config)
        
        # Worker configuration
        self.prefetch_count = int(os.getenv('WORKER_PREFETCH_COUNT', '1'))
        self.worker_id = os.getenv('WORKER_ID', 'extraction-worker-1')
    
    async def process_extraction(self, book_id: str):
        """Process extraction for a book"""
        try:
            # Get book from database
            book = await self.db_manager.get_book(book_id)
            if not book:
                logger.error(f"Book not found: {book_id}")
                return

            if book.status == "processing":
                logger.info(f"Book already in process book: {book_id}")
                return

            if book.extractionStorageKey:
                logger.info(f"Book already extracted: {book_id}")
                return


            logger.info(book.extractionStorageKey)
            logger.info(f"Processing book: {book.title} by {book.author}")
            logger.info(f"File storage key: {book.fileStorageKey}")

            file_key = book.fileStorageKey.lower()
            
            if file_key.endswith('.pdf'):
                extractor = self.pdf_extractor
                file_type = 'PDF'
            elif file_key.endswith('.epub'):
                extractor = self.epub_extractor
                file_type = 'EPUB'
            else:
                logger.warning(f"Unsupported file type: {book.fileStorageKey}")
                return
            
            # Update status to processing
            await self.db_manager.update_book_status(book_id, 'processing')
            logger.info(f"Updated book status to 'processing' for {file_type}")
            
            # Extract text
            logger.info(f"Starting {file_type} text extraction from S3...")

            extracted_text, metadata = extractor.extract_from_s3_file(
                bucket='books',
                file_key=book.fileStorageKey
            )

            cleaned_text = clean_text(extracted_text)
            
            # Save extraction to S3
            logger.info("Saving extraction to S3...")
            extraction_s3_key = extractor.save_extraction_to_s3(
                bucket='summaries',
                book_id=book_id,
                extracted_text=cleaned_text,
                metadata=metadata
            )
            
            # Update database with extraction results
            await self.db_manager.update_book_extraction(book_id, extraction_s3_key)

            # Log success
            logger.info(f"✅ {file_type} extraction completed successfully!")
            logger.info(f"- Book: {book.title}")
            logger.info(f"- Extracted {len(extracted_text)} characters")
            
            if file_type == 'PDF':
                logger.info(f"- Processed {metadata['pages_processed']}/{metadata['total_pages']} pages")
            else:
                logger.info(f"- Processed {metadata['chapters_processed']}/{metadata['total_items']} chapters")
            
            logger.info(f"- Saved to: s3://summaries/{extraction_s3_key}")

        except Exception as e:
            logger.error(f"❌ Error processing book {book_id}: {e}")
            try:
                await self.db_manager.update_book_status(book_id, 'ready')
            except:
                pass

    async def process_message_async(self, message_data):
        """Process a message asynchronously"""
        await self.db_manager.connect()
        try:
            if 'bookId' not in message_data:
                logger.warning("⚠️  Message missing 'bookId' field")
                return
            
            book_id = message_data['bookId']

            logger.info(f"🔄 Processing extraction for book: {book_id}")
            await self.process_extraction(book_id)

            if message_data.get('autoSummarize', True):
                self.messaging.send_summary_request(book_id, message_data['summarizationType'], message_data['summaryPercent'])

        finally:
            await self.db_manager.disconnect()
    
    def message_callback(self, ch, method, properties, body):
        """Handle incoming messages with enhanced error handling"""
        message_data = None
        try:
            # Parse message
            message_data = json.loads(body)
            logger.info(f"🔄 [{self.worker_id}] Received extraction request: {message_data}")
            
            # Log message properties for debugging
            if properties.message_id:
                logger.debug(f"📨 Message ID: {properties.message_id}")
            if properties.correlation_id:
                logger.debug(f"🔗 Correlation ID: {properties.correlation_id}")
            
            # Process message with async database operations
            asyncio.run(self.process_message_async(message_data))
            
            # Acknowledge successful processing
            ch.basic_ack(delivery_tag=method.delivery_tag)
            logger.info(f"✅ [{self.worker_id}] Message processed successfully")
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ [{self.worker_id}] Invalid JSON in message: {e}")
            # Don't requeue malformed messages
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            
        except Exception as e:
            logger.error(f"❌ [{self.worker_id}] Error processing message: {e}")
            book_id = message_data.get('bookId', 'unknown') if message_data else 'unknown'
            logger.error(f"📖 Failed book ID: {book_id}")
            
            # For processing errors, don't requeue to avoid infinite loops
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    
    def start(self):
        """Start the extraction worker with enhanced subscription management"""
        logger.info(f"🚀 Starting Extraction Worker [{self.worker_id}]...")
        logger.info(f"📋 Configuration:")
        logger.info(f"   - Queue: {self.queue_name}")
        logger.info(f"   - Prefetch Count: {self.prefetch_count}")
        logger.info(f"   - Worker ID: {self.worker_id}")
        
        try:
            # Check queue status before starting
            queue_info = self.messaging.get_queue_info(self.queue_name)

            # Set up consumer with enhanced configuration
            self.messaging.setup_consumer(
                queue=self.queue_name,
                callback=self.message_callback,
                prefetch_count=self.prefetch_count
            )

            logger.info(f"📡 [{self.worker_id}] Consumer ready for '{self.queue_name}' queue")
            logger.info("💡 Worker is ready to process extraction requests...")
            
            # Start consuming with graceful shutdown
            self.messaging.start_consuming(self.queue_name)
            
        except Exception as e:
            logger.error(f"❌ Failed to start extraction worker: {e}")
            raise
        finally:
            logger.info(f"🛑 [{self.worker_id}] Extraction Worker stopped")

if __name__ == "__main__":
    import time

    worker = ExtractionWorker()

    # Auto-reconnection is now always enabled
    reconnect_delay = int(os.getenv('WORKER_RECONNECT_DELAY', '5'))
    max_reconnect_attempts = int(os.getenv('WORKER_MAX_RECONNECT_ATTEMPTS', '0'))  # 0 = infinite

    attempt = 0
    while True:
        try:
            if attempt > 0:
                logger.info(f"🔄 [{worker.worker_id}] Reconnection attempt {attempt}")

            # Reinitialize messaging connection for each attempt
            worker.messaging = RabbitMQManager()
            worker.start()

            # If start() returns without exception, break (shouldn't happen in normal operation)
            break

        except KeyboardInterrupt:
            logger.info(f"🛑 [{worker.worker_id}] Shutdown requested by user")
            break

        except Exception as e:
            attempt += 1
            error_msg = str(e)

            # Check if we should retry
            if max_reconnect_attempts > 0 and attempt >= max_reconnect_attempts:
                logger.error(f"❌ [{worker.worker_id}] Max reconnection attempts ({max_reconnect_attempts}) reached. Exiting.")
                exit(1)

            # Check if it's a connection error that warrants reconnection
            is_connection_error = any(term in error_msg for term in [
                "Channel is closed", "Connection closed", "Transport indicated EOF",
                "StreamLostError", "Connection refused"
            ])

            if is_connection_error:
                logger.warning(f"⏳ [{worker.worker_id}] Connection lost. Reconnecting in {reconnect_delay} seconds...")
                time.sleep(reconnect_delay)
            else:
                logger.error(f"❌ [{worker.worker_id}] Unexpected error: {e}")
                logger.error(f"⏳ [{worker.worker_id}] Retrying in {reconnect_delay} seconds...")
                time.sleep(reconnect_delay)