# Pineapple Hub Master - Integration Guide

## Overview
This guide explains how to integrate the original Pineapple Hub Web with the new OCR Pipeline backend to create the unified Master Architecture system.

## System Architecture

The Master Architecture consists of two main components:

1. **Frontend** (Original React Application)
   - React 19 with Vite
   - Real-time scale monitoring via MQTT
   - New OCR pipeline monitoring via WebSocket
   - Original styling and components preserved

2. **Backend** (New OCR Pipeline Server)
   - FastAPI with WebSocket support
   - PostgreSQL database
   - EasyOCR integration
   - Real-time data streaming

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+
- PostgreSQL 12+
- Webcam device
- MQTT broker (for original functionality)

### 1. Frontend Setup

```bash
cd Pineapple-hub-web
npm install
```

Update `.env` file with both MQTT and OCR configuration:

```bash
# Original MQTT Configuration
VITE_MQTT_WS_URL=ws://192.168.1.10:9001
VITE_NODE_RED_BASE_URL=http://localhost:1880

# New OCR Pipeline Configuration
VITE_OCR_WS_URL=ws://localhost:8000
VITE_OCR_API_URL=http://localhost:8000
```

Start frontend:
```bash
npm run dev
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Configure database in `.env.backend`:
```bash
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ocr_pipeline
```

Initialize database:
```bash
python -c "from database.models import Base, engine; Base.metadata.create_all(bind=engine)"
```

Start backend:
```bash
python main.py
```

### 3. Database Setup

Create PostgreSQL database:
```bash
createdb ocr_pipeline
```

Or using psql:
```bash
psql -U postgres
CREATE DATABASE ocr_pipeline;
\q
```

## Integration Points

### 1. Dual Real-time Connections

The frontend now maintains two simultaneous real-time connections:

**MQTT Connection** (Original):
- Connects to scale telemetry
- Provides weight, grade, and sensor data
- Managed by `useMqtt` hook

**WebSocket Connection** (New):
- Connects to OCR pipeline backend
- Provides OCR results, pipeline metrics, webcam frames
- Managed by `useWebSocket` hook

### 2. Enhanced App Component

The main `App.jsx` component now manages both data sources:

```javascript
const mqttContext = {
  connectionState: mqttConnectionState,
  availability,
  weightG,
  grade,
  status,
  dataValid,
};

const wsContext = {
  connectionState: wsConnectionState,
  pipelineStatus,
};
```

### 3. New Navigation Route

Added OCR Pipeline management screen:
- Route: `/ocr-pipeline`
- Component: `OCRPipeline.jsx`
- Sidebar navigation item added

### 4. Enhanced UI Components

**Sidebar** (`Sidebar.jsx`):
- Added OCR Pipeline navigation item
- Added pipeline status indicator
- Original styling preserved

**TopBar** (`TopBar.jsx`):
- Added OCR connection status indicator
- Dual connection state display
- Original styling preserved

### 5. New Frontend Components

**WebcamFeed** (`WebcamFeed.jsx`):
- Displays live webcam feed
- Uses original styling patterns
- Connection status indicator

**OCRResults** (`OCRResults.jsx`):
- Displays real-time OCR results
- Confidence scoring
- Duplicate detection display
- Original styling patterns

**PipelineStatus** (`PipelineStatus.jsx`):
- Pipeline health metrics
- Performance indicators
- Original styling patterns

### 6. New Frontend Hooks

**useWebSocket** (`useWebSocket.js`):
- Manages WebSocket connection
- Handles OCR result events
- Pipeline status monitoring
- Error handling and reconnection

**usePipeline** (`usePipeline.js`):
- Pipeline state management
- Configuration updates
- Start/stop control
- Metrics tracking

### 7. New Frontend Utilities

**ocrApi** (`ocrApi.js`):
- Pipeline control API calls
- OCR result retrieval
- Data export functions
- Verification operations

**formatters** (Enhanced):
- Added OCR confidence formatting
- Processing time formatting
- Confidence level categorization

## Data Flow

### Original Data Flow (Preserved)
```
MQTT Broker → useMqtt Hook → App Component → Scale Screens
```

### New Data Flow (Added)
```
Webcam → OCR Pipeline → WebSocket → useWebSocket Hook → App Component → OCR Screens
```

### Combined Data Flow
```
                    ┌─────────────┐
                    │ MQTT Broker │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ useMqtt Hook │
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │      App Component       │
              │  (Dual Context Mgmt)    │
              └────────────┬────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼──────┐  ┌────────▼────────┐  ┌────▼──────┐
│ Scale Screens│  │  OCR Screens    │  │ Analytics │
└──────────────┘  └─────────────────┘  └───────────┘

                    ┌─────────────┐
                    │ OCR Backend │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │useWebSocket │
                    │    Hook     │
                    └─────────────┘
```

## Database Integration

### Original vs New Database

**Original**: SQLite via Node-RED
- Scale readings
- Connection logs
- Export history

**New**: PostgreSQL via FastAPI
- All original data (migrated)
- OCR results
- Pipeline metrics
- Session management
- Deduplication history

### Migration Strategy

1. **Phase 1**: Run both databases in parallel
2. **Phase 2**: Migrate historical data to PostgreSQL
3. **Phase 3**: Update all queries to use PostgreSQL
4. **Phase 4**: Decommission SQLite

See `DATABASE_SCHEMA.md` for complete schema details.

## Configuration Management

### Frontend Environment Variables

```bash
# Original MQTT
VITE_MQTT_WS_URL=ws://192.168.1.10:9001
VITE_NODE_RED_BASE_URL=http://localhost:1880

# New OCR Pipeline
VITE_OCR_WS_URL=ws://localhost:8000
VITE_OCR_API_URL=http://localhost:8000
```

### Backend Environment Variables

```bash
# Webcam
WEBCAM_DEVICE_INDEX=0
WEBCAM_WIDTH=640
WEBCAM_HEIGHT=480
WEBCAM_FPS=30

# OCR
OCR_INTERVAL_SECONDS=1.0
OCR_ENGINE=easyocr
GPU_ENABLED=auto
CONFIDENCE_THRESHOLD=0.5

# Deduplication
DEDUP_SIMILARITY_THRESHOLD=0.85
DEDUP_MAX_HISTORY=10
DEDUP_STRATEGY=fuzzy

# Database
DATABASE_URL=postgresql://postgres:123456@localhost:5432/ocr_pipeline

# Server
WEBSOCKET_PORT=8000
WEBSOCKET_HOST=0.0.0.0
```

## Testing the Integration

### 1. Test Original Functionality

```bash
# Start frontend
npm run dev

# Navigate to http://localhost:5173
# Verify:
# - Live Grading screen shows scale data
# - MQTT connection indicator is green
# - Weight and grade data updates
```

### 2. Test New OCR Functionality

```bash
# Start backend
cd backend
python main.py

# In frontend, navigate to /ocr-pipeline
# Verify:
# - WebSocket connection indicator is green
# - Pipeline status shows healthy
# - Start pipeline button works
# - Webcam feed displays
# - OCR results appear
```

### 3. Test Combined Functionality

```bash
# Start both services
# Terminal 1: npm run dev
# Terminal 2: cd backend && python main.py

# Test simultaneous operation:
# - Open Live Grading screen (MQTT data)
# - Open OCR Pipeline screen (WebSocket data)
# - Verify both update in real-time
# - Check that both connection indicators show green
```

## Troubleshooting

### Frontend Issues

**MQTT Connection Failed**
- Verify MQTT broker is running
- Check `VITE_MQTT_WS_URL` in `.env`
- Check network connectivity

**WebSocket Connection Failed**
- Verify backend is running on port 8000
- Check `VITE_OCR_WS_URL` in `.env`
- Check firewall settings

**Styling Issues**
- All new components use original Tailwind classes
- Verify Tailwind config is unchanged
- Check for CSS conflicts

### Backend Issues

**Database Connection Failed**
- Verify PostgreSQL is running
- Check `DATABASE_URL` in `.env.backend`
- Ensure database exists

**Webcam Access Failed**
- Check webcam device index
- Verify permissions (Linux: video group)
- Ensure webcam not in use by other apps

**OCR Processing Slow**
- Enable GPU: `GPU_ENABLED=true`
- Reduce image resolution
- Increase `OCR_INTERVAL_SECONDS`

### Integration Issues

**Both Connections Not Working**
- Check both services are running
- Verify environment variables
- Check network connectivity

**Data Not Syncing**
- Verify WebSocket events are being sent
- Check frontend event handlers
- Review browser console for errors

## Performance Optimization

### Frontend Optimization

1. **Connection Management**
   - Implement connection pooling
   - Add exponential backoff for reconnection
   - Cache OCR results locally

2. **Component Optimization**
   - Use React.memo for expensive components
   - Implement virtual scrolling for large lists
   - Lazy load OCR results

3. **State Management**
   - Consider Redux for complex state
   - Implement optimistic updates
   - Add loading states

### Backend Optimization

1. **Database Optimization**
   - Add database indexes (already included in schema)
   - Implement connection pooling
   - Use read replicas for queries

2. **OCR Optimization**
   - Enable GPU acceleration
   - Implement batch processing
   - Cache frequent patterns

3. **WebSocket Optimization**
   - Implement message compression
   - Add rate limiting
   - Use binary data for frames

## Deployment

### Development Deployment

```bash
# Frontend
npm run dev

# Backend
cd backend
python main.py
```

### Production Deployment

**Frontend**:
```bash
npm run build
# Serve dist/ folder with nginx or similar
```

**Backend**:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

**Database**:
- Use managed PostgreSQL service
- Implement regular backups
- Set up replication for high availability

### Docker Deployment (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  frontend:
    build: ./Pineapple-hub-web
    ports:
      - "5173:5173"
    environment:
      - VITE_MQTT_WS_URL=ws://mqtt-broker:9001
      - VITE_OCR_WS_URL=ws://backend:8000
  
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/ocr_pipeline
    depends_on:
      - db
  
  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=ocr_pipeline
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## Monitoring

### Frontend Monitoring

- Connection status indicators in UI
- Browser console for errors
- Network tab for WebSocket messages
- Performance profiling

### Backend Monitoring

- API endpoint logs
- WebSocket connection logs
- Database query logs
- Performance metrics in database

### System Monitoring

- Server resource usage
- Database performance
- Network latency
- Error rates

## Security Considerations

### Frontend Security

- Validate all user inputs
- Sanitize OCR results before display
- Implement rate limiting
- Use HTTPS in production

### Backend Security

- Add authentication middleware
- Implement rate limiting
- Validate all API inputs
- Use environment variables for secrets
- Enable CORS only for trusted origins

### Database Security

- Use strong passwords
- Implement row-level security
- Regular backups
- Encrypt sensitive data
- Restrict network access

## Next Steps

1. **Testing**: Implement comprehensive test suite
2. **Documentation**: Add API documentation with Swagger
3. **Monitoring**: Set up application monitoring (Prometheus/Grafana)
4. **CI/CD**: Implement automated deployment pipeline
5. **Scaling**: Design for horizontal scaling
6. **Backup**: Implement automated backup strategy

## Support

For issues or questions:
- Check logs in both frontend and backend
- Review configuration files
- Consult individual component documentation
- Check database connectivity

## License

This integrated system is part of the Pineapple Hub Master architecture.
