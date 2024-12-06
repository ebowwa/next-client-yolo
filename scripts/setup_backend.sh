#!/bin/bash

# Exit on error
set -e

echo "Setting up backend environment..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Python3 is not installed. Please install Python3 first."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install requirements
echo "Installing Python dependencies..."
pip install fastapi uvicorn sqlalchemy pydantic python-dotenv google-generativeai

# Create necessary directories
mkdir -p db_service

# Check if .env file exists, create if it doesn't
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    echo "GEMINI_API_KEY=" > .env
    echo "Please add your Gemini API key to .env file"
fi

echo "Backend setup complete! To start the backend server:"
echo "1. Activate the virtual environment: source venv/bin/activate"
echo "2. Run: python3 -m uvicorn db_service.main:app --reload"
