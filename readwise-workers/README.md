# Summarizer Workers Monorepo

A microservices-based document processing system that extracts text from PDF/EPUB files and generates intelligent summaries.

## Architecture

This monorepo contains two separate workers that communicate via RabbitMQ:

### 🔧 Extraction Worker
- **Location**: `workers/extraction-worker/`
- **Purpose**: Extract text from PDF and EPUB files
- **Queue**: `extract_request`
- **Supported Formats**: PDF (via pdfplumber), EPUB (via ebooklib)
- **Features**:
  - Downloads files from S3 using `fileStorageKey`
  - Cleans extracted text (removes headers/footers)
  - Saves extraction results to S3
  - Automatically triggers summarization

### 📄 Summarization Worker  
- **Location**: `workers/summarization-worker/`
- **Purpose**: Generate extractive and abstractive summaries
- **Queue**: `summary_request`
- **Features**:
  - Token-based text chunking (1000 tokens with 200 overlap)
  - Extractive summarization (TF-IDF based)
  - Abstractive summarization (OpenAI GPT)
  - Chapter detection and HTML output
  - Configurable compression ratios

### 🔄 Automated Workflow

1. **Extraction Request** → PDF/EPUB extraction → Save to S3 → Update database
2. **Auto-trigger** → RabbitMQ message to `summary_request`
3. **Summarization** → Generate summary → Save to S3 → Update database

## Directory Structure

```
├── shared/                          # Shared utilities
│   ├── database.py                 # Database operations
│   └── messaging.py                # RabbitMQ messaging
├── workers/
│   ├── extraction-worker/          # Text extraction service
│   │   ├── main.py                 # Worker entry point
│   │   ├── pdf_extractor.py        # PDF extraction logic
│   │   ├── epub_extractor.py       # EPUB extraction logic
│   │   ├── requirements.txt        # Python dependencies
│   │   └── Dockerfile              # Container definition
│   └── summarization-worker/       # Text summarization service
│       ├── main.py                 # Worker entry point
│       ├── text_summarizer.py      # Summarization logic
│       ├── requirements.txt        # Python dependencies
│       └── Dockerfile              # Container definition
├── schema.prisma                   # Database schema
├── docker-compose.yml              # Multi-service orchestration
└── .env                           # Environment variables
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- PostgreSQL database with Prisma schema
- MinIO S3 storage
- RabbitMQ message broker

### Environment Setup

Create a `.env` file:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/appdb?schema=public
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
AMQP_URL=amqp://user:pass@localhost:5672/
OPENAI_API_KEY=your_openai_key_here  # Optional for abstractive summaries
```

### Running with Docker Compose

```bash
# Build and start all services
docker-compose up --build

# Start specific worker
docker-compose up extraction-worker
docker-compose up summarization-worker

# View logs
docker-compose logs -f extraction-worker
docker-compose logs -f summarization-worker
```

### Running Individual Workers (Development)

```bash
# Extraction Worker
cd workers/extraction-worker
pip install -r requirements.txt
python main.py

# Summarization Worker  
cd workers/summarization-worker
pip install -r requirements.txt
python main.py
```

## Message Formats

### Extraction Request
```json
{
  "bookId": "book-uuid",
  "task": "extract"
}
```

### Summarization Request (Auto-generated)
```json
{
  "bookId": "book-uuid", 
  "task": "summarize",
  "summaryType": "extractive",  // or "abstractive"
  "summaryPercent": 0.3         // 30% compression
}
```

## Database Schema Fields

- `fileStorageKey`: S3 key for original book file
- `extractionStorageKey`: S3 key for extracted text markdown
- `summaryStorageKey`: S3 key for generated summary HTML
- `summaryType`: `extractive` or `abstractive`
- `status`: `pending` → `processing` → `ready` / `error`

## Features

### Extraction Features
- ✅ PDF text extraction with pdfplumber
- ✅ EPUB text extraction with ebooklib + BeautifulSoup
- ✅ Content cleaning (remove headers/footers/artifacts)
- ✅ S3 integration for file storage
- ✅ Automatic summarization triggering

### Summarization Features  
- ✅ Smart text chunking with token-based overlap
- ✅ Extractive summarization using TF-IDF
- ✅ Abstractive summarization with OpenAI GPT
- ✅ Chapter detection and structure preservation
- ✅ HTML output with CSS styling
- ✅ Configurable compression ratios

## Monitoring

- **RabbitMQ Management**: http://localhost:15672 (user/pass)
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)
- **PostgreSQL**: localhost:5432

## Scaling

Each worker can be scaled independently:

```bash
# Scale extraction workers
docker-compose up --scale extraction-worker=3

# Scale summarization workers
docker-compose up --scale summarization-worker=2
```