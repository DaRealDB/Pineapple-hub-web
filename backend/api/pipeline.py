"""
Pipeline API endpoints
Handles OCR pipeline management and control
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, validator
from typing import Optional, Dict
from datetime import datetime
import uuid
import threading
import time

from core.session_manager import SessionManager
from utils.config import settings
from utils.logger import setup_logger

router = APIRouter()
logger = setup_logger(__name__)


class PipelineConfig(BaseModel):
    """Pipeline configuration model"""
    ocr_interval: float = 1.0
    confidence_threshold: float = 0.5
    dedup_similarity_threshold: float = 0.85
    dedup_max_history: int = 10
    dedup_strategy: str = "fuzzy"
    
    @validator('ocr_interval')
    def validate_ocr_interval(cls, v):
        if v <= 0:
            raise ValueError('OCR interval must be positive')
        if v > 60:
            raise ValueError('OCR interval cannot exceed 60 seconds')
        return v
    
    @validator('confidence_threshold')
    def validate_confidence_threshold(cls, v):
        if not 0 <= v <= 1:
            raise ValueError('Confidence threshold must be between 0 and 1')
        return v
    
    @validator('dedup_similarity_threshold')
    def validate_dedup_threshold(cls, v):
        if not 0 <= v <= 1:
            raise ValueError('Deduplication threshold must be between 0 and 1')
        return v
    
    @validator('dedup_max_history')
    def validate_dedup_max_history(cls, v):
        if v <= 0:
            raise ValueError('Deduplication max history must be positive')
        if v > 1000:
            raise ValueError('Deduplication max history cannot exceed 1000')
        return v
    
    @validator('dedup_strategy')
    def validate_dedup_strategy(cls, v):
        valid_strategies = ['fuzzy', 'exact', 'semantic']
        if v not in valid_strategies:
            raise ValueError(f'Deduplication strategy must be one of {valid_strategies}')
        return v


class PipelineStatus(BaseModel):
    """Pipeline status model"""
    is_running: bool
    session_id: Optional[str]
    config: PipelineConfig
    metrics: Dict


# Global pipeline state
pipeline_state = {
    "is_running": False,
    "session_id": None,
    "config": PipelineConfig(),
    "thread": None,
    "stop_event": threading.Event()
}

session_manager = SessionManager()


@router.post("/start", response_model=dict)
async def start_pipeline(config: Optional[PipelineConfig] = None, background_tasks: BackgroundTasks = None):
    """Start the OCR pipeline"""
    try:
        global pipeline_state
        
        if pipeline_state["is_running"]:
            raise HTTPException(status_code=400, detail="Pipeline is already running")
        
        # Update config if provided
        if config:
            pipeline_state["config"] = config
            # Update settings
            settings.OCR_INTERVAL_SECONDS = config.ocr_interval
            settings.CONFIDENCE_THRESHOLD = config.confidence_threshold
            settings.DEDUP_SIMILARITY_THRESHOLD = config.dedup_similarity_threshold
            settings.DEDUP_MAX_HISTORY = config.dedup_max_history
            settings.DEDUP_STRATEGY = config.dedup_strategy
        
        # Create new session
        session_id = session_manager.create_session(
            device_id="webcam_main",
            config=pipeline_state["config"].model_dump()
        )
        pipeline_state["session_id"] = session_id
        
        # Reset stop event
        pipeline_state["stop_event"].clear()
        
        # Start pipeline thread
        pipeline_state["thread"] = threading.Thread(
            target=pipeline_worker,
            args=(pipeline_state["stop_event"], session_id)
        )
        pipeline_state["thread"].start()
        
        pipeline_state["is_running"] = True
        
        logger.info(f"Pipeline started with session {session_id}")
        
        return {
            "status": "started",
            "session_id": session_id,
            "config": pipeline_state["config"].model_dump()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting pipeline: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def start_pipeline_background():
    """Start pipeline in background (for auto-start from webcam)"""
    global pipeline_state
    
    if pipeline_state["is_running"]:
        return
    
    try:
        # Use simple session ID or auto-generate
        session_id = settings.SESSION_ID if settings.SESSION_ID else str(uuid.uuid4())
        
        # Create session (optional - will work in memory if DB fails)
        try:
            session_manager.create_session(
                device_id="webcam_main",
                config=pipeline_state["config"].model_dump()
            )
        except Exception as e:
            logger.warning(f"Session creation failed, continuing with in-memory: {e}")
        
        pipeline_state["session_id"] = session_id
        
        # Reset stop event
        pipeline_state["stop_event"].clear()
        
        # Start pipeline thread
        pipeline_state["thread"] = threading.Thread(
            target=pipeline_worker,
            args=(pipeline_state["stop_event"], session_id)
        )
        pipeline_state["thread"].start()
        
        pipeline_state["is_running"] = True
        
        logger.info(f"Pipeline auto-started with session {session_id}")
    except Exception as e:
        logger.error(f"Error auto-starting pipeline: {e}")


def stop_pipeline_background():
    """Stop pipeline in background (for auto-stop from webcam)"""
    global pipeline_state
    
    if not pipeline_state["is_running"]:
        return
    
    try:
        logger.info("Stopping pipeline worker...")
        
        # Signal stop
        pipeline_state["stop_event"].set()
        
        # Wait for thread to finish with longer timeout
        if pipeline_state["thread"]:
            pipeline_state["thread"].join(timeout=10)
            if pipeline_state["thread"].is_alive():
                logger.warning("Pipeline thread did not stop gracefully, forcing stop")
        
        # End session
        if pipeline_state["session_id"]:
            try:
                session_manager.end_session(pipeline_state["session_id"])
            except Exception as e:
                logger.warning(f"Session end failed: {e}")
        
        pipeline_state["is_running"] = False
        pipeline_state["session_id"] = None
        pipeline_state["thread"] = None
        
        logger.info("Pipeline auto-stopped successfully")
    except Exception as e:
        logger.error(f"Error auto-stopping pipeline: {e}")
        # Force cleanup even on error
        pipeline_state["is_running"] = False
        pipeline_state["session_id"] = None
        pipeline_state["thread"] = None


@router.post("/stop", response_model=dict)
async def stop_pipeline():
    """Stop the OCR pipeline"""
    try:
        global pipeline_state
        
        if not pipeline_state["is_running"]:
            raise HTTPException(status_code=400, detail="Pipeline is not running")
        
        # Signal stop
        pipeline_state["stop_event"].set()
        
        # Wait for thread to finish
        if pipeline_state["thread"]:
            pipeline_state["thread"].join(timeout=5)
        
        # End session
        if pipeline_state["session_id"]:
            session_manager.end_session(pipeline_state["session_id"])
        
        pipeline_state["is_running"] = False
        pipeline_state["session_id"] = None
        pipeline_state["thread"] = None
        
        logger.info("Pipeline stopped")
        
        return {"status": "stopped"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping pipeline: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config", response_model=dict)
async def update_pipeline_config(config: PipelineConfig):
    """Update pipeline configuration"""
    try:
        global pipeline_state
        
        # Update config
        pipeline_state["config"] = config
        
        # Update settings
        settings.OCR_INTERVAL_SECONDS = config.ocr_interval
        settings.CONFIDENCE_THRESHOLD = config.confidence_threshold
        settings.DEDUP_SIMILARITY_THRESHOLD = config.dedup_similarity_threshold
        settings.DEDUP_MAX_HISTORY = config.dedup_max_history
        settings.DEDUP_STRATEGY = config.dedup_strategy
        
        # Update session config if running
        if pipeline_state["is_running"] and pipeline_state["session_id"]:
            session_manager.update_session_config(
                pipeline_state["session_id"],
                config.model_dump()
            )
        
        logger.info("Pipeline configuration updated")
        
        return {"status": "updated", "config": config.model_dump()}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating pipeline config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=PipelineStatus)
async def get_pipeline_status():
    """Get current pipeline status"""
    try:
        metrics = session_manager.get_session_metrics(pipeline_state["session_id"]) if pipeline_state["session_id"] else {}
        
        return PipelineStatus(
            is_running=pipeline_state["is_running"],
            session_id=pipeline_state["session_id"],
            config=pipeline_state["config"],
            metrics=metrics
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pipeline status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics")
async def get_pipeline_metrics(
    session_id: Optional[str] = None,
    metric_type: Optional[str] = None,
    limit: int = 100
):
    """Get pipeline performance metrics"""
    try:
        target_session_id = session_id or pipeline_state["session_id"]
        
        if not target_session_id:
            raise HTTPException(status_code=400, detail="No active session")
        
        metrics = session_manager.get_session_metrics(
            target_session_id,
            metric_type=metric_type,
            limit=limit
        )
        
        return metrics
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pipeline metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def pipeline_worker(stop_event, session_id):
    """
    Pipeline worker — decoupled capture + OCR architecture.

    - Capture thread: reads frames at ~LIVE_VIEW_FPS, flushes stale buffers,
      broadcasts lightweight JPEG frames for smooth live preview.
    - OCR thread: grabs the latest frame at OCR_INTERVAL, resizes for speed,
      runs OCR via the engine directly (bypasses HTTP layer).
    - Single persistent asyncio event loop for ALL WebSocket broadcasts.
      Eliminates the per-frame event-loop create/destroy overhead (~15-45ms).
    """
    from api.webcam import get_webcam_capture
    from core.ocr_engine import OCREngine
    from core.deduplication import DeduplicationManager
    from websocket.server import manager
    import base64
    import time
    import cv2
    import asyncio
    import threading

    logger.info(f"Pipeline worker started for session {session_id}")

    # ── one persistent event loop for all WS broadcasts ──────────────
    loop = asyncio.new_event_loop()

    # ── shared state between threads ─────────────────────────────────
    latest_frame_lock = threading.Lock()
    latest_frame = {"data": None, "timestamp": 0}

    # ── OCR engine instances (thread-local) ─────────────────────────
    ocr_engine = OCREngine(
        engine=settings.OCR_ENGINE,
        gpu_enabled=settings.GPU_ENABLED,
        confidence_threshold=settings.CONFIDENCE_THRESHOLD,
    )
    dedup = DeduplicationManager(
        similarity_threshold=settings.DEDUP_SIMILARITY_THRESHOLD,
        max_history=settings.DEDUP_MAX_HISTORY,
        strategy=settings.DEDUP_STRATEGY,
    )

    # ── live-view throttle ──────────────────────────────────────────
    live_view_fps = getattr(settings, "LIVE_VIEW_FPS", 15)

    def capture_loop():
        """Fast capture thread — drains stale frames, broadcasts at live-view rate."""
        last_broadcast = 0.0
        broadcast_interval = 1.0 / max(live_view_fps, 1)

        while not stop_event.is_set():
            try:
                capture = get_webcam_capture()
                if not capture or not capture.isOpened():
                    time.sleep(0.1)
                    continue

                # Drain stale frames from OpenCV's internal buffer
                # so we always work with the most recent frame.
                for _ in range(3):
                    capture.grab()

                ret, frame = capture.read()
                if not ret or frame is None:
                    time.sleep(0.005)
                    continue

                now = time.time()

                # Store latest frame for the OCR thread
                with latest_frame_lock:
                    latest_frame["data"] = frame
                    latest_frame["timestamp"] = now

                # Broadcast for live view (throttled to avoid flooding the WS)
                if now - last_broadcast >= broadcast_interval:
                    # Lower JPEG quality = smaller payload = lower latency
                    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 60]
                    _, jpeg = cv2.imencode('.jpg', frame, encode_params)
                    frame_b64 = base64.b64encode(jpeg).decode('utf-8')

                    asyncio.run_coroutine_threadsafe(
                        manager.broadcast({
                            "type": "webcam_frame",
                            "payload": {
                                "frame_data": frame_b64,
                                "timestamp": now,
                            },
                        }),
                        loop,
                    )
                    last_broadcast = now

            except Exception as e:
                logger.error(f"Capture thread error: {e}")
                time.sleep(0.1)

    def ocr_loop():
        """OCR thread — grabs latest frame at OCR_INTERVAL and processes it."""
        frame_counter = 0
        prev_text_hash = None  # for simple frame-change skip

        while not stop_event.is_set():
            try:
                t_start = time.time()

                # Grab the latest frame
                with latest_frame_lock:
                    frame = latest_frame["data"]
                    frame_ts = latest_frame["timestamp"]

                if frame is None:
                    time.sleep(0.1)
                    continue

                frame_counter += 1

                # ── fast-change detection: skip OCR if frame looks identical ──
                # Compare a quick downsampled hash (32x32 grayscale)
                small = cv2.resize(frame, (32, 32))
                gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
                frame_hash = hash(gray.tobytes())

                if frame_hash == prev_text_hash and prev_text_hash is not None:
                    # Frame hasn't changed — skip expensive OCR
                    elapsed = time.time() - t_start
                    time.sleep(max(0, settings.OCR_INTERVAL_SECONDS - elapsed))
                    continue

                prev_text_hash = frame_hash

                # ── resize for OCR (smaller = faster recognition) ──
                ocr_w = getattr(settings, "OCR_RESIZE_WIDTH", 320)
                ocr_h = getattr(settings, "OCR_RESIZE_HEIGHT", 240)
                ocr_frame = cv2.resize(frame, (ocr_w, ocr_h))
                _, jpeg = cv2.imencode('.jpg', ocr_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                frame_b64 = base64.b64encode(jpeg).decode('utf-8')

                # ── OCR (synchronous, runs in this thread) ──
                ocr_raw = ocr_engine.process_image(frame_b64)

                # ── dedup ──
                text = ocr_raw.get("text", "")
                is_dup, sim_score = dedup.check_duplicate(text, session_id)
                if not is_dup and text:
                    dedup.add_to_history(text, session_id)

                processing_ms = int((time.time() - t_start) * 1000)

                # ── save to DB (best-effort) ──
                try:
                    from database.repository import OCRRepository
                    repo = OCRRepository()
                    if repo.db:
                        repo.create_ocr_result(
                            session_id=session_id,
                            text=text,
                            confidence=ocr_raw.get("confidence", 0.0),
                            bbox_data=ocr_raw.get("bbox_data"),
                            processing_time_ms=processing_ms,
                            is_duplicate=is_dup,
                            similarity_score=sim_score,
                        )
                except Exception:
                    pass

                # ── broadcast OCR result ──
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast({
                        "type": "ocr_result",
                        "payload": {
                            "text": text,
                            "confidence": ocr_raw.get("confidence", 0.0),
                            "bbox_data": ocr_raw.get("bbox_data"),
                            "processing_time_ms": processing_ms,
                            "is_duplicate": is_dup,
                            "similarity_score": sim_score,
                            "frame_number": frame_counter,
                        },
                    }),
                    loop,
                )

                # ── record metrics ──
                try:
                    session_manager.record_metric(session_id, "processing_time_ms", processing_ms)
                    session_manager.record_metric(session_id, "fps", 1000.0 / max(processing_ms, 1))
                except Exception:
                    pass

                # ── broadcast status ──
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast({
                        "type": "pipeline_status",
                        "payload": {
                            "fps": 1000.0 / max(processing_ms, 1),
                            "processing_time_ms": processing_ms,
                            "total_processed": frame_counter,
                        },
                    }),
                    loop,
                )

                logger.info(
                    f"OCR frame #{frame_counter}: '{text[:60]}' "
                    f"conf={ocr_raw.get('confidence', 0):.2f} "
                    f"dup={is_dup} {processing_ms}ms"
                )

                # ── sleep for OCR interval ──
                elapsed = time.time() - t_start
                time.sleep(max(0, settings.OCR_INTERVAL_SECONDS - elapsed))

            except Exception as e:
                logger.error(f"OCR thread error: {e}")
                time.sleep(0.5)

    # ── launch threads ──────────────────────────────────────────────
    capture_thread = threading.Thread(target=capture_loop, daemon=True, name="capture")
    ocr_thread = threading.Thread(target=ocr_loop, daemon=True, name="ocr")

    capture_thread.start()
    ocr_thread.start()

    # ── run the event loop (blocks until stop_event is set) ─────────
    def _watch_stop():
        """Periodically check stop_event and shut down the loop."""
        while not stop_event.is_set():
            time.sleep(0.25)
        loop.call_soon_threadsafe(loop.stop)

    watcher = threading.Thread(target=_watch_stop, daemon=True, name="stop-watcher")
    watcher.start()

    try:
        loop.run_forever()
    except Exception as e:
        logger.error(f"Event loop error: {e}")
    finally:
        # Clean shutdown
        loop.run_until_complete(loop.shutdown_asyncgens())
        loop.close()

    capture_thread.join(timeout=3)
    ocr_thread.join(timeout=3)

    logger.info(f"Pipeline worker stopped for session {session_id}")
