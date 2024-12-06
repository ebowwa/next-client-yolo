#!/bin/bash

echo "Cleaning up frontend..."

# Kill any running Next.js processes
pkill -f "next" || true

# Remove node_modules
if [ -d "node_modules" ]; then
    echo "Removing node_modules..."
    rm -rf node_modules
fi

# Remove Next.js build artifacts
if [ -d ".next" ]; then
    echo "Removing Next.js build files..."
    rm -rf .next
fi

# Remove package-lock.json
if [ -f "package-lock.json" ]; then
    echo "Removing package-lock.json..."
    rm package-lock.json
fi

echo "Frontend cleanup complete!"
