FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for both workers
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

# Copy all project files
COPY requirements.txt ./
COPY schema.prisma ./
COPY shared/ ./shared/
COPY workers/ ./workers/
COPY main.py ./
COPY entrypoint.sh ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download required NLTK data
RUN python -c "import nltk; nltk.download('punkt_tab', quiet=True)"

# Generate Prisma client
RUN prisma generate

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Run both workers
ENTRYPOINT ["./entrypoint.sh"]
