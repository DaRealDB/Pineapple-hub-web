"""
OCR Pipeline Backend — FastAPI entry point.

Start with:
    python backend/main.py
    or
    uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
"""

import sys
import os

# Add the project ROOT (parent of backend/) to sys.path so that
# both "backend.*" (for uvicorn) and bare package imports
# ("utils.config", "api.pipeline", etc.) resolve correctly.
_backend_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(_backend_dir)
for _d in (_project_root, _backend_dir):
    if _d not in sys.path:
        sys.path.insert(0, _d)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from utils.config import settings
from utils.logger import setup_logger
from websocket.server import manager
from api.pipeline import router as pipeline_router
from api.webcam import router as webcam_router

logger = setup_logger("main")


# ── lifespan (startup / shutdown) ─────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — runs on startup and shutdown."""
    logger.info("=" * 60)
    logger.info("OCR Pipeline Backend starting up")
    logger.info(f"  WebSocket host: {settings.WEBSOCKET_HOST}")
    logger.info(f"  WebSocket port: {settings.WEBSOCKET_PORT}")
    logger.info(f"  OCR engine:     {settings.OCR_ENGINE}")
    logger.info(f"  GPU enabled:    {settings.GPU_ENABLED}")
    logger.info(f"  Webcam device:  {settings.WEBCAM_DEVICE_INDEX}")
    logger.info("=" * 60)
    yield
    logger.info("OCR Pipeline Backend shutting down")


# ── app ───────────────────────────────────────────────────────────
app = FastAPI(
    title="OCR Pipeline Backend",
    description="Real-time OCR pipeline with webcam capture, WebSocket streaming, and deduplication",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the Vite dev server (and any local frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",  # Vite preview
        "*",  # permit file:// and other dev origins
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── routers ───────────────────────────────────────────────────────
app.include_router(pipeline_router, prefix="/api/pipeline", tags=["Pipeline"])
app.include_router(webcam_router, prefix="/api/webcam", tags=["Webcam"])


# ── WebSocket endpoint ────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time pipeline data.

    Message types sent to clients:
      - connection_established: Handshake confirmation
      - ocr_result: New OCR text recognition result
      - pipeline_status: Pipeline health and performance metrics
      - webcam_frame: Base64-encoded JPEG frame data
      - deduplication_alert: Duplicate detection alert
    """
    await manager.connect(websocket)
    try:
        # Keep the connection alive — listen for client messages
        # (the server push model means we mostly just hold the socket open)
        while True:
            data = await websocket.receive_text()
            # Future: handle client→server commands here
            logger.debug(f"WS message from client: {data[:100]}")
    except WebSocketDisconnect:
        logger.debug("WebSocket client disconnected cleanly")
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
    finally:
        await manager.disconnect(websocket)


# ── health check ──────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    """Simple health check endpoint."""
    return {
        "status": "healthy",
        "ws_clients": manager.client_count,
        "ocr_engine": settings.OCR_ENGINE,
    }


# ── direct runner (python backend/main.py) ────────────────────────
if __name__ == "__main__":
    import uvicorn

    logger.info("Starting uvicorn server ...")
    uvicorn.run(
        "backend.main:app",
        host=settings.WEBSOCKET_HOST,
        port=settings.WEBSOCKET_PORT,
        reload=True,
        log_level="info",
        reload_dirs=[_project_root] if os.path.exists(_project_root) else None,
    )
