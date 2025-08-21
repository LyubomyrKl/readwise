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
from .text_segmentation import TextSegmenter

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
    def __init__(self, s3_endpoint: str, s3_access_key: str, s3_secret_key: str, 
                 ollama_base_url: str = "http://localhost:11434", ollama_model: str = "qwen2.5:14b-instruct-q5_k_m"):
        """
        Ollama-powered text summarizer for both extractive and abstractive methods
        
        Args:
            s3_endpoint: S3 endpoint for storing summaries
            s3_access_key: S3 access key ID
            s3_secret_key: S3 secret access key
            ollama_base_url: Ollama server base URL (default: http://localhost:11434)
            ollama_model: Ollama model to use (default: qwen2.5:14b-instruct-q5_k_m)
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
            api_key="ollama"  # Ollama doesn't require a real API key
        )
        self.openai_model = ollama_model
        
        # Initialize tokenizer for token counting
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        
        # Initialize text segmenter (optional, created on demand)
        self._text_segmenter = None
        self.ollama_base_url = ollama_base_url

    def summarize_text(self, text: str, summary_type: str = 'extractive',
                       summary_percent: float = 0.3) -> Tuple[str, Dict]:
        """
        Main summarization method using Ollama for both extractive and abstractive
        
        Args:
            text: Input text to summarize
            summary_type: 'extractive' or 'abstractive'
            summary_percent: Percentage of original content to retain
            
        Returns:
            Tuple of (summary_html, metadata)
        """
        logger.info(f"Starting Ollama-powered {summary_type} summarization of {len(text)} characters")
        
        # Calculate original token count
        original_tokens = len(self.tokenizer.encode(text))
        
        # Create optimized chunks for rate limits and throughput
        chunks = self.chunk_text_with_overlap(text, chunk_size=1500, overlap=150)
        
        # Perform summarization using Ollama
        if summary_type.lower() == 'extractive':
            raw_summary = self._extractive_summarization(chunks, summary_percent)
        elif summary_type.lower() == 'abstractive':
            raw_summary = self._abstractive_summarization(chunks, summary_percent)
        else:
            raise ValueError(f"Unknown summary type: {summary_type}")

        # Run final summarization pass for coherence and consistency
        logger.info("Running final summarization pass for coherence...")
        summary_html = self._final_summarization_pass(raw_summary, summary_type, summary_percent, len(chunks))

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

    def segment_and_summarize_text(self, text: str, summary_type: str = 'extractive',
                                 summary_percent: float = 0.3, 
                                 enable_segmentation: bool = True,
                                 segmentation_params: Optional[Dict] = None) -> Tuple[str, str, Dict]:
        """
        Segment text into chapters and then summarize with chapter markers
        
        Args:
            text: Input text to segment and summarize
            summary_type: 'extractive' or 'abstractive'
            summary_percent: Percentage of original content to retain
            enable_segmentation: Whether to apply text segmentation
            segmentation_params: Optional parameters for text segmentation
            
        Returns:
            Tuple of (segmented_text, summary_html, metadata)
        """
        segmented_text = text
        
        if enable_segmentation:
            logger.info("Applying text segmentation before summarization...")
            segmented_text = self.apply_text_segmentation(text, segmentation_params or {})
        
        # Perform summarization on segmented text
        summary_html, metadata = self.summarize_text(segmented_text, summary_type, summary_percent)
        
        return segmented_text, summary_html, metadata

    def apply_text_segmentation(self, text: str, segmentation_params: Dict = None) -> str:
        """
        Apply text segmentation to insert chapter markers
        
        Args:
            text: Input text to segment
            segmentation_params: Parameters for segmentation (window_size, threshold, etc.)
            
        Returns:
            Text with chapter markers inserted
        """
        # Initialize segmenter lazily
        if self._text_segmenter is None:
            params = segmentation_params or {}
            self._text_segmenter = TextSegmenter(
                window_size=params.get('window_size', 6),
                threshold=params.get('threshold', 0.25),
                min_sentences=params.get('min_sentences', 8),
                min_chars=params.get('min_chars', 1200),
                use_embeddings=params.get('use_embeddings', True),
                ollama_base_url=self.ollama_base_url,
                ollama_model="bge-m3"
            )
        
        # Segment the text
        segments = self._text_segmenter.segment_text(text)
        
        if segments:
            logger.info(f"Text segmentation found {len(segments)} segments")
            # Insert chapter markers
            segmented_text = self._text_segmenter.insert_chapter_markers(text, segments)
            return segmented_text
        else:
            logger.warning("No segments found during text segmentation")
            return text

    def chunk_text_with_overlap(
            self,
            text: str,
            chunk_size: int = 1500,
            overlap: int = 150,
            *,
            min_chunk_tokens: int = 600,
            max_chunk_tokens: int = 2000,
            add_special_tokens: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        """
        Split text into optimized overlapping token chunks for rate-limited APIs.
        
        Optimized for 60K TPM / 3 RPM limits:
        - 1,500 tokens per chunk (10-15% overlap)
        - Generates ~300-600 tokens output per chunk (20-35% summary rate)
        - Finalizer can merge 10-15 chunks within 8K token budget
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
        if total - starts[-1] < min_chunk_tokens and len(starts) > 1:
            proposed = max(total - chunk_size, 0)
            if proposed <= starts[-2]:  # keep progression
                proposed = min(starts[-2] + stride, max(total - min_chunk_tokens, 0))
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

    def _extractive_summarization(self, chunks: List[Dict], summary_percent: float) -> str:
        """
        Extractive summarization using Ollama (selects key sentences from original text)
        """
        logger.info(f"Starting Ollama extractive summarization with {summary_percent:.1%} compression")
        total_chunks = len(chunks)
        chunk_summaries = []

        for i, chunk in enumerate(chunks, 1):
            try:
                logger.info(f"📄 Processing extractive chunk {i}/{total_chunks} ({i/total_chunks*100:.1f}%)")
                print(f"\r🔄 Extractive summarization: {i}/{total_chunks} chunks processed ({i/total_chunks*100:.1f}%)", end="", flush=True)

                chapter_context = ""
                if chunk['chapter_titles']:
                    chapter_context = f"This text is from chapter(s): {', '.join(chunk['chapter_titles'])}. "

                prompt = f"""You are an extractive summarizer. Select and preserve the most important sentences from the original text.

{chapter_context}

Instructions:
- Extract approximately {int(summary_percent * 100)}% of the most important sentences
- Keep sentences EXACTLY as they appear in the original text
- Preserve the original order and structure
- Include key facts, conclusions, definitions, and important statements
- Maintain any existing headings or section markers
- Return as plain text, preserving paragraph breaks and structure

Text to extract from:
{chunk['text']}

Return only the extracted sentences as plain text."""

                response = self.openai_client.chat.completions.create(
                    model=self.openai_model,
                    messages=[
                        {"role": "system", "content": "You are an expert at extractive summarization, selecting the most important sentences while preserving their original form."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=min(1200, int(chunk['token_count'] * summary_percent * 1.5)),
                    temperature=0.1
                )
                summary = response.choices[0].message.content.strip()
                if summary:
                    chunk_summaries.append(summary)

            except Exception as e:
                logger.error(f"Extractive summarization failed for chunk {chunk['id']}: {e}")
                continue

        # Clear progress line and show completion
        print(f"\r✅ Extractive summarization: {total_chunks}/{total_chunks} chunks processed (100.0%)")

        # Combine summaries
        combined_summary = '\n\n'.join(chunk_summaries)
        logger.info(f"Extractive summary complete: {len(combined_summary)} characters")
        return combined_summary

    def _abstractive_summarization(self, chunks: List[Dict], summary_percent: float) -> str:
        """
        Abstractive summarization using Ollama (rewrites content in new words)
        """
        logger.info(f"Starting Ollama abstractive summarization with {summary_percent:.1%} compression")
        total_chunks = len(chunks)
        chunk_summaries = []
        
        for i, chunk in enumerate(chunks, 1):
            try:
                logger.info(f"📝 Processing abstractive chunk {i}/{total_chunks} ({i/total_chunks*100:.1f}%)")
                print(f"\r🔄 Abstractive summarization: {i}/{total_chunks} chunks processed ({i/total_chunks*100:.1f}%)", end="", flush=True)
                
                chapter_context = ""
                if chunk['chapter_titles']:
                    chapter_context = f"This text is from chapter(s): {', '.join(chunk['chapter_titles'])}. "

                prompt = f"""You are an abstractive summarizer. Rewrite and condense the content in your own words without adding outside information.

{chapter_context}

Instructions:
- Condense to approximately {int(summary_percent * 100)}% of the original length
- Rewrite in your own words while preserving all key information
- Maintain the logical flow and structure of the original
- Keep all facts, numbers, definitions, and important details accurate
- Use clear, concise language appropriate to the content's domain
- Preserve any existing headings or section structure
- Return as plain text, preserving paragraph breaks and structure

Text to summarize:
{chunk['text']}

Return only the rewritten summary as plain text."""

                response = self.openai_client.chat.completions.create(
                    model=self.openai_model,
                    messages=[
                        {"role": "system", "content": "You are an expert at abstractive summarization, rewriting content concisely while preserving all key information."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=min(1800, int(chunk['token_count'] * summary_percent * 1.5)),
                    temperature=0.3
                )
                
                summary = response.choices[0].message.content.strip()
                if summary:
                    chunk_summaries.append(summary)
                    
            except Exception as e:
                logger.error(f"Abstractive summarization failed for chunk {chunk['id']}: {e}")
                continue
        
        # Clear progress line and show completion
        print(f"\r✅ Abstractive summarization: {total_chunks}/{total_chunks} chunks processed (100.0%)")
        
        # Combine summaries
        combined_summary = '\n\n'.join(chunk_summaries)
        
        logger.info(f"Abstractive summary complete: {len(combined_summary)} characters")
        return combined_summary

    def _final_summarization_pass(self, text: str, summary_type: str, summary_percent: float, chunk_count: int) -> str:
        """
        Final summarization pass that transforms raw summaries into structured, deduplicated HTML
        This is where structured schema output is created from unstructured raw summaries
        """
        try:
            current_tokens = len(self.tokenizer.encode(text))
            logger.info(f"Final pass input: {current_tokens} tokens")
            
            # Check if text is too large for single pass (model context limit consideration)
            MAX_INPUT_TOKENS = 6000  # Conservative limit for input + prompt + output
            
            if current_tokens > MAX_INPUT_TOKENS:
                logger.info(f"Text too large ({current_tokens} tokens), splitting for final pass")
                return self._chunked_final_summarization_pass(text, summary_type, summary_percent, chunk_count)
            
            # Single pass for smaller texts
            return self._single_final_summarization_pass(text, summary_type, summary_percent, chunk_count)
            
        except Exception as e:
            logger.error(f"Final summarization pass failed: {e}")
            # Return formatted fallback
            return f"<div class='summary-content'>{text.replace(chr(10), '</p><p>')}</div>"

    def _single_final_summarization_pass(
            self, text: str, summary_type: str, summary_percent: float, chunk_count: int
    ) -> str:
        """Handle final pass for texts that fit in single request"""
        try:
            current_tokens = len(self.tokenizer.encode(text))

            # Determine output token limit based on input size
            if chunk_count == 1:
                operation_focus = "organize and enhance coherence"
                max_tokens = min(2000, int(current_tokens * 0.8))
            else:
                operation_focus = "merge chunks, remove overlaps, and ensure coherence"
                max_tokens = min(2500, int(current_tokens * 0.7))

            from textwrap import dedent

            prompt = dedent(f"""
                You are an expert document finalizer. Transform the raw summary into a well-structured, coherent document. Use only the provided input.

                TASK: {operation_focus} for this {summary_type} summary from {chunk_count} chunk(s).
                TARGET: Maintain approximately {int(summary_percent * 100)}% compression ratio from the original document.

                RAW SUMMARY INPUT:
                {text}

                REQUIREMENTS:
                1) Deduplication: remove repeated information, facts, or concepts.
                2) Structure: organize content with clear hierarchy and logical flow.
                3) Coherence: smooth transitions between sections and ideas.
                4) Consistency: uniform terminology, style, and formatting.
                5) Completeness: preserve all unique key information, facts, and conclusions.
                6) Quality: fix grammar, improve clarity, enhance readability.

                CRITICAL DEDUPLICATION RULES:
                - Remove identical or near-identical sentences from different chunks.
                - Merge similar concepts that appear in multiple sections.
                - Eliminate redundant explanations of the same ideas.
                - Consolidate repeated facts, statistics, or definitions.
                - Remove duplicate examples that illustrate the same point.

                SPECIAL INSTRUCTIONS:
                - Create logical sections based on content themes, not chunk boundaries.
                - For extractive summaries: reorganize selected sentences into coherent sections.
                - For abstractive summaries: ensure rewritten content flows logically without repetition.
                - Remove meta-references like "as mentioned above" or "previous section".
                - Use professional academic/technical style.
                - Preserve original language of the input.

                OUTPUT FORMAT: STRICT JSON. No prose. No code fences.

                SCHEMA:
                {{
                  "title": string | null,
                  "toc": [{{ "id": string, "title": string }}],
                  "chapters": [
                    {{
                      "id": string,
                      "title": string | null,
                      "summary": string,
                      "key_points": [string],
                      "subsections": [
                        {{
                          "id": string,
                          "title": string | null,
                          "summary": string,
                          "key_points": [string]
                        }}
                      ]
                    }}
                  ]
                }}

                HTML RULES:
                - Escape &, <, >, ".
                - Do not include inline styles or scripts.
                - IDs must be URL-safe kebab-case and stable.

                RETURN: Only the JSON matching the schema.
            """)

            response = self.openai_client.chat.completions.create(
                model=self.openai_model,
                messages=[
                    {
                        "role": "system",
                        "content": f"You are an expert at finalizing {summary_type} summaries, ensuring coherence, removing redundancy, and maintaining high quality output.",
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=max_tokens,
                temperature=0.15,  # Low temperature for consistency
            )

            final_result = response.choices[0].message.content.strip()

            # Log improvement metrics
            final_tokens = len(self.tokenizer.encode(final_result))
            improvement_ratio = final_tokens / current_tokens if current_tokens > 0 else 1

            logger.info(f"Final pass complete: {current_tokens} → {final_tokens} tokens ({improvement_ratio:.2f}x)")
            logger.info(f"Operation: {operation_focus}")

            return final_result

        except Exception as e:
            logger.error(f"Single final summarization pass failed: {e}")
            return f"<div class='summary-content'>{text.replace(chr(10), '</p><p>')}</div>"

    def _chunked_final_summarization_pass(self, text: str, summary_type: str, summary_percent: float, chunk_count: int) -> str:
        """Handle final pass for large texts by chunking them"""
        logger.info("Processing large text with chunked final summarization")
        
        try:
            # Split text into manageable chunks for final processing
            final_chunks = self.chunk_text_with_overlap(
                text, 
                chunk_size=4000,  # Smaller chunks for final pass
                overlap=200,
                min_chunk_tokens=1000
            )
            
            logger.info(f"Split final pass into {len(final_chunks)} chunks")
            processed_chunks = []
            
            # Process each chunk through single final pass
            for i, chunk in enumerate(final_chunks, 1):
                logger.info(f"🔄 Final pass chunk {i}/{len(final_chunks)}")
                print(f"\r🔄 Final pass: {i}/{len(final_chunks)} chunks processed ({i/len(final_chunks)*100:.1f}%)", end="", flush=True)
                
                try:
                    # Process this chunk as if it were the whole summary
                    chunk_result = self._single_final_summarization_pass(
                        chunk['text'], 
                        summary_type, 
                        summary_percent, 
                        1  # Treat each chunk as single for processing
                    )
                    if chunk_result:
                        processed_chunks.append(chunk_result)
                        
                except Exception as e:
                    logger.error(f"Failed to process final chunk {i}: {e}")
                    # Add fallback for this chunk
                    processed_chunks.append(f"<div class='summary-content'>{chunk['text'].replace(chr(10), '</p><p>')}</div>")
            
            print(f"\r✅ Final pass: {len(final_chunks)}/{len(final_chunks)} chunks processed (100.0%)")
            
            # Combine all processed chunks into final result
            if processed_chunks:
                # Try to merge the JSON results into a single coherent document
                return self._merge_json_chunks(processed_chunks, summary_type)
            else:
                return f"<div class='summary-content'>{text.replace(chr(10), '</p><p>')}</div>"
                
        except Exception as e:
            logger.error(f"Chunked final summarization failed: {e}")
            return f"<div class='summary-content'>{text.replace(chr(10), '</p><p>')}</div>"

    def _merge_json_chunks(self, json_chunks: List[str], summary_type: str) -> str:
        """Merge multiple JSON chunk results into a single coherent document"""
        try:
            import json
            all_chapters = []
            combined_title = None
            combined_toc = []
            
            # Parse each JSON chunk and extract chapters
            for chunk_json in json_chunks:
                try:
                    chunk_data = json.loads(chunk_json)
                    if chunk_data.get('chapters'):
                        all_chapters.extend(chunk_data['chapters'])
                    if chunk_data.get('title') and not combined_title:
                        combined_title = chunk_data['title']
                    if chunk_data.get('toc'):
                        combined_toc.extend(chunk_data['toc'])
                except json.JSONDecodeError:
                    logger.warning("Failed to parse JSON chunk, treating as plain text")
                    # Extract text content if JSON parsing fails
                    text_content = chunk_json.replace('<div class="summary-content">', '').replace('</div>', '')
                    all_chapters.append({
                        "id": f"section-{len(all_chapters) + 1}",
                        "title": None,
                        "summary": text_content[:500] + "..." if len(text_content) > 500 else text_content,
                        "key_points": [],
                        "subsections": []
                    })
            
            # Create final merged JSON
            final_result = {
                "title": combined_title,
                "toc": combined_toc,
                "chapters": all_chapters
            }
            
            return json.dumps(final_result, indent=2)
            
        except Exception as e:
            logger.error(f"Failed to merge JSON chunks: {e}")
            # Fallback: combine as plain text
            return '\n\n'.join(json_chunks)

    def save_summary_to_s3(self, bucket: str, book_id: str, summary_json: str,
                          summary_type: str, metadata: Dict) -> str:
        try:
            # Generate S3 key
            s3_key = f"summary/{book_id}_{summary_type}_summary.json"
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=bucket,
                Key=s3_key,
                Body=summary_json.encode('utf-8'),
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