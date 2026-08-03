"""
Webcam API endpoints
Handles webcam capture and frame processing
Supports both USB webcams and IP camera streams
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, validator
from typing import Optional
import cv2
import base64
import numpy as np
import time
import threading

from utils.config import settings
from utils.logger import setup_logger
from utils.api_helpers import handle_api_error, APIResponse

router = APIRouter()
logger = setup_logger(__name__)


class WebcamConfig(BaseModel):
    """Webcam configuration model"""
    device_index: int = 0
    width: int = 640
    height: int = 480
    fps: int = 30
    ip_camera_url: Optional[str] = None  # For IP camera streaming
    
    @validator('device_index')
    def validate_device_index(cls, v):
        if v < 0:
            raise ValueError('Device index must be non-negative')
        if v > 10:
            raise ValueError('Device index seems too high')
        return v
    
    @validator('width')
    def validate_width(cls, v):
        if v <= 0:
            raise ValueError('Width must be positive')
        if v > 3840:
            raise ValueError('Width cannot exceed 3840')
        return v
    
    @validator('height')
    def validate_height(cls, v):
        if v <= 0:
            raise ValueError('Height must be positive')
        if v > 2160:
            raise ValueError('Height cannot exceed 2160')
        return v
    
    @validator('fps')
    def validate_fps(cls, v):
        if v <= 0:
            raise ValueError('FPS must be positive')
        if v > 120:
            raise ValueError('FPS cannot exceed 120')
        return v
    
    @validator('ip_camera_url')
    def validate_ip_camera_url(cls, v):
        if v:
            if not (v.startswith('http://') or v.startswith('rtsp://')):
                raise ValueError('IP camera URL must start with http:// or rtsp://')
        return v


class FrameResponse(BaseModel):
    """Frame response model"""
    frame_data: str
    timestamp: float
    width: int
    height: int


# Global webcam capture object
webcam_capture = None
ip_camera_url = None


def get_webcam_capture(camera_url: Optional[str] = None):
    """Get or create webcam capture object with low-latency settings."""
    global webcam_capture, ip_camera_url

    # If IP camera URL is provided, use it
    if camera_url:
        if ip_camera_url != camera_url or webcam_capture is None or not webcam_capture.isOpened():
            if webcam_capture and webcam_capture.isOpened():
                webcam_capture.release()
            ip_camera_url = camera_url
            # Use different backend for IP cameras
            webcam_capture = cv2.VideoCapture(camera_url, cv2.CAP_FFMPEG)
            if not webcam_capture.isOpened():
                raise RuntimeError(f"Failed to open IP camera stream: {camera_url}")
            # Low-latency settings for IP cameras
            webcam_capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            logger.info(f"IP camera connected: {camera_url}")
    else:
        # Use USB webcam with specific backend
        if webcam_capture is None or not webcam_capture.isOpened():
            # Try DirectShow backend first for lower latency on Windows
            backend = cv2.CAP_DSHOW
            webcam_capture = cv2.VideoCapture(settings.WEBCAM_DEVICE_INDEX, backend)
            if not webcam_capture.isOpened():
                # Fallback to default backend
                webcam_capture = cv2.VideoCapture(settings.WEBCAM_DEVICE_INDEX)
                if not webcam_capture.isOpened():
                    raise RuntimeError(f"Failed to open webcam device {settings.WEBCAM_DEVICE_INDEX}")

            # ── Low-latency camera configuration ──────────────────────
            # Resolution
            webcam_capture.set(cv2.CAP_PROP_FRAME_WIDTH, settings.WEBCAM_WIDTH)
            webcam_capture.set(cv2.CAP_PROP_FRAME_HEIGHT, settings.WEBCAM_HEIGHT)
            webcam_capture.set(cv2.CAP_PROP_FPS, settings.WEBCAM_FPS)

            # Minimise internal buffer to 1 frame (eliminates stale-frame lag)
            webcam_capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            # Use MJPG codec if available (lower CPU, lower latency than raw YUV)
            # Fall back silently if the camera doesn't support it.
            mjpg = cv2.VideoWriter_fourcc(*'MJPG')
            webcam_capture.set(cv2.CAP_PROP_FOURCC, mjpg)

            # Disable auto-focus only (keeps auto-exposure for proper brightness)
            webcam_capture.set(cv2.CAP_PROP_AUTOFOCUS, 0)

            actual_w = webcam_capture.get(cv2.CAP_PROP_FRAME_WIDTH)
            actual_h = webcam_capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
            actual_fps = webcam_capture.get(cv2.CAP_PROP_FPS)
            actual_fourcc = int(webcam_capture.get(cv2.CAP_PROP_FOURCC))
            fourcc_str = "".join(chr((actual_fourcc >> (8 * i)) & 0xFF) for i in range(4))

            logger.info(
                f"USB webcam connected: device {settings.WEBCAM_DEVICE_INDEX} "
                f"{actual_w:.0f}x{actual_h:.0f} @ {actual_fps:.0f}fps "
                f"codec={fourcc_str} bufsize=1"
            )

    return webcam_capture


@router.post("/start", response_model=dict)
async def start_webcam(config: Optional[WebcamConfig] = None):
    """Start webcam capture"""
    try:
        global webcam_capture
        
        # Update settings if config provided
        if config:
            settings.WEBCAM_DEVICE_INDEX = config.device_index
            settings.WEBCAM_WIDTH = config.width
            settings.WEBCAM_HEIGHT = config.height
            settings.WEBCAM_FPS = config.fps
        
        # Initialize webcam (USB or IP camera)
        camera_url = config.ip_camera_url if config else None
        capture = get_webcam_capture(camera_url)
        
        if not capture.isOpened():
            raise HTTPException(status_code=500, detail="Failed to open webcam")
        
        camera_type = "IP camera" if camera_url else f"USB webcam device {settings.WEBCAM_DEVICE_INDEX}"
        logger.info(f"Webcam started: {camera_type}")
        
        return APIResponse.success(data={
            "device_index": settings.WEBCAM_DEVICE_INDEX,
            "width": settings.WEBCAM_WIDTH,
            "height": settings.WEBCAM_HEIGHT,
            "fps": settings.WEBCAM_FPS,
            "camera_type": "ip_camera" if camera_url else "usb_webcam",
            "camera_url": camera_url
        }, message="Webcam started successfully")
    except Exception as e:
        handle_api_error(e, "start_webcam")


@router.post("/stop", response_model=dict)
async def stop_webcam():
    """Stop webcam capture"""
    try:
        global webcam_capture, ip_camera_url
        
        if webcam_capture:
            logger.info("Releasing webcam hardware...")
            
            # Set all properties to default before release
            try:
                webcam_capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                webcam_capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                webcam_capture.set(cv2.CAP_PROP_FPS, 30)
            except:
                pass
            
            # Try multiple release methods
            for i in range(5):
                try:
                    webcam_capture.release()
                    logger.info(f"Release attempt {i+1} completed")
                except:
                    pass
            
            # Delete the object entirely
            del webcam_capture
            webcam_capture = None
            ip_camera_url = None
            
            # Force garbage collection multiple times
            import gc
            for _ in range(5):
                gc.collect()
            
            # Additional delay to ensure hardware release
            import time
            time.sleep(2.0)
        
        logger.info("Webcam stopped and hardware released")
        
        return APIResponse.success(message="Webcam stopped successfully")
    except Exception as e:
        logger.error(f"Error stopping webcam: {e}")
        # Force cleanup even on error
        webcam_capture = None
        ip_camera_url = None
        return APIResponse.success(message="Webcam stopped (force cleanup)")


@router.get("/frame", response_model=FrameResponse)
async def get_frame():
    """Capture single frame from webcam"""
    try:
        capture = get_webcam_capture()
        
        if not capture.isOpened():
            raise HTTPException(status_code=500, detail="Webcam not started")
        
        # Read frame
        ret, frame = capture.read()
        
        if not ret:
            raise HTTPException(status_code=500, detail="Failed to capture frame")
        
        # Encode frame to JPEG
        _, buffer = cv2.imencode('.jpg', frame)
        frame_data = base64.b64encode(buffer).decode('utf-8')
        
        return FrameResponse(
            frame_data=frame_data,
            timestamp=time.time(),
            width=settings.WEBCAM_WIDTH,
            height=settings.WEBCAM_HEIGHT
        )
    except Exception as e:
        handle_api_error(e, "get_frame")


@router.get("/status", response_model=dict)
async def get_webcam_status():
    """Get webcam status"""
    try:
        global webcam_capture

        is_running = webcam_capture is not None and webcam_capture.isOpened()

        return APIResponse.success(data={
            "is_running": is_running,
            "device_index": settings.WEBCAM_DEVICE_INDEX if is_running else None,
            "width": settings.WEBCAM_WIDTH if is_running else None,
            "height": settings.WEBCAM_HEIGHT if is_running else None,
            "fps": settings.WEBCAM_FPS if is_running else None
        })
    except Exception as e:
        handle_api_error(e, "get_webcam_status")


@router.get("/stream")
def stream_mjpeg():
    """
    MJPEG streaming endpoint for low-latency live preview.

    Use as: <img src="http://localhost:8000/api/webcam/stream" />
    Eliminates the HTTP-polling round-trip latency of /api/webcam/frame.
    """
    def generate_frames():
        while True:
            try:
                capture = get_webcam_capture()
                if not capture or not capture.isOpened():
                    time.sleep(0.1)
                    continue

                # Drain stale buffer frames for lowest latency
                for _ in range(2):
                    capture.grab()

                ret, frame = capture.read()
                if not ret or frame is None:
                    time.sleep(0.01)
                    continue

                # Lower JPEG quality = smaller frames = lower latency
                encode_params = [cv2.IMWRITE_JPEG_QUALITY, 55]
                _, jpeg = cv2.imencode('.jpg', frame, encode_params)

                yield (
                    b'--frame\r\n'
                    b'Content-Type: image/jpeg\r\n\r\n'
                    + jpeg.tobytes()
                    + b'\r\n'
                )

            except Exception as e:
                logger.error(f"MJPEG stream error: {e}")
                time.sleep(0.1)

    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
