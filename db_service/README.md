# Detection Database Service

This service provides a persistent storage solution for object detections and Gemini analyses. It's designed to be easily swappable between SQLite (development) and Supabase (production).

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Start the service:
```bash
python main.py
```

The service will run on `http://localhost:8000`

## API Endpoints

- `POST /detections/` - Create a new detection
- `GET /detections/` - Get all detections (with pagination)
- `PUT /detections/{detection_id}/analysis` - Update Gemini analysis for a detection

## Environment Variables

- `DATABASE_URL` - Database connection string (defaults to SQLite)

## Switching to Supabase

To switch to Supabase:
1. Install the `asyncpg` package
2. Set the `DATABASE_URL` environment variable to your Supabase connection string
3. Update the database connection parameters in `database.py`
