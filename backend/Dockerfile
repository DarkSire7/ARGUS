FROM python:3.11-slim

WORKDIR /app

# System libraries required by OpenCV (headless) and PyTorch
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer cached unless requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download YOLOv10n weights so containers don't need internet at runtime
RUN python -c "from ultralytics import YOLO; YOLO('yolov10n.pt')" 2>/dev/null || true

# Copy application code
COPY . .

# videos/ directory is mounted at runtime — keep a placeholder so the path exists
RUN mkdir -p /app/videos

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
