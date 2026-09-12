FROM python:3.11-slim-trixie

# Install ffmpeg (required by yt-dlp)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Copy and install Python dependencies first (for better caching)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code and static files
COPY backend/ /app/backend/
COPY static /app/static/

EXPOSE 5000

CMD ["python", "app.py"]
