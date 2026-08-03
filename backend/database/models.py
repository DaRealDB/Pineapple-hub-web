"""
Database Models - SQLAlchemy ORM models for PostgreSQL
"""

from sqlalchemy import Column, Integer, String, DECIMAL, Boolean, DateTime, JSON, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class Device(Base):
    """Device model for scales and webcams"""
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), unique=True, nullable=False, index=True)
    label = Column(String(100), nullable=False)
    type = Column(String(20), nullable=False)  # 'scale', 'webcam', 'processor'
    location = Column(String(100))
    status = Column(String(20), nullable=False, default='offline')
    last_seen = Column(DateTime)
    device_metadata = Column('metadata', JSON)  # Renamed to avoid SQLAlchemy conflict
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Session(Base):
    """Session model for OCR pipeline operations"""
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), unique=True, nullable=False, index=True)
    device_id = Column(String(50))  # Plain column, no FK — device may not exist yet
    start_time = Column(DateTime, nullable=False, default=datetime.utcnow)
    end_time = Column(DateTime)
    status = Column(String(20), nullable=False, default='active')
    config = Column(JSON, nullable=False, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    ocr_results = relationship("OCRResult", back_populates="session")
    pipeline_metrics = relationship("PipelineMetric", back_populates="session")


class WeightReading(Base):
    """Weight reading model from scales"""
    __tablename__ = "weight_readings"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    weight_g = Column(DECIMAL(10, 2), nullable=False)
    grade = Column(String(20), nullable=False)
    status = Column(JSON, nullable=False, default={})
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class OCRResult(Base):
    """OCR result model"""
    __tablename__ = "ocr_results"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    confidence = Column(DECIMAL(5, 4), nullable=False, index=True)
    bbox_data = Column(JSON)
    processing_time_ms = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    is_duplicate = Column(Boolean, default=False, index=True)
    similarity_score = Column(DECIMAL(5, 4))
    frame_number = Column(Integer)
    verified_by = Column(String(50))
    verification_status = Column(String(20), default='pending', index=True)
    
    # Relationships
    session = relationship("Session", back_populates="ocr_results")


class ConnectionLog(Base):
    """Connection event log model"""
    __tablename__ = "connection_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), nullable=False, index=True)
    event_type = Column(String(20), nullable=False, index=True)
    status = Column(String(20), nullable=False)
    log_metadata = Column('metadata', JSON)  # Renamed to avoid SQLAlchemy conflict
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PipelineMetric(Base):
    """Pipeline performance metric model"""
    __tablename__ = "pipeline_metrics"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False, index=True)
    metric_type = Column(String(50), nullable=False, index=True)
    metric_value = Column(DECIMAL(15, 6), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    metric_metadata = Column('metadata', JSON)  # Renamed to avoid SQLAlchemy conflict
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    session = relationship("Session", back_populates="pipeline_metrics")


class DedupHistory(Base):
    """Deduplication history model"""
    __tablename__ = "dedup_history"

    id = Column(Integer, primary_key=True, index=True)
    ocr_result_id = Column(Integer, ForeignKey("ocr_results.id"), nullable=False, index=True)
    original_id = Column(Integer, ForeignKey("ocr_results.id"))
    similar_ids = Column(JSON)  # Array of similar result IDs
    similarity = Column(DECIMAL(5, 4), nullable=False, index=True)
    strategy = Column(String(20), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class WebcamFrame(Base):
    """Webcam frame capture model"""
    __tablename__ = "webcam_frames"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False, index=True)
    frame_data = Column(Text)  # Base64 encoded or binary data
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    processing_ms = Column(Integer)
    ocr_result_id = Column(Integer, ForeignKey("ocr_results.id"), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class OperationsLog(Base):
    """Comprehensive operations audit log model"""
    __tablename__ = "operations_log"
    
    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(50), index=True)
    device_id = Column(String(50), ForeignKey("devices.device_id"), index=True)
    weight_g = Column(DECIMAL(10, 2))
    grade = Column(String(20))
    ocr_text = Column(Text)
    ocr_confidence = Column(DECIMAL(5, 4))
    audit_status = Column(String(20), default='pending', index=True)
    user_id = Column(String(50))
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    ops_metadata = Column('metadata', JSON)  # Renamed to avoid SQLAlchemy conflict
    created_at = Column(DateTime, default=datetime.utcnow)


class ExportHistory(Base):
    """Export and report generation history model"""
    __tablename__ = "export_history"
    
    id = Column(Integer, primary_key=True, index=True)
    export_type = Column(String(20), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    file_path = Column(Text)
    format = Column(String(10), nullable=False)
    generated_by = Column(String(50), nullable=False, index=True)
    date_range_start = Column(DateTime)
    date_range_end = Column(DateTime)
    record_count = Column(Integer)
    file_size_bytes = Column(Integer)
    status = Column(String(20), default='completed')
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
