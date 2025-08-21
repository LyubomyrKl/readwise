#!/usr/bin/env python3

import re
import json
import tiktoken
from typing import List, Dict, Tuple, Optional, Any
import openai
import logging
from datetime import datetime
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

class TextSummarizer:
    def __init__(self, s3_endpoint: str, s3_access_key: str, s3_secret_key: str, 
                 ollama_base_url: str = "http://localhost:11434", ollama_model: str = "qwen2.5:14b-instruct-q5_k_m"):
        """
        Simplified text summarizer for JSON-based summarization with chunk overlap
        
        Args:
            s3_endpoint: S3 endpoint for storing summaries
            s3_access_key: S3 access key ID
            s3_secret_key: S3 secret access key
            ollama_base_url: Ollama server base URL
            ollama_model: Ollama model to use
        """
        self.s3_client = boto3.client(
            's3',
            endpoint_url=s3_endpoint,
            aws_access_key_id=s3_access_key,
            aws_secret_access_key=s3_secret_key
        )
        
        # Initialize Ollama client using OpenAI-compatible API
        self.openai_client = openai.OpenAI(
            base_url=f"{ollama_base_url}/v1",
            api_key="ollama"
        )
        self.openai_model = ollama_model
        
        # Initialize tokenizer for token counting
        self.tokenizer = tiktoken.get_encoding("cl100k_base")

    def segment_and_summarize_json(self, json_data: Dict, summary_type: str = 'extractive',
                                  summary_percent: float = 0.3, 
                                  target_tokens_per_chunk: int = 600) -> Tuple[Dict, Dict]:
        """
        Segment JSON subsections into ~600 token chunks and summarize each chunk
        
        Args:
            json_data: Input JSON data with sections and subsections
            summary_type: 'extractive' or 'abstractive'
            summary_percent: Percentage of original content to retain
            target_tokens_per_chunk: Target token count per chunk (~600)
            
        Returns:
            Tuple of (segmented_json, metadata)
        """
        logger.info(f"Starting JSON segmentation and summarization...")
        
        total_original_tokens = 0
        total_summary_tokens = 0
        processed_sections = []
        
        for section in json_data.get('sections', []):
            logger.info(f"Processing section: {section.get('title', 'Untitled')}")
            
            processed_section = {
                'id': section['id'],
                'title': section['title'],
                'level': section['level'],
                'start_char': section['start_char'],
                'end_char': section['end_char'],
                'content': section['content'],
                'subsections': []
            }
            
            # Process each subsection
            for subsection in section.get('subsections', []):
                logger.info(f"Processing subsection: {subsection.get('title', 'Untitled')}")
                
                # Segment subsection content into chunks with overlap
                chunks = self._segment_content_into_chunks_with_overlap(
                    subsection['content'], 
                    target_tokens_per_chunk
                )
                
                logger.info(f"Split subsection into {len(chunks)} chunks with overlap")
                
                # Summarize each chunk
                summarized_chunks = []
                for i, chunk in enumerate(chunks):
                    chunk_tokens = len(self.tokenizer.encode(chunk))
                    total_original_tokens += chunk_tokens
                    
                    logger.info(f"Summarizing chunk {i+1}/{len(chunks)} ({chunk_tokens} tokens)")
                    
                    # Summarize this chunk
                    if summary_type.lower() == 'extractive':
                        chunk_summary = self._extractive_summarization_chunk(chunk, summary_percent)
                    elif summary_type.lower() == 'abstractive':
                        chunk_summary = self._abstractive_summarization_chunk(chunk, summary_percent)
                    else:
                        raise ValueError(f"Unknown summary type: {summary_type}")
                    
                    summary_tokens = len(self.tokenizer.encode(chunk_summary))
                    total_summary_tokens += summary_tokens
                    
                    summarized_chunks.append({
                        'chunk_id': f"{subsection['id']}_chunk_{i+1}",
                        'content': chunk_summary,
                        'original_tokens': chunk_tokens,
                        'summary_tokens': summary_tokens
                    })
                
                # Create new subsection with summarized chunks
                processed_subsection = {
                    'id': subsection['id'],
                    'title': subsection['title'],
                    'level': subsection['level'],
                    'start_char': subsection['start_char'],
                    'end_char': subsection['end_char'],
                    'content': '\n\n'.join([chunk['content'] for chunk in summarized_chunks]),
                    'chunks': summarized_chunks
                }
                
                processed_section['subsections'].append(processed_subsection)
            
            processed_sections.append(processed_section)
        
        # Create result JSON
        result_json = {
            'sections': processed_sections
        }
        
        # Calculate overall metadata
        compression_ratio = total_summary_tokens / total_original_tokens if total_original_tokens > 0 else 0
        metadata = {
            'summary_type': summary_type,
            'original_tokens': total_original_tokens,
            'summary_tokens': total_summary_tokens,
            'compression_ratio': compression_ratio,
            'target_percent': summary_percent,
            'target_tokens_per_chunk': target_tokens_per_chunk,
            'timestamp': datetime.now().isoformat()
        }
        
        logger.info(f"JSON segmentation complete: {total_original_tokens} → {total_summary_tokens} tokens ({compression_ratio:.1%})")
        
        return result_json, metadata

    def _segment_content_into_chunks_with_overlap(self, content: str, target_tokens: int, overlap_percent: float = 0.15) -> List[str]:
        """
        Split content into chunks with overlap of approximately target_tokens size
        
        Args:
            content: Text content to split
            target_tokens: Target token count per chunk
            overlap_percent: Percentage of overlap between chunks (default 15%)
            
        Returns:
            List of content chunks with overlap
        """
        # First, check if content is already small enough
        content_tokens = len(self.tokenizer.encode(content))
        if content_tokens <= target_tokens:
            return [content]
        
        # Split into sentences first
        sentences = re.split(r'(?<=[.!?])\s+', content)
        
        chunks = []
        overlap_size = int(target_tokens * overlap_percent)
        step_size = target_tokens - overlap_size
        
        current_chunk = []
        current_tokens = 0
        sentence_idx = 0
        
        while sentence_idx < len(sentences):
            sentence = sentences[sentence_idx]
            sentence_tokens = len(self.tokenizer.encode(sentence))
            
            # If adding this sentence would exceed target, finalize current chunk
            if current_tokens + sentence_tokens > target_tokens and current_chunk:
                chunks.append(' '.join(current_chunk))
                
                # Start new chunk with overlap
                # Keep last overlap_size tokens worth of sentences
                overlap_tokens = 0
                overlap_sentences = []
                for sent in reversed(current_chunk):
                    sent_tokens = len(self.tokenizer.encode(sent))
                    if overlap_tokens + sent_tokens <= overlap_size:
                        overlap_sentences.insert(0, sent)
                        overlap_tokens += sent_tokens
                    else:
                        break
                
                current_chunk = overlap_sentences
                current_tokens = overlap_tokens
            
            current_chunk.append(sentence)
            current_tokens += sentence_tokens
            sentence_idx += 1
        
        # Add remaining chunk
        if current_chunk:
            chunks.append(' '.join(current_chunk))
        
        return chunks

    def _extractive_summarization_chunk(self, chunk: str, summary_percent: float) -> str:
        """
        Extractive summarization for a single chunk using Ollama
        """
        try:
            prompt = f"""You are an extractive summarizer. Select and preserve the most important sentences from the original text.

Instructions:
- Extract approximately {int(summary_percent * 100)}% of the most important sentences
- Keep sentences EXACTLY as they appear in the original text
- Preserve the original order and structure
- Include key facts, conclusions, definitions, and important statements
- Maintain any existing headings or section markers
- Return as plain text, preserving paragraph breaks and structure

Text to extract from:
{chunk}

Return only the extracted sentences as plain text."""

            response = self.openai_client.chat.completions.create(
                model=self.openai_model,
                messages=[
                    {"role": "system", "content": "You are an expert at extractive summarization, selecting the most important sentences while preserving their original form."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=min(1200, int(len(self.tokenizer.encode(chunk)) * summary_percent * 1.5)),
                temperature=0.1
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.error(f"Extractive summarization failed for chunk: {e}")
            return chunk  # Return original chunk as fallback

    def _abstractive_summarization_chunk(self, chunk: str, summary_percent: float) -> str:
        """
        Abstractive summarization for a single chunk using Ollama
        """
        try:
            prompt = f"""You are an abstractive summarizer. Rewrite and condense the content in your own words without adding outside information.

Instructions:
- Condense to approximately {int(summary_percent * 100)}% of the original length
- Rewrite in your own words while preserving all key information
- Maintain the logical flow and structure of the original
- Keep all facts, numbers, definitions, and important details accurate
- Use clear, concise language appropriate to the content's domain
- Preserve any existing headings or section structure
- Return as plain text, preserving paragraph breaks and structure

Text to summarize:
{chunk}

Return only the rewritten summary as plain text."""

            response = self.openai_client.chat.completions.create(
                model=self.openai_model,
                messages=[
                    {"role": "system", "content": "You are an expert at abstractive summarization, rewriting content concisely while preserving all key information."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=min(1800, int(len(self.tokenizer.encode(chunk)) * summary_percent * 1.5)),
                temperature=0.3
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.error(f"Abstractive summarization failed for chunk: {e}")
            return chunk  # Return original chunk as fallback

    def save_summary_to_s3(self, bucket: str, book_id: str, summary_json: str,
                          summary_type: str, metadata: Dict) -> str:
        """
        Save summary JSON to S3
        """
        try:
            # Generate S3 key
            s3_key = f"summary/{book_id}_{summary_type}_summary.json"
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=bucket,
                Key=s3_key,
                Body=summary_json.encode('utf-8'),
                ContentType='application/json',
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