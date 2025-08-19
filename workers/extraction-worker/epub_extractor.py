#!/opt/anaconda3/bin/python

import ebooklib
from ebooklib import epub
import re
import boto3
import tempfile
import os
import logging
from typing import Dict, Tuple
from botocore.exceptions import ClientError
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

class SimpleEPUBExtractor:
    def __init__(self, s3_endpoint: str, s3_access_key: str, s3_secret_key: str):
        """
        Simple EPUB extractor using ebooklib
        
        - ebooklib: Python library for reading EPUB files
        - BeautifulSoup: For cleaning HTML content from EPUB chapters
        - Maintains similar structure to PDF extractor
        """
        self.s3_client = boto3.client(
            's3',
            endpoint_url=s3_endpoint,
            aws_access_key_id=s3_access_key,
            aws_secret_access_key=s3_secret_key
        )
    
    def extract_text_from_epub_file(self, epub_path: str) -> Tuple[str, Dict]:
        """
        Extract text from local EPUB file using ebooklib
        
        Args:
            epub_path: Path to the EPUB file
            
        Returns:
            Tuple of (extracted_text, metadata)
        """
        try:
            book = epub.read_epub(epub_path)
            logger.info(f"Opened EPUB file: {book.get_metadata('DC', 'title')}")
            
            chapters_text = []
            metadata = {
                "title": book.get_metadata('DC', 'title')[0][0] if book.get_metadata('DC', 'title') else "Unknown",
                "author": book.get_metadata('DC', 'creator')[0][0] if book.get_metadata('DC', 'creator') else "Unknown",
                "extraction_method": "ebooklib",
                "chapters_processed": 0,
                "total_items": 0
            }
            
            # Get all items in the book
            items = list(book.get_items())
            metadata["total_items"] = len(items)
            
            for item in items:
                # Only process HTML/XHTML content items
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    try:
                        # Get the content as bytes and decode
                        content = item.get_body_content().decode('utf-8')
                        
                        # Parse HTML and extract text
                        soup = BeautifulSoup(content, 'html.parser')
                        
                        # Remove script and style elements
                        for script in soup(["script", "style"]):
                            script.decompose()
                        
                        # Extract text
                        text = soup.get_text()
                        
                        if text and len(text.strip()) > 100:  # Only include substantial content
                            # Clean the text
                            cleaned_text = self._clean_epub_text(text)
                            
                            if cleaned_text:
                                chapter_title = item.get_name() or f"Chapter {metadata['chapters_processed'] + 1}"
                                chapters_text.append(f"--- {chapter_title} ---\n{cleaned_text}")
                                metadata["chapters_processed"] += 1
                                logger.debug(f"Processed: {chapter_title} - {len(cleaned_text)} characters")
                    
                    except Exception as e:
                        logger.warning(f"Failed to process item {item.get_name()}: {e}")
                        continue
            
            # Combine all chapters
            full_text = "\n\n".join(chapters_text)
            
            # Final cleaning
            cleaned_text = self._clean_content(full_text)
            
            logger.info(f"Extraction complete: {len(cleaned_text)} characters from {metadata['chapters_processed']} chapters")
            return cleaned_text, metadata
            
        except Exception as e:
            logger.error(f"EPUB extraction failed: {e}")
            raise
    
    def extract_from_s3_file(self, bucket: str, file_key: str) -> Tuple[str, Dict]:
        """
        Download EPUB from S3 and extract text
        
        Args:
            bucket: S3 bucket name
            file_key: S3 object key (fileStorageKey)
            
        Returns:
            Tuple of (extracted_text, metadata)
        """
        try:
            logger.info(f"Downloading EPUB from S3: s3://{bucket}/{file_key}")
            
            # Download to temporary file
            with tempfile.NamedTemporaryFile(suffix='.epub', delete=False) as temp_file:
                self.s3_client.download_file(bucket, file_key, temp_file.name)
                epub_path = temp_file.name
                
            try:
                # Extract text from downloaded EPUB
                extracted_text, metadata = self.extract_text_from_epub_file(epub_path)
                metadata['s3_bucket'] = bucket
                metadata['s3_key'] = file_key
                
                return extracted_text, metadata
                
            finally:
                # Clean up temporary file
                if os.path.exists(epub_path):
                    os.unlink(epub_path)
                    logger.debug(f"Cleaned up temporary file: {epub_path}")
                    
        except ClientError as e:
            logger.error(f"S3 download failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Extraction from S3 failed: {e}")
            raise
    
    def _clean_epub_text(self, text: str) -> str:
        """
        Clean text extracted from EPUB HTML content
        
        Args:
            text: Raw text from HTML
            
        Returns:
            Cleaned text
        """
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove common EPUB artifacts
        text = re.sub(r'^\s*\n', '', text, flags=re.MULTILINE)
        text = re.sub(r'\n\s*$', '', text, flags=re.MULTILINE)
        
        # Split into sentences for better cleaning
        sentences = text.split('. ')
        cleaned_sentences = []
        
        for sentence in sentences:
            sentence = sentence.strip()
            
            # Skip very short sentences that might be artifacts
            if len(sentence) < 10:
                continue
                
            # Skip sentences that are mostly numbers or special characters
            if re.match(r'^[\d\s\.\-_]+$', sentence):
                continue
                
            cleaned_sentences.append(sentence)
        
        return '. '.join(cleaned_sentences)
    
    def _clean_content(self, text: str) -> str:
        """
        Basic content cleaning - remove artifacts and normalize formatting
        
        Args:
            text: Raw extracted text
            
        Returns:
            Cleaned text
        """
        lines = text.split('\n')
        cleaned_lines = []
        
        # Patterns to remove
        skip_patterns = [
            r'^Page \d+',  # Page references
            r'^\s*$',      # Empty lines (we'll add them back selectively)
            r'^Table of Contents',  # TOC artifacts
            r'^Index$',    # Index artifacts
        ]
        
        prev_line_empty = True
        for line in lines:
            stripped = line.strip()
            
            # Skip if matches boilerplate patterns
            if any(re.match(pattern, stripped) for pattern in skip_patterns):
                continue
            
            # Skip very short lines that might be artifacts
            if len(stripped) < 3:
                continue
            
            # Add line with smart spacing
            if stripped:
                if not prev_line_empty:
                    cleaned_lines.append("")  # Add blank line for readability
                cleaned_lines.append(stripped)
                prev_line_empty = False
            else:
                prev_line_empty = True
        
        # Join and clean up whitespace
        cleaned_text = '\n'.join(cleaned_lines)
        cleaned_text = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned_text)  # Max 2 consecutive newlines
        
        logger.info(f"Content cleaning: {len(text)} -> {len(cleaned_text)} characters")
        return cleaned_text.strip()
    
    def save_extraction_to_s3(self, bucket: str, book_id: str, extracted_text: str, metadata: Dict) -> str:
        """
        Save extracted text to S3 as markdown file
        
        Args:
            bucket: S3 bucket for storing extractions
            book_id: Unique book identifier
            extracted_text: Cleaned text content
            metadata: Extraction metadata
            
        Returns:
            S3 key for the stored file
        """
        try:
            # Create markdown content
            markdown_content = f"""# Book Extraction: {book_id}

            ## Extraction Metadata
            - Title: {metadata.get('title', 'unknown')}
            - Author: {metadata.get('author', 'unknown')}
            - Total Items: {metadata.get('total_items', 'unknown')}
            - Chapters Processed: {metadata.get('chapters_processed', 0)}
            - Extraction Method: {metadata.get('extraction_method', 'unknown')}
            - Source S3: s3://{metadata.get('s3_bucket', '')}/{metadata.get('s3_key', '')}
            
            ---
            
            ## Content
            
            {extracted_text}
            """
            
            # Generate S3 key for extraction
            s3_key = f"{book_id}_extraction.md"
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=bucket,
                Key=s3_key,
                Body=markdown_content.encode('utf-8'),
                ContentType='text/markdown',
                Metadata={
                    'book_id': book_id,
                    'title': metadata.get('title', ''),
                    'author': metadata.get('author', ''),
                    'chapters_processed': str(metadata.get('chapters_processed', 0)),
                    'content_length': str(len(extracted_text))
                }
            )

            logger.info(f"Saved extraction to S3: s3://{bucket}/{s3_key}")
            return s3_key
            
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            raise