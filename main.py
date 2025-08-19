#!/opt/anaconda3/bin/python

import json
import logging
import os
import pika
import asyncio
from dotenv import load_dotenv
from prisma import Prisma
from simple_pdf_extractor import SimplePDFExtractor
from datetime import datetime

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

db = Prisma()

# Initialize PDF extractor
pdf_extractor = SimplePDFExtractor(
    s3_endpoint=os.getenv('S3_ENDPOINT', 'http://localhost:9000'),
    s3_access_key=os.getenv('S3_ACCESS_KEY_ID', 'minioadmin'),
    s3_secret_key=os.getenv('S3_SECRET_ACCESS_KEY', 'minioadmin')
)

async def process_pdf_extraction(book_id: str):
    """
    Process PDF extraction for a book using fileStorageKey
    
    Steps explained:
    1. Get book from database using book_id
    2. Check if fileStorageKey ends with .pdf
    3. Download PDF from S3 using fileStorageKey
    4. Extract text using pdfplumber (handles embedded text)
    5. Clean content (remove headers/footers/page numbers)
    6. Save extraction markdown to S3
    7. Update database with extraction status
    """
    try:
        # Step 1: Get book from database
        book = await db.book.find_unique(where={'id': book_id})
        if not book:
            logger.error(f"Book not found: {book_id}")
            return
            
        logger.info(f"Processing book: {book.title} by {book.author}")
        logger.info(f"File storage key: {book.fileStorageKey}")
        
        # Step 2: Check if it's a PDF
        if not book.fileStorageKey.endswith('.pdf'):
            logger.info(f"Skipping non-PDF book: {book.fileStorageKey}")
            return
            
        # Step 3: Update book status to processing
        await db.book.update(
            where={'id': book_id},
            data={'status': 'processing'}
        )
        logger.info("Updated book status to 'processing'")
        
        # Step 4: Extract text from S3 PDF using fileStorageKey
        logger.info("Starting PDF text extraction from S3...")
        extracted_text, metadata = pdf_extractor.extract_from_s3_file(
            bucket='books',  # Assuming books are stored in 'books' bucket
            file_key=book.fileStorageKey
        )
        
        # Step 5: Save extraction to S3
        logger.info("Saving extraction to S3...")
        extraction_s3_key = pdf_extractor.save_extraction_to_s3(
            bucket='summaries',  # Store extractions in separate bucket
            book_id=book_id,
            extracted_text=extracted_text,
            metadata=metadata
        )
        
        # Step 6: Update database with extraction results
        # Note: summaryStorageKey in schema is enum (extractive/abstractive)
        # We'll use 'extractive' to mark that extraction is done
        await db.book.update(
            where={'id': book_id},
            data={
                'summaryStorageKey': 'extractive',  # Mark as extracted
                'status': 'ready',
                'description': f"Extracted: {extraction_s3_key}"  # Store S3 key in description
            }
        )
        
        # Step 7: Log success
        logger.info("✅ PDF extraction completed successfully!")
        logger.info(f"- Book: {book.title}")
        logger.info(f"- Extracted {len(extracted_text)} characters")
        logger.info(f"- Processed {metadata['pages_processed']}/{metadata['total_pages']} pages")
        logger.info(f"- Saved to: s3://extractions/{extraction_s3_key}")
        logger.info(f"- Database updated with status 'ready'")
        
    except Exception as e:
        logger.error(f"❌ Error processing book {book_id}: {e}")
        # Update book status to error
        try:
            await db.book.update(
                where={'id': book_id},
                data={'status': 'error'}
            )
        except:
            pass  # Don't fail if we can't update status

async def process_message_async(message_data):
    await db.connect()
    try:
        logger.info(f"📨 Received message: {message_data}")
        
        if 'bookId' in message_data:
            book_id = message_data['bookId']
            logger.info(f"🔄 Processing PDF extraction for book: {book_id}")
            await process_pdf_extraction(book_id)
        else:
            logger.warning("⚠️  Message missing 'bookId' field")
        
    finally:
        await db.disconnect()

def message_callback(ch, method, _properties, body):
    try:
        message_data = json.loads(body)
        logger.info(f"Received message: {message_data}")
        
        # Process message with async database operations
        asyncio.run(process_message_async(message_data))
        
        ch.basic_ack(delivery_tag=method.delivery_tag)
        logger.info("Message processed successfully")
        
    except Exception as e:
        logger.error(f"Error processing message: {e}")
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def setup_queue_consumer():
    amqp_url = os.getenv('AMQP_URL', 'amqp://user:pass@localhost:5672/')
    connection = pika.BlockingConnection(pika.URLParameters(amqp_url))

    channel = connection.channel()
    channel.queue_declare(queue='summary_request', durable=True)

    return connection, channel

def main():
    connection = None
    channel = None
    try:
        connection, channel = setup_queue_consumer()
        
        channel.basic_qos(prefetch_count=1)
        channel.basic_consume(
            queue='summary_request',
            on_message_callback=message_callback
        )
        
        logger.info("Worker started. Waiting for messages on 'summary_request' queue...")
        channel.start_consuming()
        
    except KeyboardInterrupt:
        logger.info("Stopping worker...")
        if channel:
            channel.stop_consuming()
        if connection:
            connection.close()

if __name__ == "__main__":
    main()