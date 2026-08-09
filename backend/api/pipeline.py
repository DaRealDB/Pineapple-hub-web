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


# Global state machine reference (set by pipeline worker, read by manual-log endpoint)
_active_state_machine = None


def get_active_state_machine():
    """Returns the active CrateStateMachine, or None if pipeline not running."""
    return _active_state_machine


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


@router.post("/manual-log", response_model=dict)
async def manual_log_trigger():
    """
    Manually trigger a crate log commit if the state machine is READY.
    Called by the Express backend when the HMI LOG TRIGGER button is pressed.

    Returns 409 if state machine is not in READY state.
    """
    sm = get_active_state_machine()
    if sm is None:
        raise HTTPException(status_code=503, detail={
            "success": False,
            "reason": "pipeline_not_running",
            "missing": ["state_machine"],
            "current_state": "NONE",
        })

    result = sm.manual_log_trigger()

    if not result["success"]:
        raise HTTPException(status_code=409, detail=result)

    return result


@router.get("/crate-logs")
async def get_crate_logs(limit: int = 20):
    """Get recent crate logs from the operations_log table."""
    try:
        from database.repository import DatabaseRepository
        from sqlalchemy import text
        repo = DatabaseRepository()
        if not repo.db:
            return {"logs": [], "total": 0}
        rows = repo.db.execute(
            text(
                "SELECT id, batch_id, weight_g, grade, ocr_text, "
                "ocr_confidence, audit_status, metadata, timestamp "
                "FROM operations_log ORDER BY timestamp DESC LIMIT :lim"
            ),
            {"lim": limit},
        ).fetchall()
        logs = []
        for r in rows:
            meta = r.metadata or {}
            logs.append({
                "id": r.id,
                "batch_id": r.batch_id,
                "weight_g": float(r.weight_g) if r.weight_g else None,
                "grade": r.grade,
                "ocr_text": r.ocr_text,
                "ocr_confidence": float(r.ocr_confidence) if r.ocr_confidence else None,
                "audit_status": r.audit_status,
                "capture_trigger": meta.get("capture_trigger", "unknown") if isinstance(meta, dict) else "unknown",
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            })
        return {"logs": logs, "total": len(logs)}
    except Exception as e:
        logger.error(f"Error fetching crate logs: {e}")
        return {"logs": [], "total": 0}


def pipeline_worker(stop_event, session_id):
    """
    Pipeline worker — decoupled capture + YOLO + OCR architecture.

    - Capture thread: reads frames at ~LIVE_VIEW_FPS, flushes stale buffers,
      runs YOLO detection, draws bounding boxes, broadcasts annotated JPEG
      frames for smooth live preview with detection overlays.
    - OCR thread: grabs the latest YOLO detections at OCR_INTERVAL, crops
      to the primary box region (if detected), runs OCR on the crop.
      Hands in frame → OCR suppressed (safety). No box → falls back to
      full-frame OCR.
    - Single persistent asyncio event loop for ALL WebSocket broadcasts.
      Eliminates the per-frame event-loop create/destroy overhead (~15-45ms).
    """
    from api.webcam import get_webcam_capture
    from core.ocr_engine import OCREngine
    from core.deduplication import DeduplicationManager
    from core.yolo_detector import YOLODetector
    from websocket.server import manager
    from websocket.sse_manager import sse_manager
    import base64
    import time
    import cv2
    import asyncio
    import threading

    logger.info(f"Pipeline worker started for session {session_id}")

    # ── one persistent event loop for all WS broadcasts ──────────────
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # ── shared state between threads ─────────────────────────────────
    latest_frame_lock = threading.Lock()
    latest_frame = {"data": None, "timestamp": 0}

    # YOLO detections shared between capture and OCR threads
    latest_detections_lock = threading.Lock()
    latest_detections = {"data": None, "timestamp": 0}

    # ── engine instances (created once, shared across threads) ───────
    yolo_enabled = getattr(settings, "YOLO_ENABLED", "true").lower() == "true"
    yolo_detector = YOLODetector(
        weights_path=settings.YOLO_WEIGHTS_PATH,
        confidence=settings.YOLO_CONFIDENCE_THRESHOLD,
        image_size=settings.YOLO_IMAGE_SIZE,
        enabled=yolo_enabled,
    )
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

    # ── crate state machine (backend-driven logging) ───────────────
    from core.crate_state_machine import CrateStateMachine
    sm_enabled = getattr(settings, "CRATE_STATE_MACHINE_ENABLED", True)
    state_machine = CrateStateMachine() if sm_enabled else None

    # Expose state machine to the manual-log API endpoint
    global _active_state_machine
    _active_state_machine = state_machine

    mqtt_client = None
    if state_machine:
        logger.info("[CrateSM] State machine initialised "
                    f"cooldown={state_machine.cooldown_ms}ms "
                    f"ttl={state_machine.data_ttl_ms}ms "
                    f"auto_log_delay={state_machine._auto_log_delay_s}s")
        # ── MQTT client for scale weight data ─────────────────────
        try:
            from core.mqtt_client import ScaleMqttClient
            mqtt_client = ScaleMqttClient(state_machine=state_machine)
            if mqtt_client.connect():
                logger.info("[CrateSM] MQTT scale client connected")
            else:
                logger.warning("[CrateSM] MQTT scale client failed to connect — "
                              "weight data will not be available")
        except Exception as e:
            logger.warning(f"[CrateSM] MQTT client init failed: {e}")

    # ── live-view throttle ──────────────────────────────────────────
    live_view_fps = getattr(settings, "LIVE_VIEW_FPS", 15)

    def capture_loop():
        """Fast capture thread — drains stale frames, runs YOLO, broadcasts annotated frames."""
        last_broadcast = 0.0
        broadcast_interval = 1.0 / max(live_view_fps, 1)
        frame_idx = 0

        while not stop_event.is_set():
            try:
                capture = get_webcam_capture()
                if not capture or not capture.isOpened():
                    time.sleep(0.1)
                    continue

                # Drain stale frames from OpenCV's internal buffer
                for _ in range(3):
                    capture.grab()

                ret, frame = capture.read()
                if not ret or frame is None:
                    time.sleep(0.005)
                    continue

                now = time.time()
                frame_idx += 1

                # Store raw frame for the OCR thread
                with latest_frame_lock:
                    latest_frame["data"] = frame
                    latest_frame["timestamp"] = now

                # ── YOLO detection (every frame for live overlay) ─────
                detections = yolo_detector.detect(frame)

                # Store detections for the OCR thread
                with latest_detections_lock:
                    latest_detections["data"] = detections
                    latest_detections["timestamp"] = now

                # ── feed detections to crate state machine ──────────────
                if state_machine:
                    state_machine.on_yolo_detection(
                        detections, "", 0.0
                    )

                # ── draw detections on the broadcast frame ────────────
                display_frame = yolo_detector.draw_detections(frame, detections)

                # Broadcast for live view (throttled)
                if now - last_broadcast >= broadcast_interval:
                    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 60]
                    _, jpeg = cv2.imencode('.jpg', display_frame, encode_params)
                    jpeg_bytes = jpeg.tobytes()
                    frame_b64 = base64.b64encode(jpeg_bytes).decode('utf-8')

                    # Push to MJPEG shared buffer (zero re-encode, zero camera contention)
                    from api.webcam import update_shared_frame
                    update_shared_frame(jpeg_bytes)

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
                    # SSE broadcast (thread-safe, no event loop needed)
                    sse_manager.broadcast({
                        "type": "webcam_frame",
                        "payload": {
                            "frame_data": frame_b64,
                            "timestamp": now,
                        },
                    })
                    last_broadcast = now

                # ── broadcast YOLO detections at lower rate (every other frame) ──
                if frame_idx % 2 == 0:
                    yolo_msg = {
                        "type": "yolo_detections",
                        "payload": {
                            "hands_present": detections["hands_present"],
                            "box_present": detections["box_present"],
                            "primary_box": detections["primary_box"],
                            "hands": detections["hands"],
                            "boxes": detections["boxes"],
                            "hand_count": len(detections["hands"]),
                            "box_count": len(detections["boxes"]),
                            "total_detections": detections["total_detections"],
                            "inference_ms": detections["inference_ms"],
                            "timestamp": now,
                            "frame_width": 640,
                            "frame_height": 480,
                        },
                    }
                    asyncio.run_coroutine_threadsafe(
                        manager.broadcast(yolo_msg), loop,
                    )
                    sse_manager.broadcast(yolo_msg)

            except Exception as e:
                logger.error(f"Capture thread error: {e}")
                time.sleep(0.1)

    def ocr_loop():
        """OCR thread — grabs latest YOLO detections, crops to box, runs OCR."""
        frame_counter = 0
        error_counter = 0
        yolo_error_counter = 0
        ocr_start_time = time.time()
        prev_text_hash = None

        while not stop_event.is_set():
            try:
                t_start = time.time()

                # Grab the latest frame and YOLO detections
                with latest_frame_lock:
                    frame = latest_frame["data"]
                    frame_ts = latest_frame["timestamp"]

                with latest_detections_lock:
                    detections = latest_detections["data"]

                if frame is None:
                    time.sleep(0.1)
                    continue

                frame_counter += 1

                # ── fast-change detection ──
                small = cv2.resize(frame, (32, 32))
                gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
                frame_hash = hash(gray.tobytes())

                if frame_hash == prev_text_hash and prev_text_hash is not None:
                    elapsed = time.time() - t_start
                    time.sleep(max(0, settings.OCR_INTERVAL_SECONDS - elapsed))
                    continue

                prev_text_hash = frame_hash

                # ── decide what to OCR ────────────────────────────────
                ocr_frame = None
                crop_source = "full_frame"   # default
                hands_suppressed = False

                if detections is not None and detections.get("hands_present"):
                    # Safety: hands detected in frame — suppress OCR
                    hands_suppressed = True
                    logger.debug(
                        f"OCR frame #{frame_counter}: HANDS DETECTED — OCR suppressed (safety)"
                    )

                if not hands_suppressed and detections is not None and detections.get("primary_box"):
                    # Crop to the primary box region for focused OCR
                    primary = detections["primary_box"]
                    cropped = yolo_detector.crop_to_box(frame, primary["bbox"], padding=5)
                    if cropped is not None and cropped.size > 0:
                        ocr_frame = cropped
                        crop_source = "yolo_box"

                if ocr_frame is None:
                    # Fallback: full-frame OCR (resized)
                    ocr_w = getattr(settings, "OCR_RESIZE_WIDTH", 320)
                    ocr_h = getattr(settings, "OCR_RESIZE_HEIGHT", 240)
                    ocr_frame = cv2.resize(frame, (ocr_w, ocr_h))

                # ── encode for OCR ────────────────────────────────────
                _, jpeg = cv2.imencode('.jpg', ocr_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                frame_b64 = base64.b64encode(jpeg.tobytes()).decode('utf-8')

                # ── OCR (if not suppressed) ───────────────────────────
                if hands_suppressed:
                    ocr_raw = {"text": "", "confidence": 0.0, "bbox_data": None}
                    text = ""
                else:
                    ocr_raw = ocr_engine.process_image(frame_b64)
                    text = ocr_raw.get("text", "")

                # ── dedup ──
                is_dup, sim_score = dedup.check_duplicate(text, session_id)
                if not is_dup and text:
                    dedup.add_to_history(text, session_id)

                processing_ms = int((time.time() - t_start) * 1000)
                yolo_ms = detections.get("inference_ms", 0) if detections else 0

                # ── crate state machine: feed OCR result ──────────────
                sm_result = None
                if state_machine and not hands_suppressed and text:
                    h, w = frame.shape[:2]
                    sm_result = state_machine.on_yolo_detection(
                        detections or {}, text,
                        ocr_raw.get("confidence", 0.0), w,
                    )

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

                # ── broadcast OCR result (with YOLO context) ──────────
                ocr_payload = {
                    "type": "ocr_result",
                    "payload": {
                        "text": text,
                        "confidence": ocr_raw.get("confidence", 0.0),
                        "bbox_data": ocr_raw.get("bbox_data"),
                        "processing_time_ms": processing_ms,
                        "is_duplicate": is_dup,
                        "similarity_score": sim_score,
                        "frame_number": frame_counter,
                        "crop_source": crop_source,
                        "hands_suppressed": hands_suppressed,
                        "yolo_inference_ms": yolo_ms,
                    },
                }
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast(ocr_payload), loop,
                )
                sse_manager.broadcast(ocr_payload)

                # ── record metrics ──
                try:
                    session_manager.record_metric(session_id, "processing_time_ms", processing_ms)
                    session_manager.record_metric(session_id, "fps", 1000.0 / max(processing_ms, 1))
                    if not hands_suppressed:
                        session_manager.record_metric(session_id, "yolo_inference_ms", yolo_ms)
                except Exception:
                    pass

                # ── broadcast pipeline status (with YOLO metrics) ─────
                status_payload = {
                    "type": "pipeline_status",
                    "payload": {
                        "pipeline_state": "running",
                        "fps": 1000.0 / max(processing_ms, 1),
                        "processing_time_ms": processing_ms,
                        "ocr_count": frame_counter,
                        "error_count": error_counter,
                        "yolo_error_count": yolo_error_counter,
                        "uptime_seconds": int(time.time() - ocr_start_time),
                        "total_processed": frame_counter,
                        "yolo_enabled": yolo_detector.is_ready,
                        "yolo_inference_ms": yolo_ms,
                        "crop_source": crop_source,
                        "hands_suppressed": hands_suppressed,
                        "crate_state": state_machine.get_state() if state_machine else None,
                        "sm_log_result": sm_result,
                    },
                }
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast(status_payload), loop,
                )
                sse_manager.broadcast(status_payload)

                # ── broadcast standalone crate_state (frontend listens for this) ──
                if state_machine:
                    sm_snap = state_machine.get_state()
                    crate_payload = {
                        "type": "crate_state",
                        "payload": sm_snap,
                    }
                    sse_manager.broadcast(crate_payload)
                    asyncio.run_coroutine_threadsafe(
                        manager.broadcast(crate_payload), loop,
                    )

                if hands_suppressed:
                    logger.info(
                        f"OCR frame #{frame_counter}: SAFETY — hands detected, OCR suppressed "
                        f"({processing_ms}ms)"
                    )
                else:
                    logger.info(
                        f"OCR frame #{frame_counter}: '{text[:60]}' "
                        f"conf={ocr_raw.get('confidence', 0):.2f} "
                        f"dup={is_dup} crop={crop_source} "
                        f"{processing_ms}ms (YOLO {yolo_ms:.0f}ms)"
                    )

                # ── sleep for OCR interval ──
                elapsed = time.time() - t_start
                time.sleep(max(0, settings.OCR_INTERVAL_SECONDS - elapsed))

            except Exception as e:
                error_counter += 1
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

    # ── release webcam hardware ────────────────────────────────────
    # Even if threads timed out (stuck in DirectShow read), this
    # releases through the global ref — idempotent and safe.
    try:
        from api.webcam import release_webcam_hardware
        release_webcam_hardware()
    except Exception as e:
        logger.warning(f"Webcam release in worker shutdown failed: {e}")

    # Reset state machine + disconnect MQTT
    if mqtt_client:
        try:
            mqtt_client.disconnect()
        except Exception:
            pass
    if state_machine:
        try:
            state_machine.reset()
        except Exception:
            pass

    # Clear the module-level reference so manual-log endpoint returns 503
    _active_state_machine = None

    logger.info(f"Pipeline worker stopped for session {session_id}")
