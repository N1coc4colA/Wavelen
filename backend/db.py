import os
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash

# Create a 'data' directory next to this file (if it doesn't exist)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "users.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0
        )
    ''')
    conn.commit()
    conn.close()

def get_user(username):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, username, password_hash, is_admin FROM users WHERE username = ?", (username,))
    row = c.fetchone()
    conn.close()
    if row:
        return {"id": row[0], "username": row[1], "password_hash": row[2], "is_admin": bool(row[3])}
    return None

def get_user_by_id(user_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, username, is_admin FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return {"id": row[0], "username": row[1], "is_admin": bool(row[2])}
    return None

def create_user(username, password, is_admin=False):
    # Hashes the password using scrypt with a unique, automatically generated salt
    hashed = generate_password_hash(password, method="scrypt")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    try:
        c.execute("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)",
                  (username, hashed, 1 if is_admin else 0))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def verify_user(username, password):
    user = get_user(username)
    # Verifies the plaintext password against the stored salt and hash
    if user and check_password_hash(user["password_hash"], password):
        return user
    return None

def list_users():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, username, is_admin FROM users ORDER BY id")
    rows = c.fetchall()
    conn.close()
    return [{"id": r[0], "username": r[1], "is_admin": bool(r[2])} for r in rows]

# Ensure admin exists on first run
def ensure_admin():
    admin = get_user("admin")
    if not admin:
        default_pass = os.environ.get("ADMIN_PASSWORD", "admin")
        create_user("admin", default_pass, is_admin=True)
        print(f"Admin user created (default password: {default_pass})")
