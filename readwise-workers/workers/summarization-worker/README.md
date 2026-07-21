rate # Summarization Worker

Advanced text summarization pipeline with async LLM calls, context tracking, entity extraction, adaptive compression, validation, and hierarchical merging.

## Features

| Feature | Description |
|---------|-------------|
| **Async LLM Calls** | Connection pooling, semaphore-based concurrency, exponential backoff retry |
| **Running Context** | Sliding window of previous summaries injected into prompts |
| **Entity Tracking** | Extract, deduplicate, and track entities across the document |
| **Adaptive Compression** | Dynamic compression ratio based on content density |
| **Validation Loop** | Quality checks with automatic retry on failure |
| **Overlap Deduplication** | Remove duplicate content from overlapping chunks |
| **Semantic Chunking** | Embedding-based topic boundary detection |
| **Hierarchical Merge** | Tree-like merging: chunks → subsections → chapters → document |
| **Advanced Strategies** | 4 summarization strategies: Structured, Two-Pass, Chain-of-Density, Hybrid |
| **Paragraph Formatting** | Automatic paragraph structuring for readable output |

## Quick Start

### Environment Variables

```bash
# Enable new pipeline
USE_NEW_PIPELINE=true
PIPELINE_MODE=balanced  # fast | balanced | quality

# LLM Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:14b-instruct-q5_k_m
OLLAMA_EMBED_MODEL=bge-m3

# Feature Flags (optional overrides)
FEATURE_USE_SEMANTIC_CHUNKING=false
FEATURE_USE_RUNNING_CONTEXT=true
FEATURE_USE_ENTITY_TRACKING=true
FEATURE_USE_ADAPTIVE_COMPRESSION=true
FEATURE_USE_VALIDATION_LOOP=true
FEATURE_USE_OVERLAP_DEDUP=true
FEATURE_USE_HIERARCHICAL_MERGE=true
```

### Using the Pipeline Builder

```python
from orchestration import PipelineBuilder

# Quick presets
pipeline = PipelineBuilder().fast().build()            # Minimal features, fastest
pipeline = PipelineBuilder().balanced().build()        # Good quality/speed tradeoff
pipeline = PipelineBuilder().quality().build()         # All features, two-pass strategy
pipeline = PipelineBuilder().maximum_density().build() # Chain-of-density for max info packing

# Custom configuration
pipeline = (
    PipelineBuilder()
    .with_ollama(base_url="http://localhost:11434", model="qwen2.5:14b")
    .with_semantic_chunking(similarity_threshold=0.7)
    .with_running_context(max_tokens=2000)
    .with_entity_tracking(max_entities=100)
    .with_adaptive_compression(base_ratio=0.3, min_ratio=0.15, max_ratio=0.5)
    .with_validation(max_attempts=3, min_coverage=0.7)
    .with_deduplication(similarity_threshold=0.9)
    .with_hierarchical_merge(max_batch=4)
    .build()
)

# Process a document
async with pipeline:
    result_json, metadata = await pipeline.process(
        json_data=segmented_document,
        summary_type="abstractive",
        summary_percent=0.3
    )
```

## Summarization Strategies

Choose a strategy based on your quality/speed requirements:

| Strategy | Description | Best For | LLM Calls |
|----------|-------------|----------|-----------|
| **BASIC** | Simple prompts, minimal constraints | Quick drafts, testing | 1x |
| **STRUCTURED** | Better prompts with strict constraints | General use (default) | 1x |
| **TWO_PASS** | Extract key info, then synthesize | Preserving all facts | 2x |
| **CHAIN_OF_DENSITY** | 3 progressively denser summaries | Maximum info density | 1x (longer) |
| **HYBRID** | Extract key sentences, then rewrite | Technical content | 2x |

### Strategy Details

#### BASIC
Simple approach with minimal prompt engineering. Fastest but lowest quality.

#### STRUCTURED (Recommended Default)
Uses carefully crafted prompts with strict rules:
- MUST include all numerical data, names, dates
- MUST preserve exact wording (extractive) or key facts (abstractive)
- NEVER add information not in the original

#### TWO_PASS
Two-stage approach for better factuality:
1. **Pass 1**: Extract ALL key information in structured format
   - Main claims/arguments
   - Numerical data and statistics
   - Named entities and relationships
   - Conclusions and definitions
2. **Pass 2**: Synthesize extracted info into coherent summary

#### CHAIN_OF_DENSITY
Creates 3 increasingly dense summaries of the same length:
```
Summary 1: Covers main topic (~100 words)
Summary 2: Adds 1-2 more facts, same length, more concise language
Summary 3: Maximum density, all key info packed in same word count
```
Returns only Summary 3 (the densest).

#### HYBRID
Combines extractive and abstractive approaches:
1. **Step 1**: Select N most important sentences verbatim
2. **Step 2**: Rewrite selected sentences into flowing prose

### Using Strategies

```python
from orchestration import PipelineBuilder
from config.settings import SummarizationStrategy

# Using preset with default strategy
pipeline = PipelineBuilder().quality().build()  # Uses TWO_PASS

# Explicitly set strategy
pipeline = (
    PipelineBuilder()
    .with_chain_of_density_strategy()  # Maximum density
    .with_validation()
    .build()
)

# Or use the enum directly
pipeline = (
    PipelineBuilder()
    .with_strategy(SummarizationStrategy.HYBRID)
    .build()
)
```

### Strategy Selection Guide

```
Need fast results?          → BASIC or STRUCTURED
Need to preserve all facts? → TWO_PASS
Need maximum info density?  → CHAIN_OF_DENSITY
Summarizing technical docs? → HYBRID
General production use?     → STRUCTURED (balanced)
```

## Pipeline Flow

```
INPUT: Segmented JSON (chapters → subsections → content)
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  1. INITIALIZATION                                            │
│     • Open AsyncLLMClient with connection pool                │
│     • Create Chunker, Context, EntityTracker, Summarizer      │
│     • Create Compressor, Validator, Deduplicator, Merger      │
└───────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  2. FOR EACH SECTION (chapter)                                │
│     └── FOR EACH SUBSECTION                                   │
│         │                                                     │
│         ├── 2a. Set section context                           │
│         │                                                     │
│         ├── 2b. CHUNK content                                 │
│         │       • TokenChunker (600 tokens, sentence-aware)   │
│         │       • OR SemanticChunker (embedding-based)        │
│         │                                                     │
│         └── 2c. FOR EACH CHUNK (sequential)                   │
│                 │                                             │
│                 ├── Get adaptive compression ratio            │
│                 ├── Extract & register entities               │
│                 ├── Build context prompt                      │
│                 ├── Summarize with validation loop            │
│                 └── Update running context                    │
└───────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  3. DEDUPLICATE overlapping summaries                         │
│     • Compare adjacent summaries                              │
│     • Remove duplicate sentences from later summary           │
└───────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  4. HIERARCHICAL MERGE                                        │
│     • Chunks → Subsection summary                             │
│     • Subsections → Chapter summary                           │
│     • Chapters → Document summary                             │
└───────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  5. OUTPUT                                                    │
│     • result_json: Hierarchical summaries + entity registry   │
│     • metadata: Token counts, compression ratio, timing       │
└───────────────────────────────────────────────────────────────┘
```

## Detailed Step-by-Step

### Step 1: Chunking

Content is split into manageable chunks for LLM processing.

**Token Chunker** (default):
- Target: 600 tokens per chunk
- Splits at sentence boundaries
- 15% overlap between chunks for context continuity

**Semantic Chunker** (optional):
- Uses embeddings to detect topic shifts
- Splits at natural semantic boundaries
- Falls back to token-based if embeddings fail

```
Input:  "2000 tokens of text..."
Output: [Chunk1: 580 tok, Chunk2: 610 tok, Chunk3: 590 tok]
```

### Step 2: Adaptive Compression

Each chunk gets a custom compression ratio based on content density.

```python
DensityAnalyzer.analyze(chunk) → DensityMetrics:
  • information_density: 0.72  (unique terms, key points)
  • redundancy_score: 0.25     (repeated content)
  • suggested_compression: 0.28

Adjustments:
  • First 20% of document → +10% retention (establish context)
  • Last 10% of document → +5% retention (conclusions)
  • High accumulated context → -5% retention (already covered)

Final ratio: 0.28 (instead of fixed 0.30)
```

### Step 3: Entity Extraction

Entities are extracted and tracked across the entire document.

```python
EntityTracker.extract_entities(chunk) → [
    Entity(name="John Smith", type="person", mentions=1),
    Entity(name="Neural Networks", type="concept", mentions=1),
]

# Deduplication: "John" merges with "John Smith"
# Aliases tracked: ["John", "Dr. Smith", "John Smith"]
```

### Step 4: Context-Aware Summarization

Each chunk is summarized with context from previous chunks and entities.

**Context Prompt Injection:**
```
Previous context:
[chunk_1]: Neural networks are computational models...
[chunk_2]: Training involves adjusting weights...

Key entities:
- John Smith (person): Lead researcher at MIT
- Neural Networks (concept): Computational learning models

Text to summarize:
{current chunk content}
```

### Step 5: Validation Loop

Summaries are validated and regenerated if quality is insufficient.

```
Attempt 1:
├── Generate summary
├── Validate:
│   • coverage_score: 0.65 ❌ (< 0.70 threshold)
│   • coherence_score: 0.78 ✓
│   • factuality_score: 0.85 ✓
└── RETRY (adjust ratio: 0.28 → 0.34)

Attempt 2:
├── Generate summary with higher ratio
├── Validate:
│   • coverage_score: 0.75 ✓
│   • coherence_score: 0.80 ✓
│   • overall: 0.78 ✓
└── PASS
```

### Step 6: Overlap Deduplication

Duplicate content from chunk overlap is removed.

```
Before:
  sum1: "Neural networks process data. They learn patterns."
  sum2: "They learn patterns. Deep learning extends this."
        ^^^^^^^^^^^^^^^^^^^^^ duplicate

After:
  sum1: "Neural networks process data. They learn patterns."
  sum2: "Deep learning extends this."
```

### Step 7: Hierarchical Merging

Summaries are merged bottom-up into a document hierarchy.

```
Level 1: Chunks → Subsection
  [chunk1, chunk2, chunk3] → subsection_summary

Level 2: Subsections → Chapter
  [sub1, sub2, sub3] → chapter_summary

Level 3: Chapters → Document
  [ch1, ch2, ch3, ch4] → document_summary
```

## Output Format

```json
{
  "sections": [
    {
      "id": "ch-abc123",
      "title": "Introduction",
      "summary": {
        "content": "Chapter-level summary...",
        "token_count": 450,
        "entities": ["Neural Networks", "Machine Learning"]
      },
      "subsections": [
        {
          "id": "sub-def456",
          "title": "Background",
          "chunks": [
            {
              "chunk_id": "chunk_a1b2c3_0",
              "content": "Chunk summary...",
              "original_tokens": 580,
              "summary_tokens": 174,
              "compression_ratio": 0.30,
              "quality_score": 0.78,
              "entities": ["John Smith"]
            }
          ]
        }
      ]
    }
  ],
  "document_summary": {
    "content": "High-level document summary...",
    "token_count": 800,
    "entities": ["Neural Networks", "John Smith", "MIT"]
  },
  "entity_registry": {
    "John Smith": {
      "name": "John Smith",
      "type": "person",
      "aliases": ["John", "Dr. Smith"],
      "mention_count": 12,
      "context": "Lead researcher at MIT"
    },
    "Neural Networks": {
      "name": "Neural Networks",
      "type": "concept",
      "mention_count": 28,
      "context": "Computational models that learn from data"
    }
  }
}
```

## Module Structure

```
workers/summarization-worker/
├── config/
│   ├── settings.py          # Pydantic settings (40+ params)
│   └── feature_flags.py     # Feature toggles
│
├── core/
│   ├── protocols.py         # Protocol definitions for DI
│   ├── models.py            # Chunk, Summary, Entity, etc.
│   └── exceptions.py        # Custom exceptions
│
├── llm/
│   ├── async_client.py      # Async LLM with connection pooling
│   └── rate_limiter.py      # Semaphore + exponential backoff
│
├── chunking/
│   ├── token_chunker.py     # Token-based chunking
│   ├── semantic_chunker.py  # Embedding-based chunking
│   └── overlap_deduplicator.py
│
├── context/
│   ├── running_context.py   # Sliding window context
│   └── entity_tracker.py    # Entity extraction & tracking
│
├── summarization/
│   ├── chunk_summarizer.py      # Basic summarizer
│   ├── context_summarizer.py    # Context-aware summarizer
│   ├── strategies.py            # Advanced summarization strategies
│   └── hierarchical_merger.py   # Tree-like merging
│
├── compression/
│   ├── density_analyzer.py      # Content density analysis
│   └── adaptive_compressor.py   # Dynamic compression
│
├── validation/
│   ├── quality_metrics.py   # Coverage, coherence, factuality
│   ├── validators.py        # Summary validation
│   └── validation_loop.py   # Retry logic
│
├── formatting/
│   └── paragraph_formatter.py  # Paragraph post-processing
│
├── orchestration/
│   ├── pipeline.py          # Main orchestrator
│   └── pipeline_builder.py  # Fluent builder API
│
└── main.py                  # Worker entry point
```

## Configuration Reference

### Pipeline Modes

| Mode | Strategy | Features Enabled | Use Case |
|------|----------|------------------|----------|
| `fast` | BASIC | None | Quick processing, drafts |
| `balanced` | STRUCTURED | Context, Compression, Validation, Dedup, Merge | Production use |
| `quality` | TWO_PASS | All features including Semantic Chunking & Entities | Best factuality |
| `maximum_density` | CHAIN_OF_DENSITY | All features | Maximum information packing |

### Settings (via `SUMMARIZER_` prefix)

| Setting | Default | Description |
|---------|---------|-------------|
| `ollama_base_url` | `http://localhost:11434` | Ollama server URL |
| `ollama_model` | `qwen2.5:14b-instruct-q5_k_m` | Model for completions |
| `llm_max_concurrent` | `5` | Max parallel LLM requests |
| `chunk_target_tokens` | `600` | Target tokens per chunk |
| `chunk_overlap_percent` | `0.15` | Overlap between chunks |
| `context_max_tokens` | `2000` | Max context window |
| `compression_base_ratio` | `0.3` | Base compression ratio |
| `summarization_strategy` | `structured` | Strategy: basic, structured, two_pass, chain_of_density, hybrid |
| `format_paragraphs` | `true` | Auto-format summaries into paragraphs |
| `paragraph_min_sentences` | `2` | Minimum sentences per paragraph |
| `paragraph_max_sentences` | `5` | Maximum sentences per paragraph |
| `validation_max_attempts` | `3` | Max retry attempts |
| `validation_min_coverage` | `0.7` | Min coverage score |

### Feature Flags (via `FEATURE_` prefix)

| Flag | Default | Description |
|------|---------|-------------|
| `use_async_llm` | `true` | Use async LLM client |
| `use_running_context` | `true` | Track context across chunks |
| `use_entity_tracking` | `true` | Extract and track entities |
| `use_semantic_chunking` | `false` | Use embedding-based chunking |
| `use_adaptive_compression` | `true` | Dynamic compression ratios |
| `use_validation_loop` | `true` | Validate and retry summaries |
| `use_overlap_dedup` | `true` | Remove duplicate content |
| `use_hierarchical_merge` | `true` | Merge into hierarchy |

## Legacy Mode

To use the original summarizer without the new pipeline:

```bash
USE_NEW_PIPELINE=false  # or simply don't set it
```

The worker will use `TextSummarizer` with the original synchronous processing.
