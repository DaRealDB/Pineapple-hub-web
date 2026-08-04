# Pineapple Hub Master - Complete System

## Overview
Pineapple Hub Master is an enhanced real-time monitoring and management dashboard for pineapple grading operations at Bukidnon. This system merges the original React-based dashboard with a new OCR pipeline system that adds webcam-based optical character recognition capabilities.

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+
- PostgreSQL 12+
- Webcam device
- MQTT broker (for original functionality)

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### Database Setup
```bash
createdb ocr_pipeline
# Tables are created automatically on first run
```

## Configuration

### Frontend (.env)
```bash
# Original MQTT Configuration
VITE_MQTT_WS_URL=ws://192.168.1.10:9001
VITE_NODE_RED_BASE_URL=http://localhost:1880

# New OCR Pipeline Configuration
VITE_OCR_WS_URL=ws://localhost:8000
VITE_OCR_API_URL=http://localhost:8000
```

### Backend (.env.backend)
```bash
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

# Deduplication Configuration
DEDUP_SIMILARITY_THRESHOLD=0.85
DEDUP_MAX_HISTORY=10
DEDUP_STRATEGY=fuzzy

# Database Configuration
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ocr_pipeline

# Server Configuration
WEBSOCKET_PORT=8000
WEBSOCKET_HOST=0.0.0.0
```

## Architecture

### Technology Stack

**Frontend:**
- React 19.0.0
- React Router DOM 7.1.0
- Vite 6.0.5
- Tailwind CSS 3.4.17
- MQTT.js 5.10.1
- Recharts 2.15.0

**Backend:**
- FastAPI 0.104.1
- Uvicorn 0.24.0
- SQLAlchemy 2.0.23
- PostgreSQL
- EasyOCR 1.7.1
- PyTorch 2.1.0
- OpenCV 4.8.1.78

### Project Structure
```
Pineapple-hub-web/
├── frontend/                   # React frontend
│   ├── src/                   # React source code
│   │   ├── components/        # UI components
│   │   ├── screens/           # Screen components
│   │   ├── hooks/             # React hooks
│   │   └── utils/             # Utilities
│   ├── public/               # Static assets
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── backend/                    # FastAPI backend
│   ├── api/                   # API endpoints
│   ├── core/                  # Business logic
│   ├── database/              # Database layer
│   ├── websocket/             # WebSocket server
│   └── utils/                 # Utilities
└── docs/                      # Documentation
    ├── DATABASE_SCHEMA.md     # Database schema
    ├── BACKEND_SETUP.md       # Backend setup
    └── INTEGRATION_GUIDE.md   # Integration guide
```

## Key Features

### Original Features (Preserved)
- Real-time scale monitoring via MQTT
- Weight and grade classification
- Live grading dashboard
- Operations log and history
- Performance analytics
- Device management
- Reports and exports

### New Features (Added)
- Real-time OCR text recognition
- Live webcam feed integration
- Dual real-time connections (MQTT + WebSocket)
- Pipeline performance monitoring
- Duplicate detection and management
- GPU-accelerated OCR processing
- Session-based tracking

## API Endpoints

### Frontend Routes
- `/` - Live Grading
- `/operations-log` - Operations History
- `/analytics` - Performance Analytics
- `/devices` - Device Management
- `/ocr-pipeline` - OCR Pipeline Management
- `/reports` - Reports and Exports

### Backend API
- `POST /api/webcam/start` - Start webcam capture
- `POST /api/webcam/stop` - Stop webcam capture
- `GET /api/webcam/frame` - Capture single frame
- `POST /api/ocr/process` - Process OCR on image
- `GET /api/ocr/results` - Get OCR results
- `POST /api/pipeline/start` - Start OCR pipeline
- `POST /api/pipeline/stop` - Stop OCR pipeline
- `WS /ws` - WebSocket endpoint for real-time data

## Database Schema

See `docs/DATABASE_SCHEMA.md` for complete database schema including:
- 10 main tables with relationships
- Stored procedures and triggers
- Performance optimization indexes
- Security policies

## Security Considerations

### Environment Variables
- Never commit `.env` files
- Use strong database passwords
- Restrict CORS origins in production
- Enable HTTPS in production

### Input Validation
- All API inputs are validated
- OCR results are sanitized before display
- SQL injection prevention via parameterized queries
- XSS prevention via React's built-in escaping

## Performance Optimization

### Frontend
- React.memo for component optimization
- Efficient state management with hooks
- Lazy loading for large datasets
- Optimized re-renders with useMemo/useCallback

### Backend
- GPU-accelerated OCR processing
- Database connection pooling
- WebSocket connection management
- Efficient deduplication algorithms

## Troubleshooting

### Common Issues

**MQTT Connection Failed**
- Verify MQTT broker is running
- Check `VITE_MQTT_WS_URL` in `.env`
- Check network connectivity

**WebSocket Connection Failed**
- Verify backend is running on port 8000
- Check `VITE_OCR_WS_URL` in `.env`
- Check firewall settings

**Database Connection Failed**
- Verify PostgreSQL is running
- Check `DATABASE_URL` in `.env.backend`
- Ensure database exists

**Webcam Access Failed**
- Check webcam device index
- Verify permissions (Linux: video group)
- Ensure webcam not in use by other apps

## Documentation

- `docs/DATABASE_SCHEMA.md` - Complete database schema
- `docs/BACKEND_SETUP.md` - Backend setup and configuration
- `docs/INTEGRATION_GUIDE.md` - Integration instructions

## License

This system is part of the Pineapple Hub Master architecture.
