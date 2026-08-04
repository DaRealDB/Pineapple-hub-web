"""
OCR Pipeline Backend - FastAPI Application
Main entry point for the OCR pipeline server
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
from dotenv import load_dotenv
import json

from api import webcam, ocr, pipeline
from websocket.server import manager
from utils.config import settings
from utils.logger import setup_logger

# Load environment variables
load_dotenv()

# Setup logger
logger = setup_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    logger.info("Starting OCR Pipeline Backend...")
    logger.info(f"WebSocket server will run on {settings.WEBSOCKET_HOST}:{settings.WEBSOCKET_PORT}")
    logger.info(f"Database configured: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'unknown'}")
    yield
    logger.info("Shutting down OCR Pipeline Backend...")

# Create FastAPI app
app = FastAPI(
    title="OCR Pipeline API",
    description="API for OCR pipeline management and real-time data streaming",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS - more restrictive for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Configure appropriately for production
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "WEBSOCKET"],
    allow_headers=["*"],
)

# Include routers
app.include_router(webcam.router, prefix="/api/webcam", tags=["webcam"])
app.include_router(ocr.router, prefix="/api/ocr", tags=["ocr"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "OCR Pipeline API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Basic database connection check
        from database.repository import DatabaseRepository
        db = DatabaseRepository()
        database_connected = db.db is not None
        return {
            "status": "healthy",
            "websocket_port": settings.WEBSOCKET_PORT,
            "database_connected": database_connected,
            "database_message": "Connected" if database_connected else "Running in development mode without database"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "degraded",
            "websocket_port": settings.WEBSOCKET_PORT,
            "database_connected": False,
            "database_message": f"Database unavailable: {str(e)}"
        }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time data streaming"""
    # Check and upgrade connection headers
    if websocket.headers.get("upgrade") != "websocket":
        logger.error(f"Invalid WebSocket upgrade request from {websocket.client}")
        await websocket.close(code=1002, reason="Protocol error")
        return
    
    await manager.connect(websocket)
    logger.info(f"WebSocket connection established from {websocket.client}")
    
    try:
        # Send initial connection confirmation
        await manager.send_personal_message(
            json.dumps({"type": "connection_established", "status": "connected"}),
            websocket
        )
        
        while True:
            data = await websocket.receive_text()
            logger.debug(f"Received WebSocket message: {data}")
            # Handle incoming WebSocket messages if needed
            await manager.send_personal_message(
                json.dumps({"type": "echo", "message": f"Received: {data}"}),
                websocket
            )
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected from {websocket.client}")
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error from {websocket.client}: {e}")
        manager.disconnect(websocket)

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.WEBSOCKET_HOST,
        port=settings.WEBSOCKET_PORT,
        reload=True,
        log_level="info"
    )
