#!/bin/sh
set -e

DATA_DIR="/app/backend/data"
DB_FILE="$DATA_DIR/users.db"
SYMLINK="/app/backend/users.db"

mkdir -p "$DATA_DIR"
if [ ! -f "$DB_FILE" ]; then
    touch "$DB_FILE"
fi
if [ ! -L "$SYMLINK" ] && [ ! -f "$SYMLINK" ]; then
    ln -sf "$DB_FILE" "$SYMLINK"
fi

exec "$@"
