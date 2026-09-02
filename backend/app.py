import os
import json
import sqlite3
from flask import Flask, request, jsonify, send_file, session, g
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from db import init_db, get_user, create_user, verify_user, list_users, ensure_admin
from utils import download_youtube_audio

app = Flask(__name__, static_folder="../static", static_url_path="")
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True
# CORS is not strictly needed because we serve frontend from same origin,
# but we enable it for development if frontend runs on a different port.
CORS(app, supports_credentials=True)

@app.before_request
def load_logged_in_user():
    g.user = None
    if "user_id" in session:
        user = get_user_by_id(session["user_id"])
        if user:
            g.user = user

def get_user_by_id(user_id):
    conn = sqlite3.connect("users.db")
    c = conn.cursor()
    c.execute("SELECT id, username, is_admin FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return {"id": row[0], "username": row[1], "is_admin": bool(row[2])}
    return None

def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not g.user:
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not g.user or not g.user["is_admin"]:
            return jsonify({"error": "Admin privileges required"}), 403
        return f(*args, **kwargs)
    return decorated

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return jsonify({"error": "Missing username or password"}), 400
    user = verify_user(username, password)
    if not user:
        return jsonify({"error": "Invalid credentials"}), 401
    session.clear()
    session["user_id"] = user["id"]
    return jsonify({
        "success": True,
        "user": {"username": user["username"], "is_admin": user["is_admin"]}
    })

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})

@app.route("/api/me", methods=["GET"])
def me():
    if g.user:
        return jsonify({"username": g.user["username"], "is_admin": g.user["is_admin"]})
    return jsonify({"error": "Not logged in"}), 401

@app.route("/api/users", methods=["GET"])
@admin_required
def list_all_users():
    users = list_users()
    return jsonify(users)

@app.route("/api/users", methods=["POST"])
@admin_required
def create_new_user():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")
    is_admin = data.get("is_admin", False)
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    if create_user(username, password, is_admin):
        return jsonify({"success": True}), 201
    else:
        return jsonify({"error": "Username already exists"}), 409

@app.route("/api/import-youtube", methods=["POST"])
@login_required
def import_youtube():
    data = request.get_json()
    url = data.get("url")
    username = data.get("username")
    password = data.get("password")
    if not url:
        return jsonify({"error": "YouTube URL required"}), 400

    file_path, title, artist = download_youtube_audio(url, username, password)
    if not file_path:
        return jsonify({"error": "Failed to download or convert video"}), 500

    # Send file with headers for client to know original metadata
    # We'll embed title/artist in custom headers or in Content-Disposition filename
    from urllib.parse import quote
    safe_title = quote(title or "audio")
    response = send_file(
        file_path,
        as_attachment=True,
        download_name=f"{safe_title}.mp3",
        mimetype="audio/mpeg"
    )
    # Add custom headers for metadata (optional)
    response.headers["X-Track-Title"] = title or ""
    response.headers["X-Track-Artist"] = artist or ""
    return response

# Serve frontend
@app.route("/")
def index():
    return app.send_static_file("index.html")

# Initialize database and admin user
init_db()
ensure_admin()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
