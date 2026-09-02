import os
import uuid
import subprocess
import threading
import tempfile
import time
import shutil

TEMP_DIR = tempfile.mkdtemp(prefix="wavelen_")
CLEANUP_DELAY = 600  # 10 minutes

def cleanup_file(path):
    def delayed_delete():
        time.sleep(CLEANUP_DELAY)
        if os.path.exists(path):
            os.remove(path)
    threading.Thread(target=delayed_delete, daemon=True).start()

def download_youtube_audio(url, username=None, password=None):
    """
    Download audio from YouTube using yt-dlp.
    Returns (file_path, title, artist) on success, or (None, None, None) on failure.
    """
    output_template = os.path.join(TEMP_DIR, "%(id)s.%(ext)s")
    cmd = [
        "yt-dlp",
        "-x", "--audio-format", "mp3",
        "--embed-thumbnail", "--add-metadata",
        "--no-playlist",
        "-o", output_template,
        url
    ]
    if username and password:
        cmd.extend(["--username", username, "--password", password])

    try:
        # Run yt-dlp
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            print("yt-dlp error:", result.stderr)
            return None, None, None

        # Find the generated mp3 file
        files = os.listdir(TEMP_DIR)
        mp3_files = [f for f in files if f.endswith(".mp3")]
        if not mp3_files:
            return None, None, None
        # The file name is the video id
        file_path = os.path.join(TEMP_DIR, mp3_files[0])

        # Extract title and artist from metadata (or fallback)
        title = None
        artist = None
        # We could parse yt-dlp's JSON output, but we'll rely on the file name
        # or we can read id3 tags with a library. For simplicity, use the file name without extension.
        # Better: read metadata with eyed3? Not required.
        # We'll just use the file name without extension as title, and artist as 'YouTube'
        base = os.path.splitext(mp3_files[0])[0]
        title = base
        artist = "YouTube"

        # Schedule cleanup
        cleanup_file(file_path)

        return file_path, title, artist

    except subprocess.TimeoutExpired:
        print("yt-dlp timed out")
        return None, None, None
    except Exception as e:
        print("yt-dlp error:", e)
        return None, None, None
