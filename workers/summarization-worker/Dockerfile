FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

# Copy shared utilities
COPY shared/ ./shared/

# Copy summarization worker files
COPY workers/summarization-worker/ ./

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

# Run the summarization worker
CMD ["python", "main.py"]