#!/bin/bash

# Exit on error
set -e

echo "Setting up frontend environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Install dependencies
echo "Installing Node.js dependencies..."
npm install

# Create necessary directories
mkdir -p src/utils src/components public

echo "Frontend setup complete! To start the frontend server:"
echo "Run: npm run dev"
