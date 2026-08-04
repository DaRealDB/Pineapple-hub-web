# OCR Pipeline Backend - Setup Guide

## Overview
This is the backend server for the OCR Pipeline functionality in the Pineapple Hub Master system. It provides REST API endpoints, WebSocket communication, and database management for real-time text recognition from webcam feeds.

## Prerequisites

- Python 3.8 or higher
- PostgreSQL 12 or higher
- Webcam device (for OCR functionality)
- GPU (optional, for faster OCR processing)

## Installation

### 1. Set up Python Environment

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Set up PostgreSQL Database

```bash
# Create database
createdb ocr_pipeline

# Or using psql
psql -U postgres
CREATE DATABASE ocr_pipeline;
\q
```

### 4. Configure Environment Variables

Copy the example environment file and update as needed:

```bash
cp .env.backend .env
```

Edit `.env` with your configuration:

```bash
# Database Configuration
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ocr_pipeline

# Webcam Configuration
WEBCAM_DEVICE_INDEX=0
WEBCAM_WIDTH=640
WEBCAM_HEIGHT=480
WEBCAM_FPS=30

# OCR Configuration
OCR_INTERVAL_SECONDS=1.0
OCR_ENGINE=easyocr
GPU_ENABLED=auto
CONFIDENCE_THRESHOLD=0.5

# Server Configuration
WEBSOCKET_PORT=8000
WEBSOCKET_HOST=0.0.0.0
```

### 5. Initialize Database

The database tables will be created automatically when you first run the server. To manually initialize:

```bash
python -c "from database.models import Base, engine; Base.metadata.create_all(bind=engine)"
```

## Running the Server

### Development Mode

```bash
python main.py
```

The server will start on `http://localhost:8000` with auto-reload enabled.

### Production Mode

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Endpoints

### Root
- `GET /` - API information
- `GET /health` - Health check

### Webcam
- `POST /api/webcam/start` - Start webcam capture
- `POST /api/webcam/stop` - Stop webcam capture
- `GET /api/webcam/frame` - Capture single frame
- `GET /api/webcam/status` - Get webcam status

### OCR
- `POST /api/ocr/process` - Process OCR on image
- `GET /api/ocr/results` - Get OCR results
- `POST /api/ocr/verify` - Verify OCR result
- `GET /api/ocr/export` - Export OCR data
- `GET /api/ocr/metrics` - Get OCR metrics

### Pipeline
- `POST /api/pipeline/start` - Start OCR pipeline
- `POST /api/pipeline/stop` - Stop OCR pipeline
- `POST /api/pipeline/config` - Update pipeline configuration
- `GET /api/pipeline/status` - Get pipeline status
- `GET /api/pipeline/metrics` - Get pipeline metrics

### WebSocket
- `WS /ws` - WebSocket endpoint for real-time data

## WebSocket Events

### Client → Server
- Configuration updates
- Control commands

### Server → Client
- `ocr_result` - New OCR text recognition results
- `pipeline_status` - Pipeline health and performance metrics
- `webcam_frame` - Processed webcam frames
- `deduplication_alert` - Duplicate detection alerts

## Configuration

### OCR Engine Settings

- `OCR_ENGINE`: OCR engine to use (`easyocr`)
- `GPU_ENABLED`: GPU acceleration (`auto`, `true`, `false`)
- `CONFIDENCE_THRESHOLD`: Minimum confidence for results (0.0-1.0)

### Deduplication Settings

- `DEDUP_SIMILARITY_THRESHOLD`: Similarity threshold for duplicates (0.0-1.0)
- `DEDUP_MAX_HISTORY`: Maximum recent results to keep in memory
- `DEDUP_STRATEGY`: Deduplication strategy (`fuzzy`, `exact`, `semantic`)

### Performance Settings

- `OCR_INTERVAL_SECONDS`: Time between OCR processing cycles
- `ENABLE_PERFORMANCE_LOGGING`: Enable performance logging
- `LOG_INTERVAL_SECONDS`: Interval for performance logs

## Testing

### Test Webcam

```bash
curl http://localhost:8000/api/webcam/status
```

### Test OCR Processing

```bash
curl -X POST http://localhost:8000/api/ocr/process \
  -H "Content-Type: application/json" \
  -d '{"image_data": "base64_encoded_image", "session_id": "test"}'
```

### Test Pipeline

```bash
# Start pipeline
curl -X POST http://localhost:8000/api/pipeline/start

# Check status
curl http://localhost:8000/api/pipeline/status

# Stop pipeline
curl -X POST http://localhost:8000/api/pipeline/stop
```

## Troubleshooting

### Webcam Issues

If webcam fails to start:
- Check device index in configuration
- Ensure webcam is not in use by another application
- Verify permissions (Linux: add user to `video` group)

### OCR Performance

If OCR is slow:
- Enable GPU acceleration: `GPU_ENABLED=true`
- Reduce image resolution in configuration
- Increase `OCR_INTERVAL_SECONDS`
- Close other GPU-intensive applications

### Database Connection Issues

If database connection fails:
- Verify PostgreSQL is running
- Check connection string in `.env`
- Ensure database exists
- Check firewall settings

### Import Errors

If you get import errors:
- Ensure virtual environment is activated
- Reinstall dependencies: `pip install -r requirements.txt`
- Check Python version compatibility

## Monitoring

### Logs

Server logs are output to console with timestamps and log levels.

### Performance Metrics

Access performance metrics via:
- API: `GET /api/pipeline/metrics`
- WebSocket: `pipeline_status` events
- Database: `pipeline_metrics` table

## Security Considerations

### Production Deployment

1. **Environment Variables**: Never commit `.env` files
2. **CORS**: Update CORS settings for specific origins
3. **Authentication**: Add authentication middleware
4. **HTTPS**: Use reverse proxy (nginx) with SSL
5. **Database**: Use strong passwords and restricted access
6. **Rate Limiting**: Implement rate limiting for API endpoints

### Database Security

- Use read-only database users for queries
- Implement row-level security for multi-tenant access
- Regular backups and point-in-time recovery
- Encrypt sensitive data at rest

## Development

### Project Structure

```
backend/
├── api/                    # API endpoints
│   ├── webcam.py          # Webcam control
│   ├── ocr.py             # OCR processing
│   └── pipeline.py        # Pipeline management
├── core/                  # Core business logic
│   ├── ocr_engine.py      # OCR engine integration
│   ├── deduplication.py   # Duplicate detection
│   └── session_manager.py # Session management
├── database/              # Database layer
│   ├── models.py          # SQLAlchemy models
│   └── repository.py      # Database operations
├── websocket/             # WebSocket server
│   └── server.py          # Connection management
├── utils/                 # Utilities
│   ├── config.py          # Configuration management
│   └── logger.py          # Logging setup
├── main.py               # Application entry point
└── requirements.txt       # Python dependencies
```

### Adding New Features

1. Add API endpoint in appropriate `api/` module
2. Add business logic in `core/` if needed
3. Update database models if required
4. Add repository methods for database operations
5. Update WebSocket events if real-time updates needed
6. Add tests (not implemented yet)

## License

This backend is part of the Pineapple Hub Master system.
