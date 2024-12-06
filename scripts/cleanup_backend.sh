#!/bin/bash

echo "Cleaning up backend..."

# Kill any running uvicorn processes
pkill -f "uvicorn" || true

# Remove virtual environment
if [ -d "venv" ]; then
    echo "Removing virtual environment..."
    rm -rf venv
fi

# Remove Python cache files
echo "Removing Python cache files..."
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete
find . -type f -name "*.pyo" -delete
find . -type f -name "*.pyd" -delete

# Remove SQLite database if it exists
if [ -f "database.db" ]; then
    echo "Removing database..."
    rm database.db
fi

echo "Backend cleanup complete!"
