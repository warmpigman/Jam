FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create cache directories
RUN mkdir -p /app/hf_cache /app/pip_cache

# Set environment variables for caching
ENV HF_HOME=/app/hf_cache
ENV TRANSFORMERS_CACHE=/app/hf_cache
ENV PIP_CACHE_DIR=/app/pip_cache

# Copy requirements first for better layer caching
COPY requirements.txt .

# Install Python dependencies with pip cache
RUN --mount=type=cache,target=/app/pip_cache \
    pip install --cache-dir /app/pip_cache -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8080

# Run with hot reload using Flask's debug mode
CMD ["python", "-u", "embed.py"]