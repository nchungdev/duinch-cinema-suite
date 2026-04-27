FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY miner/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all crawler code
COPY . .

# Set PYTHONPATH to include project root
ENV PYTHONPATH=/app

# Default command
CMD ["python3", "miner/main.py"]
