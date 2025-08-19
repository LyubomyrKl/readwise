#!/opt/anaconda3/bin/python

import re
import os
import nltk
import tiktoken
from typing import List, Dict, Tuple, Optional
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import openai
import logging
from datetime import datetime
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    nltk.download('punkt_tab')

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords

class TextSummarizer:
    def __init__(self, s3_endpoint: str, s3_access_key: str, s3_secret_key: str, openai_api_key: Optional[str] = None):
        """
        Comprehensive text summarizer with both extractive and abstractive methods
        
        Args:
            s3_endpoint: S3 endpoint for storing summaries
            s3_access_key: S3 access key ID
            s3_secret_key: S3 secret access key
            openai_api_key: OpenAI API key for abstractive summarization
        """
        self.s3_client = boto3.client(
            's3',
            endpoint_url=s3_endpoint,
            aws_access_key_id=s3_access_key,
            aws_secret_access_key=s3_secret_key
        )
        
        # Initialize OpenAI client if API key provided
        if openai_api_key:
            openai.api_key = openai_api_key
            self.openai_client = openai.OpenAI(api_key=openai_api_key)
        else:
            self.openai_client = None
        
        # Initialize tokenizer for token counting
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.stop_words = set(stopwords.words('english'))
        
    def chunk_text_with_overlap(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[Dict]:
        """
        Split text into overlapping chunks with token counting
        
        Args:
            text: Input text to chunk
            chunk_size: Maximum tokens per chunk
            overlap: Number of overlapping tokens between chunks
            
        Returns:
            List of chunk dictionaries with text, start_pos, end_pos, token_count
        """
        logger.info(f"Chunking text: {len(text)} characters into {chunk_size} token chunks with {overlap} token overlap")
        
        # Tokenize the entire text
        tokens = self.tokenizer.encode(text)
        total_tokens = len(tokens)
        
        chunks = []
        start_idx = 0
        chunk_id = 0
        
        while start_idx < total_tokens:
            # Calculate end index for this chunk
            end_idx = min(start_idx + chunk_size, total_tokens)
            
            # Extract chunk tokens and decode back to text
            chunk_tokens = tokens[start_idx:end_idx]
            chunk_text = self.tokenizer.decode(chunk_tokens)
            
            # Find chapter boundaries in this chunk
            chapter_info = self._detect_chapter_boundaries(chunk_text)
            
            chunk_data = {
                'id': chunk_id,
                'text': chunk_text,
                'start_token': start_idx,
                'end_token': end_idx,
                'token_count': len(chunk_tokens),
                'start_char': len(self.tokenizer.decode(tokens[:start_idx])) if start_idx > 0 else 0,
                'end_char': len(self.tokenizer.decode(tokens[:end_idx])),
                'has_chapter_start': chapter_info['has_chapter_start'],
                'has_chapter_end': chapter_info['has_chapter_end'],
                'chapter_titles': chapter_info['chapter_titles']
            }
            
            chunks.append(chunk_data)
            logger.debug(f"Chunk {chunk_id}: {chunk_data['token_count']} tokens, chapters: {chapter_info['chapter_titles']}")
            
            # Move to next chunk with overlap
            if end_idx >= total_tokens:
                break
            start_idx = end_idx - overlap
            chunk_id += 1
        
        logger.info(f"Created {len(chunks)} chunks from {total_tokens} tokens")
        return chunks
    
    def _detect_chapter_boundaries(self, text: str) -> Dict:
        """
        Detect chapter boundaries and titles in text chunk
        
        Args:
            text: Text chunk to analyze
            
        Returns:
            Dictionary with chapter boundary information
        """
        chapter_patterns = [
            r'^Chapter\s+\d+.*$',
            r'^CHAPTER\s+\d+.*$',
            r'^\d+\.\s+[A-Z][^.]+$',
            r'^[A-Z][A-Z\s]{10,50}$',  # ALL CAPS headers
            r'^\s*\d+\s+[A-Z][^.]{5,}$',  # Numbered sections
        ]
        
        lines = text.split('\n')
        chapter_titles = []
        has_chapter_start = False
        has_chapter_end = False
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
                
            # Check if line matches chapter pattern
            for pattern in chapter_patterns:
                if re.match(pattern, line):
                    chapter_titles.append(line)
                    if i < len(lines) // 2:
                        has_chapter_start = True
                    else:
                        has_chapter_end = True
                    break
        
        return {
            'has_chapter_start': has_chapter_start,
            'has_chapter_end': has_chapter_end,
            'chapter_titles': chapter_titles
        }
    
    def extractive_summarization(self, chunks: List[Dict], summary_percent: float = 0.3) -> str:
        """
        Extractive summarization using TF-IDF and sentence ranking
        
        Args:
            chunks: List of text chunks
            summary_percent: Percentage of original content to retain (0.1 = 10%)
            
        Returns:
            Extractive summary as HTML markdown
        """
        logger.info(f"Starting extractive summarization with {summary_percent:.1%} compression")
        
        # Combine all chunk texts
        full_text = '\n\n'.join([chunk['text'] for chunk in chunks])
        
        # Split into sentences
        sentences = sent_tokenize(full_text)
        total_sentences = len(sentences)
        target_sentences = max(1, int(total_sentences * summary_percent))
        
        logger.info(f"Processing {total_sentences} sentences, targeting {target_sentences} for summary")
        
        # Create TF-IDF matrix
        tfidf = TfidfVectorizer(
            stop_words='english',
            max_features=1000,
            ngram_range=(1, 2),
            min_df=1,
            max_df=0.9
        )
        
        # Fit TF-IDF on sentences
        try:
            tfidf_matrix = tfidf.fit_transform(sentences)
        except ValueError:
            logger.warning("TF-IDF failed, using simple sentence ranking")
            return self._simple_extractive_summary(sentences, target_sentences, chunks)
        
        # Calculate sentence scores
        sentence_scores = np.array(tfidf_matrix.sum(axis=1)).flatten()
        
        # Rank sentences by score
        ranked_indices = np.argsort(sentence_scores)[::-1]
        
        # Select top sentences while maintaining order and avoiding duplicates
        selected_sentences = []
        seen_sentences = set()
        
        for idx in ranked_indices:
            if len(selected_sentences) >= target_sentences:
                break
            
            sentence = sentences[idx].strip()
            sentence_lower = sentence.lower()
            
            # Avoid duplicate content
            if sentence_lower not in seen_sentences and len(sentence) > 10:
                selected_sentences.append((idx, sentence))
                seen_sentences.add(sentence_lower)
        
        # Sort selected sentences by original order
        selected_sentences.sort(key=lambda x: x[0])
        
        # Build summary with chapter structure
        summary_parts = []
        current_chapter = None
        
        for _, sentence in selected_sentences:
            # Check if this sentence starts a new chapter
            if self._is_chapter_start(sentence):
                current_chapter = sentence
                summary_parts.append(f"\n<h2>{sentence}</h2>\n")
            else:
                summary_parts.append(f"<p>{sentence}</p>\n")
        
        summary_html = ''.join(summary_parts)
        
        logger.info(f"Extractive summary complete: {len(selected_sentences)} sentences selected")
        return summary_html
    
    def _simple_extractive_summary(self, sentences: List[str], target_count: int, chunks: List[Dict]) -> str:
        """
        Fallback extractive summarization using simple sentence scoring
        """
        logger.info("Using simple extractive summarization fallback")
        
        # Score sentences by length and keyword presence
        scores = []
        for sentence in sentences:
            score = 0
            words = word_tokenize(sentence.lower())
            
            # Length score (prefer medium-length sentences)
            length_score = min(len(words) / 20, 1.0) * (1 - max(0, (len(words) - 40) / 40))
            score += length_score
            
            # Keyword score (look for important terms)
            important_keywords = ['chapter', 'conclusion', 'results', 'findings', 'important', 'significant']
            keyword_score = sum(1 for word in words if word in important_keywords) / len(words)
            score += keyword_score * 2
            
            scores.append(score)
        
        # Select top sentences
        ranked_indices = np.argsort(scores)[::-1]
        selected = [(idx, sentences[idx]) for idx in ranked_indices[:target_count]]
        selected.sort(key=lambda x: x[0])
        
        # Format as HTML
        html_parts = []
        for _, sentence in selected:
            if self._is_chapter_start(sentence):
                html_parts.append(f"<h2>{sentence}</h2>\n")
            else:
                html_parts.append(f"<p>{sentence}</p>\n")
        
        return ''.join(html_parts)
    
    def abstractive_summarization(self, chunks: List[Dict], summary_percent: float = 0.3) -> str:
        """
        Abstractive summarization using OpenAI GPT
        
        Args:
            chunks: List of text chunks
            summary_percent: Percentage of original content to retain
            
        Returns:
            Abstractive summary as HTML markdown
        """
        if not self.openai_client:
            logger.warning("OpenAI client not configured, falling back to extractive summarization")
            return self.extractive_summarization(chunks, summary_percent)
        
        logger.info(f"Starting abstractive summarization with {summary_percent:.1%} compression")
        
        # Calculate target length
        total_tokens = sum(chunk['token_count'] for chunk in chunks)
        target_tokens = int(total_tokens * summary_percent)
        
        logger.info(f"Processing {total_tokens} tokens, targeting {target_tokens} tokens for summary")
        
        # Process chunks in batches to stay within API limits
        chunk_summaries = []
        max_chunk_tokens = 3000  # Leave room for prompt and response
        
        for i, chunk in enumerate(chunks):
            if chunk['token_count'] > max_chunk_tokens:
                # Split large chunks further
                sub_chunks = self._split_large_chunk(chunk, max_chunk_tokens)
                for sub_chunk in sub_chunks:
                    summary = self._summarize_chunk_with_ai(sub_chunk, summary_percent)
                    if summary:
                        chunk_summaries.append(summary)
            else:
                summary = self._summarize_chunk_with_ai(chunk, summary_percent)
                if summary:
                    chunk_summaries.append(summary)
        
        # Combine chunk summaries
        combined_summary = '\n\n'.join(chunk_summaries)
        
        # Final summarization pass if still too long
        final_tokens = len(self.tokenizer.encode(combined_summary))
        if final_tokens > target_tokens * 1.5:
            logger.info("Performing final summarization pass")
            combined_summary = self._final_summarization_pass(combined_summary, target_tokens)
        
        # Format as HTML markdown
        html_summary = self._format_as_html_markdown(combined_summary)
        
        logger.info(f"Abstractive summary complete: {len(html_summary)} characters")
        return html_summary
    
    def _summarize_chunk_with_ai(self, chunk: Dict, summary_percent: float) -> Optional[str]:
        """
        Summarize a single chunk using OpenAI
        """
        try:
            # Prepare prompt based on chapter information
            chapter_context = ""
            if chunk['chapter_titles']:
                chapter_context = f"This text is from chapter(s): {', '.join(chunk['chapter_titles'])}. "
            
            prompt = f"""Please summarize the following text, maintaining the key information and structure. {chapter_context}
The summary should be approximately {int(summary_percent * 100)}% of the original length.
If there are chapter headings, preserve them. Focus on main points, conclusions, and important details.

Text to summarize:
{chunk['text']}

Summary:"""

            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are an expert at creating concise, informative summaries while preserving document structure and key information."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=min(800, int(chunk['token_count'] * summary_percent * 2)),
                temperature=0.3
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.error(f"AI summarization failed for chunk {chunk['id']}: {e}")
            return None
    
    def _split_large_chunk(self, chunk: Dict, max_tokens: int) -> List[Dict]:
        """
        Split a large chunk into smaller sub-chunks
        """
        text = chunk['text']
        tokens = self.tokenizer.encode(text)
        
        sub_chunks = []
        for i in range(0, len(tokens), max_tokens):
            end_idx = min(i + max_tokens, len(tokens))
            sub_text = self.tokenizer.decode(tokens[i:end_idx])
            
            sub_chunk = {
                'id': f"{chunk['id']}.{i // max_tokens}",
                'text': sub_text,
                'token_count': end_idx - i,
                'chapter_titles': chunk['chapter_titles'] if i == 0 else []
            }
            sub_chunks.append(sub_chunk)
        
        return sub_chunks
    
    def _final_summarization_pass(self, text: str, target_tokens: int) -> str:
        """
        Perform final summarization if the combined summary is still too long
        """
        try:
            prompt = f"""Please create a final summary of this already-summarized text. 
The final summary should be approximately {target_tokens} tokens ({target_tokens // 4} words).
Maintain chapter structure and key points.

Text to summarize further:
{text}

Final summary:"""

            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are creating a final, concise summary while preserving the most important information and structure."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=target_tokens,
                temperature=0.3
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.error(f"Final summarization pass failed: {e}")
            return text
    
    def _format_as_html_markdown(self, text: str) -> str:
        """
        Format summary text as HTML markdown with proper structure
        """
        lines = text.split('\n')
        html_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check for chapter/section headers
            if self._is_chapter_start(line):
                html_lines.append(f"<h2>{line}</h2>")
            elif line.startswith('#'):
                # Markdown headers
                level = len(line) - len(line.lstrip('#'))
                header_text = line.lstrip('# ').strip()
                html_lines.append(f"<h{level}>{header_text}</h{level}>")
            elif line.startswith('-') or line.startswith('•'):
                # List items
                html_lines.append(f"<div><p>{line}</p></div>")
            else:
                # Regular paragraph
                html_lines.append(f"<p>{line}</p>")
        
        return '\n'.join(html_lines)
    
    def _is_chapter_start(self, text: str) -> bool:
        """
        Check if a line represents a chapter or section start
        """
        patterns = [
            r'^Chapter\s+\d+',
            r'^CHAPTER\s+\d+',
            r'^\d+\.\s+[A-Z]',
            r'^[A-Z][A-Z\s]{5,30}$'
        ]
        
        for pattern in patterns:
            if re.match(pattern, text.strip()):
                return True
        return False
    
    def save_summary_to_s3(self, bucket: str, book_id: str, summary_html: str, 
                          summary_type: str, metadata: Dict) -> str:
        """
        Save summary to S3 as HTML markdown file
        
        Args:
            bucket: S3 bucket name
            book_id: Book identifier
            summary_html: Summary content in HTML markdown format
            summary_type: 'extractive' or 'abstractive'
            metadata: Summary metadata
            
        Returns:
            S3 key for stored summary
        """
        try:
            # Create full HTML markdown document
            html_content = f"""# {summary_type.title()} Summary: {book_id}

            <div class="summary-metadata">
            <h3>Summary Information</h3>
            <p><strong>Summary Type:</strong> {summary_type}</p>
            <p><strong>Original Token Count:</strong> {metadata.get('original_tokens', 'unknown')}</p>
            <p><strong>Summary Token Count:</strong> {metadata.get('summary_tokens', 'unknown')}</p>
            <p><strong>Compression Ratio:</strong> {metadata.get('compression_ratio', 'unknown')}</p>
            <p><strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            </div>
            
            ---
            
                <div class="summary-content">
                {summary_html}
                </div>
            
            """
            
            # Generate S3 key
            s3_key = f"summaries/{book_id}_{summary_type}_summary.html"
            
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
    
    def summarize_text(self, text: str, summary_type: str = 'extractive', 
                      summary_percent: float = 0.3) -> Tuple[str, Dict]:
        """
        Main summarization method
        
        Args:
            text: Input text to summarize
            summary_type: 'extractive' or 'abstractive'
            summary_percent: Percentage of original content to retain
            
        Returns:
            Tuple of (summary_html, metadata)
        """
        logger.info(f"Starting {summary_type} summarization of {len(text)} characters")
        
        # Calculate original token count
        original_tokens = len(self.tokenizer.encode(text))
        
        # Create chunks with overlap
        chunks = self.chunk_text_with_overlap(text, chunk_size=1000, overlap=200)
        
        # Perform summarization
        if summary_type.lower() == 'extractive':
            summary_html = self.extractive_summarization(chunks, summary_percent)
        elif summary_type.lower() == 'abstractive':
            summary_html = self.abstractive_summarization(chunks, summary_percent)
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