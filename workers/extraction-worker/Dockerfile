FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy shared utilities
COPY shared/ ./shared/

# Copy extraction worker files
COPY workers/extraction-worker/ ./

# Copy Prisma schema
COPY schema.prisma ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Generate Prisma client
RUN prisma generate

# Expose port (if needed for health checks)
EXPOSE 8080

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Run the extraction worker
CMD ["python", "main.py"]