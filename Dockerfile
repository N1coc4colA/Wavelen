FROM python:3.9-slim-buster

# Install system dependencies (ffmpeg required by yt-dlp)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Set working directory for backend code
WORKDIR /app/backend

# Copy backend source and static files
COPY backend/ /app/backend/
COPY static /app/static/

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy and set up entrypoint script (for database persistence)
COPY entrypoint.sh /app/backend/entrypoint.sh
RUN chmod +x /app/backend/entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["/app/backend/entrypoint.sh"]
CMD ["python", "app.py"]
