#!/opt/anaconda3/bin/python

import pdfplumber
import re
import boto3
import tempfile
import os
import logging
from typing import Dict, Tuple
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

class SimplePDFExtractor:
    def __init__(self, s3_endpoint: str, s3_access_key: str, s3_secret_key: str):
        """
        Simple PDF extractor using pdfplumber
        
        - pdfplumber: Easy-to-use library for extracting text from PDFs
        - Works well with most PDFs, handles tables and layouts better than basic parsers
        - More reliable than PyMuPDF for installation
        """
        self.s3_client = boto3.client(
            's3',
            endpoint_url=s3_endpoint,
            aws_access_key_id=s3_access_key,
            aws_secret_access_key=s3_secret_key
        )
    
    def extract_text_from_pdf_file(self, pdf_path: str) -> Tuple[str, Dict]:
        """
        Extract text from local PDF file using pdfplumber
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            Tuple of (extracted_text, metadata)
        """
        try:
            with pdfplumber.open(pdf_path) as pdf:
                logger.info(f"Opened PDF with {len(pdf.pages)} pages")
                
                pages_text = []
                metadata = {
                    "total_pages": len(pdf.pages),
                    "extraction_method": "pdfplumber",
                    "pages_processed": 0
                }
                
                for i, page in enumerate(pdf.pages):
                    # Extract text from page
                    text = page.extract_text()
                    
                    if text:
                        pages_text.append(f"--- Page {i + 1} ---\n{text}")
                        metadata["pages_processed"] += 1
                        logger.debug(f"Page {i + 1}: Extracted {len(text)} characters")
                    else:
                        logger.warning(f"Page {i + 1}: No text found")
                
                # Combine all pages
                full_text = "\n\n".join(pages_text)
                
                # Clean the content
                cleaned_text = self._clean_content(full_text)
                
                logger.info(f"Extraction complete: {len(cleaned_text)} characters from {metadata['pages_processed']} pages")
                return cleaned_text, metadata
                
        except Exception as e:
            logger.error(f"PDF extraction failed: {e}")
            raise
    
    def extract_from_s3_file(self, bucket: str, file_key: str) -> Tuple[str, Dict]:
        """
        Download PDF from S3 and extract text
        
        Args:
            bucket: S3 bucket name
            file_key: S3 object key (fileStorageKey)
            
        Returns:
            Tuple of (extracted_text, metadata)
        """
        try:
            logger.info(f"Downloading PDF from S3: s3://{bucket}/{file_key}")
            
            # Download to temporary file
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
                self.s3_client.download_file(bucket, file_key, temp_file.name)
                pdf_path = temp_file.name
                
            try:
                # Extract text from downloaded PDF
                extracted_text, metadata = self.extract_text_from_pdf_file(pdf_path)
                metadata['s3_bucket'] = bucket
                metadata['s3_key'] = file_key
                
                return extracted_text, metadata
                
            finally:
                # Clean up temporary file
                if os.path.exists(pdf_path):
                    os.unlink(pdf_path)
                    logger.debug(f"Cleaned up temporary file: {pdf_path}")
                    
        except ClientError as e:
            logger.error(f"S3 download failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Extraction from S3 failed: {e}")
            raise
    
    def _clean_content(self, text: str) -> str:
        """
        Basic content cleaning - remove headers, footers, page numbers
        
        Args:
            text: Raw extracted text
            
        Returns:
            Cleaned text
        """
        lines = text.split('\n')
        cleaned_lines = []
        
        # Patterns to remove
        skip_patterns = [
            r'^\d+$',  # Standalone page numbers
            r'^Page \d+',  # "Page X" headers
            r'eprints\.umm\.ac\.id',  # Specific footer mentioned by user
            r'^\s*$',  # Empty lines (we'll add them back selectively)
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
            - Total Pages: {metadata.get('total_pages', 'unknown')}
            - Pages Processed: {metadata.get('pages_processed', 0)}
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
                    'total_pages': str(metadata.get('total_pages', 0)),
                    'content_length': str(len(extracted_text))
                }
            )


            logger.info(f"Saved extraction to S3: s3://{bucket}/{s3_key}")
            return s3_key


            
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            raise