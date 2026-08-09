"""
Configuration management for OCR Pipeline Backend
Loads settings from environment variables with validation
"""

from pydantic_settings import BaseSettings
from pydantic import validator
from typing import Optional
import os
import uuid


class Settings(BaseSettings):
    """Application settings with validation"""
    
    # Webcam Configuration
    WEBCAM_DEVICE_INDEX: int = 0
    WEBCAM_WIDTH: int = 640
    WEBCAM_HEIGHT: int = 480
    WEBCAM_FPS: int = 30
    
    # OCR Configuration
    OCR_INTERVAL_SECONDS: float = 1.0
    OCR_ENGINE: str = "easyocr"
    GPU_ENABLED: str = "auto"
    CONFIDENCE_THRESHOLD: float = 0.5
    
    # Deduplication Configuration
    DEDUP_SIMILARITY_THRESHOLD: float = 0.85
    DEDUP_MAX_HISTORY: int = 10
    DEDUP_STRATEGY: str = "fuzzy"
    
    # Database Configuration
    DATABASE_URL: str = "postgresql://postgres:123456@localhost:5432/ocr_pipeline"
    
    # Server Configuration
    WEBSOCKET_PORT: int = 8000
    WEBSOCKET_HOST: str = "127.0.0.1"  # More secure default
    
    # YOLO Object Detection Configuration
    YOLO_WEIGHTS_PATH: str = "weights/best.pt"
    YOLO_CONFIDENCE_THRESHOLD: float = 0.35
    YOLO_IMAGE_SIZE: int = 640
    YOLO_ENABLED: str = "true"

    # Live View (decoupled from OCR)
    LIVE_VIEW_FPS: int = 15
    OCR_RESIZE_WIDTH: int = 320
    OCR_RESIZE_HEIGHT: int = 240

    # Performance Logging
    ENABLE_PERFORMANCE_LOGGING: bool = True
    LOG_INTERVAL_SECONDS: float = 10.0
    
    # Crate State Machine Configuration
    CRATE_STATE_MACHINE_ENABLED: bool = True
    CRATE_LOG_COOLDOWN_MS: int = 3000
    CRATE_DATA_TTL_MS: int = 10000
    CRATE_AUTO_LOG_DELAY_SECONDS: int = 5
    EXPRESS_API_URL: str = "http://localhost:3001"
    EXPRESS_API_TOKEN: str = ""

    # MQTT (Python client for scale weight data)
    MQTT_BROKER_URL: str = "mqtt://localhost:1883"
    MQTT_CLIENT_ID: str = "python-ocr-backend"

    # Pipeline Idle Auto-Stop (0 = never)
    PIPELINE_IDLE_STOP_SECONDS: int = 0

    # Session Configuration
    SESSION_ID: Optional[str] = "5fe93ffb-6559-44a2-9d07-682107e3975b"
    
    @validator('WEBCAM_DEVICE_INDEX')
    def validate_webcam_device_index(cls, v):
        if v < 0:
            raise ValueError('Webcam device index must be non-negative')
        if v > 10:
            raise ValueError('Webcam device index seems too high')
        return v
    
    @validator('WEBCAM_WIDTH', 'WEBCAM_HEIGHT')
    def validate_webcam_dimensions(cls, v):
        if v <= 0:
            raise ValueError('Webcam dimensions must be positive')
        if v > 3840:
            raise ValueError('Webcam dimensions too large')
        return v
    
    @validator('WEBCAM_FPS')
    def validate_webcam_fps(cls, v):
        if v <= 0:
            raise ValueError('Webcam FPS must be positive')
        if v > 120:
            raise ValueError('Webcam FPS too high')
        return v
    
    @validator('OCR_INTERVAL_SECONDS')
    def validate_ocr_interval(cls, v):
        if v <= 0:
            raise ValueError('OCR interval must be positive')
        if v > 60:
            raise ValueError('OCR interval cannot exceed 60 seconds')
        return v
    
    @validator('OCR_ENGINE')
    def validate_ocr_engine(cls, v):
        valid_engines = ['easyocr']
        if v not in valid_engines:
            raise ValueError(f'OCR engine must be one of {valid_engines}')
        return v
    
    @validator('GPU_ENABLED')
    def validate_gpu_enabled(cls, v):
        valid_options = ['auto', 'true', 'false']
        if v.lower() not in valid_options:
            raise ValueError(f'GPU enabled must be one of {valid_options}')
        return v.lower()
    
    @validator('CONFIDENCE_THRESHOLD', 'DEDUP_SIMILARITY_THRESHOLD')
    def validate_thresholds(cls, v):
        if not 0 <= v <= 1:
            raise ValueError('Threshold must be between 0 and 1')
        return v
    
    @validator('DEDUP_MAX_HISTORY')
    def validate_dedup_max_history(cls, v):
        if v <= 0:
            raise ValueError('Deduplication max history must be positive')
        if v > 1000:
            raise ValueError('Deduplication max history too large')
        return v
    
    @validator('DEDUP_STRATEGY')
    def validate_dedup_strategy(cls, v):
        valid_strategies = ['fuzzy', 'exact', 'semantic']
        if v not in valid_strategies:
            raise ValueError(f'Deduplication strategy must be one of {valid_strategies}')
        return v
    
    @validator('DATABASE_URL')
    def validate_database_url(cls, v):
        # Only warn about default passwords in development
        if 'changeme' in v:
            import warnings
            warnings.warn('Using default database password. Please change for production.')
        if not v.startswith(('postgresql://', 'postgres://')):
            raise ValueError('Database URL must use postgresql:// scheme')
        return v
    
    @validator('WEBSOCKET_PORT')
    def validate_websocket_port(cls, v):
        if v < 1024:
            raise ValueError('WebSocket port must be >= 1024')
        if v > 65535:
            raise ValueError('WebSocket port must be <= 65535')
        return v
    
    @validator('WEBSOCKET_HOST')
    def validate_websocket_host(cls, v):
        if v == '0.0.0.0':
            import warnings
            warnings.warn('Binding to 0.0.0.0 exposes the server to all network interfaces')
        return v
    
    @validator('LIVE_VIEW_FPS')
    def validate_live_view_fps(cls, v):
        if v <= 0:
            raise ValueError('Live view FPS must be positive')
        if v > 60:
            raise ValueError('Live view FPS cannot exceed 60')
        return v

    @validator('OCR_RESIZE_WIDTH', 'OCR_RESIZE_HEIGHT')
    def validate_ocr_resize_dims(cls, v):
        if v <= 0:
            raise ValueError('OCR resize dimensions must be positive')
        if v > 1920:
            raise ValueError('OCR resize dimensions too large')
        return v

    @validator('LOG_INTERVAL_SECONDS')
    def validate_log_interval(cls, v):
        if v <= 0:
            raise ValueError('Log interval must be positive')
        if v > 3600:
            raise ValueError('Log interval cannot exceed 1 hour')
        return v

    @validator('YOLO_WEIGHTS_PATH')
    def validate_yolo_weights_path(cls, v):
        if not v:
            raise ValueError('YOLO weights path must not be empty')
        return v

    @validator('YOLO_CONFIDENCE_THRESHOLD')
    def validate_yolo_confidence(cls, v):
        if not 0 <= v <= 1:
            raise ValueError('YOLO confidence threshold must be between 0 and 1')
        return v

    @validator('YOLO_IMAGE_SIZE')
    def validate_yolo_image_size(cls, v):
        if v not in (320, 480, 640, 800, 960, 1280):
            raise ValueError(f'YOLO image size must be a valid YOLOv8 size (320-1280, multiples of 32)')
        return v

    @validator('YOLO_ENABLED')
    def validate_yolo_enabled(cls, v):
        if v.lower() not in ('true', 'false', 'auto'):
            raise ValueError('YOLO_ENABLED must be true, false, or auto')
        return v.lower()

    @validator('CRATE_LOG_COOLDOWN_MS')
    def validate_crate_cooldown(cls, v):
        if v < 0:
            raise ValueError('Crate log cooldown must be non-negative')
        if v > 60000:
            raise ValueError('Crate log cooldown cannot exceed 60 seconds')
        return v

    @validator('CRATE_DATA_TTL_MS')
    def validate_crate_ttl(cls, v):
        if v < 1000:
            raise ValueError('Crate data TTL must be at least 1000ms')
        if v > 60000:
            raise ValueError('Crate data TTL cannot exceed 60 seconds')
        return v

    @validator('CRATE_AUTO_LOG_DELAY_SECONDS')
    def validate_auto_log_delay(cls, v):
        if not 1 <= v <= 30:
            raise ValueError('Auto-log delay must be between 1 and 30 seconds')
        return v

    @validator('PIPELINE_IDLE_STOP_SECONDS')
    def validate_idle_stop(cls, v):
        if v < 0:
            raise ValueError('Pipeline idle stop seconds must be non-negative')
        return v
    
    class Config:
        env_file = ".env.backend"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


# Create settings instance
try:
    settings = Settings()
except Exception as e:
    print(f"Configuration error: {e}")
    print("Please check your .env.backend file")
    raise
