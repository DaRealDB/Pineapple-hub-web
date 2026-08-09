"""
OCR Pipeline Backend — FastAPI entry point.

Start with:
    python backend/main.py
    or
    uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
"""

import sys
import os
import asyncio
import json

# Add the project ROOT (parent of backend/) to sys.path so that
# both "backend.*" (for uvicorn) and bare package imports
# ("utils.config", "api.pipeline", etc.) resolve correctly.
_backend_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(_backend_dir)
for _d in (_project_root, _backend_dir):
    if _d not in sys.path:
        sys.path.insert(0, _d)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager

from utils.config import settings
from utils.logger import setup_logger
from websocket.server import manager
from websocket.sse_manager import sse_manager
from api.pipeline import router as pipeline_router
from api.webcam import router as webcam_router

logger = setup_logger("main")


# ── lifespan (startup / shutdown) ─────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — runs on startup and shutdown."""
    logger.info("=" * 60)
    logger.info("OCR Pipeline Backend starting up")
    logger.info(f"  WebSocket host:  {settings.WEBSOCKET_HOST}")
    logger.info(f"  WebSocket port:  {settings.WEBSOCKET_PORT}")
    logger.info(f"  OCR engine:      {settings.OCR_ENGINE}")
    logger.info(f"  GPU enabled:     {settings.GPU_ENABLED}")
    logger.info(f"  Webcam device:   {settings.WEBCAM_DEVICE_INDEX}")
    logger.info(f"  YOLO enabled:    {settings.YOLO_ENABLED}")
    logger.info(f"  YOLO weights:    {settings.YOLO_WEIGHTS_PATH}")
    logger.info(f"  YOLO confidence: {settings.YOLO_CONFIDENCE_THRESHOLD}")
    logger.info(f"  Crate SM enabled: {settings.CRATE_STATE_MACHINE_ENABLED}")
    logger.info("=" * 60)
    yield

    # ── shutdown: release webcam hardware ──────────────────────────
    try:
        from api.webcam import release_webcam_hardware
        release_webcam_hardware()
    except Exception:
        pass

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


# ── SSE endpoint (Server-Sent Events) ─────────────────────────────
@app.get("/api/pipeline/stream")
async def pipeline_sse_stream(request: Request):
    """
    SSE stream of pipeline events — OCR results, status, YOLO, crate state.

    Replaces WebSocket for data push. The browser EventSource API
    auto-reconnects on disconnect with no client-side logic needed.

    Connect from frontend:
        const es = new EventSource('http://localhost:8000/api/pipeline/stream');
        es.addEventListener('ocr_result', (e) => { ... });
    """
    queue = await sse_manager.subscribe()

    async def event_generator():
        try:
            # Send initial connection event
            yield "event: connected\ndata: {}\n\n"

            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break

                try:
                    # Wait for next event with a 15s keepalive timeout
                    data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    # Parse back to get event type for the SSE 'event:' field
                    parsed = json.loads(data)
                    event_type = parsed.get("type", "message")
                    yield f"event: {event_type}\ndata: {data}\n\n"
                except asyncio.TimeoutError:
                    # Send keepalive comment to prevent proxy timeouts
                    yield ": keepalive\n\n"
                except asyncio.CancelledError:
                    break
        finally:
            await sse_manager.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable nginx buffering
        },
    )


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
    # Only reload on changes to backend/ Python files (not the whole repo).
    # Watching _project_root triggered restarts on Vite HMR, debug JPEGs,
    # node_modules writes, and any file edit — killing the pipeline each time.
    _reload_dir = os.path.join(_project_root, "backend")
    uvicorn.run(
        "backend.main:app",
        host=settings.WEBSOCKET_HOST,
        port=settings.WEBSOCKET_PORT,
        reload=True,
        log_level="info",
        reload_dirs=[_reload_dir] if os.path.isdir(_reload_dir) else None,
        reload_excludes=["*.jpg", "*.png", "__pycache__/*", "*.pyc"],
    )
