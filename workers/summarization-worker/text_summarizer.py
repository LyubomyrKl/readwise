#!/usr/bin/env python3

import re
import os
import tiktoken
from typing import List, Dict, Tuple, Optional, Any
import openai
import logging
from datetime import datetime
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

_ROMAN = r"(?:M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))"
_CHAPTER_REGEXES = [
    re.compile(rf"^(?:Chapter|CHAPTER)\s+(?:\d+|{_ROMAN})\b.*$", re.MULTILINE),
    re.compile(rf"^(?:Part|PART)\s+(?:\d+|{_ROMAN})\b.*$", re.MULTILINE),
    re.compile(r"^(?:Section|SECTION)\s+\d+(?:\.\d+)*\b.*$", re.MULTILINE),
    re.compile(r"^(?:Prologue|Epilogue|Appendix)\b.*$", re.MULTILINE),
    # ALL CAPS headers, 10–80 chars, letters/digits/punct, at line start
    re.compile(r"^[A-Z][A-Z0-9 .,:;\"'()\-\u2013\u2014]{9,79}$", re.MULTILINE),
]

class TextSummarizer:
    def __init__(self, s3_endpoint: str, s3_access_key: str, s3_secret_key: str, openai_api_key: Optional[str] = None):
        """
        OpenAI-powered text summarizer for both extractive and abstractive methods
        
        Args:
            s3_endpoint: S3 endpoint for storing summaries
            s3_access_key: S3 access key ID
            s3_secret_key: S3 secret access key
            openai_api_key: OpenAI API key for AI summarization
        """
        self.s3_client = boto3.client(
            's3',
            endpoint_url=s3_endpoint,
            aws_access_key_id=s3_access_key,
            aws_secret_access_key=s3_secret_key
        )
        
        # Initialize OpenAI client
        if openai_api_key:
            self.openai_client = openai.OpenAI(api_key=openai_api_key)
        else:
            raise ValueError("OpenAI API key is required for AI-powered summarization")
        
        # Initialize tokenizer for token counting
        self.tokenizer = tiktoken.get_encoding("cl100k_base")

    def summarize_text(self, text: str, summary_type: str = 'extractive',
                       summary_percent: float = 0.3) -> Tuple[str, Dict]:
        """
        Main summarization method using OpenAI for both extractive and abstractive
        
        Args:
            text: Input text to summarize
            summary_type: 'extractive' or 'abstractive'
            summary_percent: Percentage of original content to retain
            
        Returns:
            Tuple of (summary_html, metadata)
        """
        logger.info(f"Starting OpenAI-powered {summary_type} summarization of {len(text)} characters")
        
        # Calculate original token count
        original_tokens = len(self.tokenizer.encode(text))
        
        # Create chunks with overlap
        chunks = self.chunk_text_with_overlap(text, chunk_size=3000, overlap=200)
        
        # Perform summarization using OpenAI
        if summary_type.lower() == 'extractive':
            summary_html = self._openai_extractive_summarization(chunks, summary_percent)
        elif summary_type.lower() == 'abstractive':
            summary_html = self._openai_abstractive_summarization(chunks, summary_percent)
        else:
            raise ValueError(f"Unknown summary type: {summary_type}")
        
        # Calculate final metrics
        summary_tokens = len(self.tokenizer.encode(summary_html))
        compression_ratio = summary_tokens / original_tokens if original_tokens > 0 else 0
        
        metadata = {
            'summary_type': summary_type,
            'original_tokens': original_tokens,
            'summary_tokens': summary_tokens,
            'compression_ratio': compression_ratio,
            'target_percent': summary_percent,
            'chunk_count': len(chunks),
            'timestamp': datetime.now().isoformat()
        }
        
        logger.info(f"Summarization complete: {original_tokens} → {summary_tokens} tokens ({compression_ratio:.1%})")
        
        return summary_html, metadata

    def chunk_text_with_overlap(
            self,
            text: str,
            chunk_size: int = 3000,
            overlap: int = 200,
            *,
            min_last_chunk_tokens: int = 500,
            add_special_tokens: Optional[bool] = None,  # passed through if tokenizer supports it
    ) -> List[Dict[str, Any]]:
        """
        Split text into overlapping token chunks.

        Units are tokens. Overlap is tokens. Output respects max chunk_size.
        Ensures the final chunk is not too small by sliding the last window back if needed.
        """
        if not isinstance(text, str):
            raise TypeError("text must be str")
        if chunk_size <= 0:
            raise ValueError("chunk_size must be > 0")
        if overlap < 0:
            raise ValueError("overlap must be >= 0")
        if overlap >= chunk_size:
            logger.warning("overlap >= chunk_size; clamping overlap to chunk_size - 1")
            overlap = chunk_size - 1

        # Encode
        try:
            if add_special_tokens is None:
                tokens = self.tokenizer.encode(text)
            else:
                tokens = self.tokenizer.encode(text, add_special_tokens=add_special_tokens)
        except TypeError:
            # Fallback for tokenizers that don't accept add_special_tokens
            tokens = self.tokenizer.encode(text)

        total = len(tokens)
        logger.info(
            "Chunking %d characters (%d tokens) into %d-token chunks with %d-token overlap",
            len(text), total, chunk_size, overlap
        )

        if total == 0:
            return []

        stride = chunk_size - overlap
        starts = list(range(0, total, stride))
        # Guarantee last window ends at total
        if starts[-1] + chunk_size < total:
            starts.append(total - chunk_size)

        # Avoid tiny trailing chunk by sliding back if necessary
        if total - starts[-1] < min_last_chunk_tokens and len(starts) > 1:
            proposed = max(total - chunk_size, 0)
            if proposed <= starts[-2]:  # keep progression
                proposed = min(starts[-2] + stride, max(total - min_last_chunk_tokens, 0))
            starts[-1] = proposed

        # De-duplicate and sort
        starts = sorted(set(max(0, s) for s in starts))

        chunks: List[Dict[str, Any]] = []
        for idx, s in enumerate(starts):
            e = min(s + chunk_size, total)
            ctoks = tokens[s:e]
            ctext = self.tokenizer.decode(ctoks)

            chapter_info = self._detect_chapter_boundaries(ctext)

            chunk = {
                "id": idx,
                "text": ctext,
                "start_token": s,
                "end_token": e,  # exclusive
                "token_count": len(ctoks),
                "chapter_titles": chapter_info["chapter_titles"],
                "chapter_matches": chapter_info["matches"],
            }
            chunks.append(chunk)
            logger.debug("Chunk %d: tokens [%d, %d) -> %d tokens", idx, s, e, len(ctoks))

        logger.info("Created %d chunks from %d tokens", len(chunks), total)
        return chunks

    def _detect_chapter_boundaries(self, text: str) -> Dict[str, Any]:
        """
        Return chapter-like headers found in this chunk.
        """
        titles: List[str] = []
        matches: List[Dict[str, Any]] = []

        # Cheap per-line filter to reduce false positives for ALL CAPS rule
        lines = text.splitlines()
        for i, raw in enumerate(lines):
            line = raw.strip()
            if not line or len(line) > 200:
                continue
            if line.lower() in {"the", "contents"}:
                continue

            hit = None
            for rx in _CHAPTER_REGEXES:
                m = rx.match(line)
                if m:
                    hit = rx
                    break

            if hit:
                titles.append(line)
                matches.append(
                    {
                        "line_index": i,
                        "title": line,
                        "pattern": hit.pattern,
                    }
                )

        return {"chapter_titles": titles, "matches": matches}

    def _openai_extractive_summarization(self, chunks: List[Dict], summary_percent: float) -> str:
        """
        Extractive summarization using OpenAI (selects key sentences from original text)
        """
        logger.info(f"Starting OpenAI extractive summarization with {summary_percent:.1%} compression")
        
        chunk_summaries = []
        
        for chunk in chunks:
            try:
                chapter_context = ""
                if chunk['chapter_titles']:
                    chapter_context = f"This text is from chapter(s): {', '.join(chunk['chapter_titles'])}. "
                
                prompt = f"""
                    You are an expert at extractive summarization. Select and preserve the most important sentences from the original text.
                    
                    {chapter_context}
                    
                    Instructions:
                    - Extract approximately {int(summary_percent * 100)}% of the most important sentences
                    - Keep sentences EXACTLY as they appear in the original text
                    - Preserve the original order and structure
                    - Include key facts, conclusions, definitions, and important statements
                    - Maintain any existing headings or section markers
                    - Output as clean HTML with <h2> for headings and <p> for paragraphs
                    
                    Text to extract from:
                    {chunk['text']}
                    
                    Return only the extracted sentences formatted as HTML.
                    """
                
                response = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are an expert at extractive summarization, selecting the most important sentences while preserving their original form."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=min(1500, int(chunk['token_count'] * summary_percent * 1.5)),
                    temperature=0.1
                )
                
                summary = response.choices[0].message.content.strip()
                if summary:
                    chunk_summaries.append(summary)
                    
            except Exception as e:
                logger.error(f"Extractive summarization failed for chunk {chunk['id']}: {e}")
                continue
        
        # Combine summaries
        combined_summary = '\n\n'.join(chunk_summaries)
        logger.info(f"Extractive summary complete: {len(combined_summary)} characters")
        return combined_summary

    def _openai_abstractive_summarization(self, chunks: List[Dict], summary_percent: float) -> str:
        """
        Abstractive summarization using OpenAI (rewrites content in new words)
        """
        logger.info(f"Starting OpenAI abstractive summarization with {summary_percent:.1%} compression")
        
        chunk_summaries = []
        
        for chunk in chunks:
            try:
                chapter_context = ""
                if chunk['chapter_titles']:
                    chapter_context = f"This text is from chapter(s): {', '.join(chunk['chapter_titles'])}. "
                
                prompt = f"""
You are an expert at abstractive summarization. Rewrite and condense the content in your own words.

{chapter_context}

Instructions:
- Create a concise summary that's approximately {int(summary_percent * 100)}% of the original length
- Rewrite in clear, concise language while preserving all key information
- Maintain the logical structure and flow
- Include all important facts, conclusions, and concepts
- Preserve any headings or section structure
- Output as clean HTML with <h2> for headings and <p> for paragraphs

Text to summarize:
{chunk['text']}

Return only the abstractive summary formatted as HTML.
"""
                
                response = self.openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are an expert at abstractive summarization, rewriting content concisely while preserving all key information."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=min(1500, int(chunk['token_count'] * summary_percent * 1.5)),
                    temperature=0.3
                )
                
                summary = response.choices[0].message.content.strip()
                if summary:
                    chunk_summaries.append(summary)
                    
            except Exception as e:
                logger.error(f"Abstractive summarization failed for chunk {chunk['id']}: {e}")
                continue
        
        # Combine summaries
        combined_summary = '\n\n'.join(chunk_summaries)
        
        # Final pass to ensure overall coherence if multiple chunks
        if len(chunks) > 1:
            combined_summary = self._final_summarization_pass(combined_summary, summary_percent)
        
        logger.info(f"Abstractive summary complete: {len(combined_summary)} characters")
        return combined_summary

    def _final_summarization_pass(self, text: str, summary_percent: float) -> str:
        """
        Perform final summarization pass to ensure coherence across chunks
        """
        try:
            target_tokens = int(len(self.tokenizer.encode(text)) * 0.8)  # Slight reduction
            
            prompt = f"""
                You are creating a final, coherent summary from multiple summary sections.
                
                Instructions:
                - Combine and organize the content into a single, flowing document
                - Remove any redundancy between sections
                - Maintain all key information and structure
                - Ensure smooth transitions between topics
                - Preserve headings and logical organization
                - Output as clean HTML with <h2> for headings and <p> for paragraphs
                
                Content to finalize:
                {text}
                
                Return only the final, coherent summary formatted as HTML.
                """

            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are creating a final, coherent summary while preserving all important information."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=target_tokens,
                temperature=0.2
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.error(f"Final summarization pass failed: {e}")
            return text

    def save_summary_to_s3(self, bucket: str, book_id: str, summary_html: str, 
                          summary_type: str, metadata: Dict) -> str:
        """
        Save summary to S3 as HTML markdown file
        
        Args:
            bucket: S3 bucket name
            book_id: Book identifier
            summary_html: Summary content in HTML format
            summary_type: 'extractive' or 'abstractive'
            metadata: Summary metadata
            
        Returns:
            S3 key for stored summary
        """
        try:
            # Create full HTML document
            html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>{summary_type.title()} Summary: {book_id}</title>
    <style>
        body {{ font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }}
        .summary-metadata {{ background-color: #f5f5f5; padding: 15px; border-left: 4px solid #007bff; margin-bottom: 20px; }}
        .summary-content {{ line-height: 1.6; }}
        .summary-content h2 {{ color: #333; border-bottom: 2px solid #007bff; padding-bottom: 5px; margin-top: 25px; }}
        .summary-content p {{ margin-bottom: 15px; text-align: justify; }}
    </style>
</head>
<body>
    <div class="summary-metadata">
        <h3>Summary Information</h3>
        <p><strong>Summary Type:</strong> {summary_type}</p>
        <p><strong>Original Token Count:</strong> {metadata.get('original_tokens', 'unknown'):,}</p>
        <p><strong>Summary Token Count:</strong> {metadata.get('summary_tokens', 'unknown'):,}</p>
        <p><strong>Compression Ratio:</strong> {metadata.get('compression_ratio', 'unknown'):.1%}</p>
        <p><strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    </div>

    <hr>

    <div class="summary-content">
        {summary_html}
    </div>
</body>
</html>"""
            
            # Generate S3 key
            s3_key = f"{book_id}_{summary_type}_summary.html"
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=bucket,
                Key=s3_key,
                Body=html_content.encode('utf-8'),
                ContentType='text/html',
                Metadata={
                    'book_id': book_id,
                    'summary_type': summary_type,
                    'original_tokens': str(metadata.get('original_tokens', 0)),
                    'summary_tokens': str(metadata.get('summary_tokens', 0)),
                    'compression_ratio': str(metadata.get('compression_ratio', 0))
                }
            )
            
            logger.info(f"Saved {summary_type} summary to S3: {s3_key}")
            return s3_key
            
        except ClientError as e:
            logger.error(f"Failed to save summary to S3: {e}")
            raise