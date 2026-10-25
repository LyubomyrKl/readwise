"""Advanced summarization strategies for improved quality."""

import logging
import re
from typing import Optional, List

from worker.tools.reader.summarize.core.protocols import LLMClientProtocol
from worker.tools.reader.summarize.config.settings import SummarizationStrategy
from worker.tools.reader.summarize.formatting.paragraph_formatter import ParagraphFormatter

logger = logging.getLogger(__name__)

# Global formatter instance for post-processing
_paragraph_formatter = ParagraphFormatter()


# =============================================================================
# Strategy 1: STRUCTURED - Better Prompts with Constraints
# =============================================================================

STRUCTURED_EXTRACTIVE_PROMPT = """You are an expert extractive summarizer. Your task is to select and preserve the most important sentences from the original text.

## STRICT RULES:
1. MUST INCLUDE:
   - All numerical data, statistics, and percentages
   - All names, dates, and specific locations
   - Main conclusions and findings
   - Definitions of key terms

2. MUST PRESERVE:
   - Exact wording from the original (do not paraphrase)
   - Original sentence order
   - Cause-effect relationships

3. NEVER:
   - Add information not in the original
   - Combine or merge sentences
   - Change any numbers or names

## TARGET: Extract approximately {percent}% of the content.

## TEXT TO EXTRACT FROM:
{text}

## OUTPUT FORMAT:
- Write in well-structured paragraphs
- Separate paragraphs with a blank line
- Each paragraph should cover a coherent topic or theme
- Return only the extracted content, no headers or labels
- IMPORTANT: Write in the same language as the source text"""


STRUCTURED_ABSTRACTIVE_PROMPT = """You are an expert abstractive summarizer. Your task is to create a concise, coherent summary that captures all essential information.

## STRICT RULES:
1. MUST INCLUDE:
   - All numerical data, statistics, and percentages (exact values)
   - All named entities (people, organizations, places)
   - Main arguments, claims, and conclusions
   - Key definitions and concepts

2. STRUCTURE:
   - Lead with the main point or thesis
   - Follow with supporting details in order of importance
   - End with conclusions or implications

3. STYLE:
   - Use clear, precise language
   - Maintain logical flow between ideas
   - Preserve technical terminology

4. NEVER:
   - Add information not in the original
   - Use vague language ("some people say", "it is believed")
   - Omit any numbers, names, or specific data
   - Include your opinions or interpretations

## TARGET: Approximately {percent}% of the original length.

{context_section}

## TEXT TO SUMMARIZE:
{text}

## OUTPUT FORMAT:
- Write in well-structured paragraphs (2-4 sentences each)
- Separate paragraphs with a blank line
- Each paragraph should cover a coherent topic or theme
- Use transition words between paragraphs for flow
- Return only the summary content, no headers or labels
- IMPORTANT: Write in the same language as the source text"""


async def structured_summarize(
    llm_client: LLMClientProtocol,
    text: str,
    summary_percent: float,
    extractive: bool = False,
    context: Optional[str] = None,
) -> str:
    """Summarize using structured prompts with strict constraints.

    Args:
        llm_client: LLM client for generation
        text: Text to summarize
        summary_percent: Target percentage (0-1)
        extractive: Use extractive mode
        context: Optional context from previous chunks

    Returns:
        Summary text
    """
    percent = int(summary_percent * 100)

    if extractive:
        prompt = STRUCTURED_EXTRACTIVE_PROMPT.format(
            percent=percent,
            text=text,
        )
        system = "You are a precise extractive summarizer. Follow the rules exactly."
        temperature = 0.1
    else:
        context_section = ""
        if context:
            context_section = f"""## CONTEXT FROM PREVIOUS SECTIONS:
{context}

Use this context to maintain consistency but do not repeat information already covered.

"""
        prompt = STRUCTURED_ABSTRACTIVE_PROMPT.format(
            percent=percent,
            text=text,
            context_section=context_section,
        )
        system = "You are a precise abstractive summarizer. Follow the rules exactly."
        temperature = 0.2

    tokens = llm_client.count_tokens(text)
    max_tokens = min(2000, int(tokens * summary_percent * 1.5))

    return await llm_client.complete(
        prompt=prompt,
        system_prompt=system,
        max_tokens=max_tokens,
        temperature=temperature,
    )


# =============================================================================
# Strategy 2: TWO-PASS - Extract Key Info Then Summarize
# =============================================================================

KEY_INFO_EXTRACTION_PROMPT = """Analyze this text and extract ALL key information in a structured format.

## EXTRACT THE FOLLOWING:

### 1. MAIN CLAIMS/ARGUMENTS:
List the primary points, arguments, or thesis statements.

### 2. NUMERICAL DATA:
List ALL numbers, statistics, percentages, dates, and quantities with their context.

### 3. NAMED ENTITIES:
List all people, organizations, places, and products mentioned with their roles/relevance.

### 4. CAUSE-EFFECT RELATIONSHIPS:
List any causal relationships (X leads to Y, because of X, Y happened).

### 5. CONCLUSIONS/FINDINGS:
List any conclusions, results, recommendations, or key takeaways.

### 6. DEFINITIONS:
List any terms that are defined or explained.

## TEXT:
{text}

## OUTPUT:
Use the exact headers above. Be comprehensive - missing information cannot be recovered.
IMPORTANT: Write in the same language as the source text."""


TWO_PASS_SYNTHESIS_PROMPT = """Create a coherent summary that incorporates ALL of the extracted information below.

## EXTRACTED KEY INFORMATION:
{key_info}

## REQUIREMENTS:
1. Include EVERY piece of extracted information
2. Write in flowing, readable prose (not bullet points)
3. Maintain logical order and transitions
4. Preserve all numbers and names exactly
5. Target length: approximately {percent}% of original

## ORIGINAL TEXT (for reference):
{text}

## OUTPUT FORMAT:
- Write in well-structured paragraphs (3-5 sentences each)
- Separate paragraphs with a blank line
- Start with the main thesis/conclusion
- Group related information into the same paragraph
- Use transition words between paragraphs
- Return only the summary content
- IMPORTANT: Write in the same language as the source text"""


async def two_pass_summarize(
    llm_client: LLMClientProtocol,
    text: str,
    summary_percent: float,
    context: Optional[str] = None,
) -> str:
    """Two-pass summarization: extract key info, then synthesize.

    Pass 1: Extract all key information in structured format
    Pass 2: Synthesize into coherent summary

    Args:
        llm_client: LLM client for generation
        text: Text to summarize
        summary_percent: Target percentage (0-1)
        context: Optional context (used in synthesis)

    Returns:
        Summary text
    """
    # Pass 1: Extract key information
    logger.debug("Two-pass: Extracting key information...")

    key_info = await llm_client.complete(
        prompt=KEY_INFO_EXTRACTION_PROMPT.format(text=text),
        system_prompt="You are an expert at information extraction. Be thorough and precise.",
        max_tokens=1500,
        temperature=0.1,
    )

    # Pass 2: Synthesize into summary
    logger.debug("Two-pass: Synthesizing summary...")

    percent = int(summary_percent * 100)
    tokens = llm_client.count_tokens(text)
    max_tokens = min(2000, int(tokens * summary_percent * 1.5))

    synthesis_prompt = TWO_PASS_SYNTHESIS_PROMPT.format(
        key_info=key_info,
        percent=percent,
        text=text[:2000],  # Include start of text for reference
    )

    if context:
        synthesis_prompt = f"""## CONTEXT FROM PREVIOUS SECTIONS:
{context}

Maintain consistency with this context.

{synthesis_prompt}"""

    summary = await llm_client.complete(
        prompt=synthesis_prompt,
        system_prompt="You are an expert at synthesizing information into clear summaries.",
        max_tokens=max_tokens,
        temperature=0.2,
    )

    return summary


# =============================================================================
# Strategy 3: CHAIN OF DENSITY - Progressive Density Increase
# =============================================================================

CHAIN_OF_DENSITY_PROMPT = """You will write 3 increasingly dense summaries of the text below.

## PROCESS:
Write Summary 1, then Summary 2, then Summary 3. Each summary should be approximately the same length ({target_words} words) but pack MORE information.

### Summary 1:
Write a ~{target_words} word summary covering only the most essential main topic.

### Summary 2:
Rewrite Summary 1 to include 1-2 additional important entities, facts, or details.
- Keep the SAME length by making language more concise
- Do NOT drop any information from Summary 1

### Summary 3:
Rewrite Summary 2 to include 1-2 more important entities, facts, or details.
- Keep the SAME length by making language more concise
- Do NOT drop any information from Summary 2
- This should be maximally dense while remaining readable
- Structure into 2-3 paragraphs with blank lines between them

## IMPORTANT:
- Each summary must be ~{target_words} words (same length)
- Each summary must contain ALL information from the previous one
- Increase density by using more precise/concise language, not by adding length
- Focus on: names, numbers, key terms, cause-effect, conclusions
- Write each summary in paragraph form (2-3 paragraphs separated by blank lines)
- IMPORTANT: Write in the same language as the source text

## TEXT TO SUMMARIZE:
{text}

## OUTPUT FORMAT:
SUMMARY 1:
[your summary 1 in paragraphs]

SUMMARY 2:
[your summary 2 in paragraphs]

SUMMARY 3:
[your summary 3 in paragraphs]

Now write all three summaries:"""


async def chain_of_density_summarize(
    llm_client: LLMClientProtocol,
    text: str,
    summary_percent: float,
    context: Optional[str] = None,
) -> str:
    """Chain-of-density summarization with progressive information packing.

    Generates 3 summaries of equal length with increasing density,
    returns the densest (third) summary.

    Args:
        llm_client: LLM client for generation
        text: Text to summarize
        summary_percent: Target percentage (0-1)
        context: Optional context

    Returns:
        The densest summary (Summary 3)
    """
    # Calculate target word count
    text_tokens = llm_client.count_tokens(text)
    target_tokens = int(text_tokens * summary_percent)
    target_words = int(target_tokens * 0.75)  # Rough token-to-word ratio
    target_words = max(50, min(300, target_words))  # Clamp to reasonable range

    prompt = CHAIN_OF_DENSITY_PROMPT.format(
        target_words=target_words,
        text=text,
    )

    if context:
        prompt = f"""## CONTEXT (maintain consistency with this):
{context}

{prompt}"""

    response = await llm_client.complete(
        prompt=prompt,
        system_prompt="You are an expert at writing information-dense summaries. Follow the process exactly.",
        max_tokens=2000,
        temperature=0.3,
    )

    # Extract Summary 3 from response
    summary = _extract_final_summary(response)

    return summary


def _extract_final_summary(response: str) -> str:
    """Extract Summary 3 from chain-of-density response."""

    # Try to find "SUMMARY 3:" marker
    patterns = [
        r"SUMMARY\s*3\s*:\s*\n?(.*?)(?:$)",
        r"Summary\s*3\s*:\s*\n?(.*?)(?:$)",
        r"\*\*Summary\s*3\*\*\s*:\s*\n?(.*?)(?:$)",
        r"3\.\s*(.*?)(?:$)",
    ]

    for pattern in patterns:
        match = re.search(pattern, response, re.DOTALL | re.IGNORECASE)
        if match:
            summary = match.group(1).strip()
            # Clean up any trailing markers
            summary = re.sub(r'\n\s*(SUMMARY|Summary|\*\*Summary).*$', '', summary, flags=re.DOTALL)
            if len(summary) > 50:
                return summary

    # Fallback: return last substantial paragraph
    paragraphs = [p.strip() for p in response.split('\n\n') if len(p.strip()) > 50]
    if paragraphs:
        return paragraphs[-1]

    # Last resort: return everything after last "Summary" marker
    parts = re.split(r'Summary\s*\d\s*:', response, flags=re.IGNORECASE)
    if len(parts) > 1:
        return parts[-1].strip()

    return response.strip()


# =============================================================================
# Strategy 4: HYBRID - Extractive Then Abstractive
# =============================================================================

HYBRID_EXTRACTION_PROMPT = """Select the {num_sentences} most important sentences from this text.

## SELECTION CRITERIA (in order of priority):
1. Sentences containing the main thesis or conclusion
2. Sentences with specific data, numbers, or statistics
3. Sentences defining key concepts or terms
4. Sentences describing cause-effect relationships
5. Sentences with named entities doing important actions

## RULES:
- Return sentences EXACTLY as they appear in the original
- Number each sentence (1, 2, 3, etc.)
- Maintain the original order from the text
- Do not modify, merge, or paraphrase

## TEXT:
{text}

## OUTPUT:
List the {num_sentences} most important sentences, numbered (preserve original language):"""


HYBRID_REWRITE_PROMPT = """Rewrite these key sentences into a coherent, flowing summary.

## KEY SENTENCES:
{sentences}

## REQUIREMENTS:
1. Include ALL information from every sentence
2. Improve flow with transitions between ideas
3. Remove redundancy if sentences overlap
4. Keep all numbers, names, and specific details exact
5. Write in clear, professional prose
6. Target length: {target_words} words

{context_section}

## OUTPUT FORMAT:
- Write in well-structured paragraphs (2-4 sentences each)
- Separate paragraphs with a blank line
- Group related information into the same paragraph
- Use transition words/phrases between paragraphs
- Return only the summary content, no headers
- IMPORTANT: Write in the same language as the source text"""


async def hybrid_summarize(
    llm_client: LLMClientProtocol,
    text: str,
    summary_percent: float,
    context: Optional[str] = None,
) -> str:
    """Hybrid summarization: extract key sentences, then rewrite.

    Step 1: Extractive - select most important sentences
    Step 2: Abstractive - rewrite into coherent summary

    Args:
        llm_client: LLM client for generation
        text: Text to summarize
        summary_percent: Target percentage (0-1)
        context: Optional context

    Returns:
        Summary text
    """
    # Calculate how many sentences to extract
    sentences = re.split(r'(?<=[.!?])\s+', text)
    num_sentences = max(3, int(len(sentences) * summary_percent * 1.5))
    num_sentences = min(num_sentences, 10)  # Cap at 10 sentences

    # Step 1: Extract key sentences
    logger.debug(f"Hybrid: Extracting {num_sentences} key sentences...")

    key_sentences = await llm_client.complete(
        prompt=HYBRID_EXTRACTION_PROMPT.format(
            num_sentences=num_sentences,
            text=text,
        ),
        system_prompt="You are an expert at identifying the most important sentences in a text.",
        max_tokens=1000,
        temperature=0.1,
    )

    # Step 2: Rewrite into coherent summary
    logger.debug("Hybrid: Rewriting into coherent summary...")

    text_tokens = llm_client.count_tokens(text)
    target_words = int(text_tokens * summary_percent * 0.75)
    target_words = max(50, min(400, target_words))

    context_section = ""
    if context:
        context_section = f"""## CONTEXT (maintain consistency):
{context}

"""

    summary = await llm_client.complete(
        prompt=HYBRID_REWRITE_PROMPT.format(
            sentences=key_sentences,
            target_words=target_words,
            context_section=context_section,
        ),
        system_prompt="You are an expert at writing clear, coherent summaries from key points.",
        max_tokens=int(text_tokens * summary_percent * 1.5),
        temperature=0.2,
    )

    return summary


# =============================================================================
# Main Strategy Dispatcher
# =============================================================================

async def summarize_with_strategy(
    llm_client: LLMClientProtocol,
    text: str,
    strategy: SummarizationStrategy,
    summary_percent: float = 0.3,
    extractive: bool = False,
    context: Optional[str] = None,
    format_paragraphs: bool = True,
) -> str:
    """Summarize text using the specified strategy.

    Args:
        llm_client: LLM client for generation
        text: Text to summarize
        strategy: Which strategy to use
        summary_percent: Target percentage (0-1)
        extractive: Use extractive mode (only for BASIC and STRUCTURED)
        context: Optional context from previous chunks
        format_paragraphs: Post-process to ensure proper paragraph formatting

    Returns:
        Summary text with proper paragraph structure
    """
    logger.debug(f"Summarizing with strategy: {strategy.value}")

    if strategy == SummarizationStrategy.BASIC:
        # Fall back to basic LLM methods
        if extractive:
            summary = await llm_client.extractive_summarize(text, summary_percent, context)
        else:
            summary = await llm_client.abstractive_summarize(text, summary_percent, context)

    elif strategy == SummarizationStrategy.STRUCTURED:
        summary = await structured_summarize(
            llm_client, text, summary_percent, extractive, context
        )

    elif strategy == SummarizationStrategy.TWO_PASS:
        summary = await two_pass_summarize(
            llm_client, text, summary_percent, context
        )

    elif strategy == SummarizationStrategy.CHAIN_OF_DENSITY:
        summary = await chain_of_density_summarize(
            llm_client, text, summary_percent, context
        )

    elif strategy == SummarizationStrategy.HYBRID:
        summary = await hybrid_summarize(
            llm_client, text, summary_percent, context
        )

    else:
        raise ValueError(f"Unknown strategy: {strategy}")

    # Post-process for consistent paragraph formatting
    if format_paragraphs:
        summary = _paragraph_formatter.format(summary)

    return summary
