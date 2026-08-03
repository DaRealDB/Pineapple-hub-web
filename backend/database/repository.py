"""
Database Repository - Handles database operations using SQLAlchemy
"""

from sqlalchemy import create_engine, desc
from sqlalchemy.orm import sessionmaker, Session as DBSession
from typing import Optional, List, Dict
from datetime import datetime
import csv
import io
import json

from database.models import Base, Session as SessionModel, OCRResult, PipelineMetric
from utils.config import settings
from utils.logger import setup_logger

logger = setup_logger(__name__)

# Create engine with connection pooling
try:
    engine = create_engine(
        settings.DATABASE_URL,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    # Create tables (only if database is available)
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.warning(f"Could not create database tables: {e}")
        logger.warning("Running in development mode without database")
        
except Exception as e:
    logger.warning(f"Database connection failed: {e}")
    logger.warning("Running in development mode without database")
    engine = None
    SessionLocal = None


class DatabaseRepository:
    """Base repository class"""
    
    def __init__(self):
        if SessionLocal:
            self.db: DBSession = SessionLocal()
        else:
            self.db = None
            logger.warning("Database not available - running in development mode")
    
    def __del__(self):
        if hasattr(self, 'db') and self.db:
            self.db.close()
    
    def commit(self):
        """Commit transaction"""
        if not self.db:
            logger.warning("Cannot commit - no database connection")
            return
        try:
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Database commit error: {e}")
            raise


class SessionRepository(DatabaseRepository):
    """Repository for session operations"""
    
    def create_session(self, session_id: str, device_id: str, config: Dict) -> Dict:
        """Create a new session"""
        if not self.db:
            logger.warning("Cannot create session - no database connection")
            return {
                "id": 0,
                "session_id": session_id,
                "device_id": device_id,
                "config": config,
                "status": "active"
            }
        
        session = SessionModel(
            session_id=session_id,
            device_id=device_id,
            config=config,
            status='active'
        )
        self.db.add(session)
        self.commit()
        self.db.refresh(session)
        
        return {
            "id": session.id,
            "session_id": session.session_id,
            "device_id": session.device_id,
            "config": session.config,
            "status": session.status
        }
    
    def end_session(self, session_id: str):
        """End a session"""
        if not self.db:
            logger.warning("Cannot end session - no database connection")
            return
        
        session = self.db.query(SessionModel).filter(
            SessionModel.session_id == session_id
        ).first()
        
        if session:
            session.status = 'completed'
            session.end_time = datetime.utcnow()
            self.commit()
    
    def update_session_config(self, session_id: str, config: Dict):
        """Update session configuration"""
        if not self.db:
            logger.warning("Cannot update session config - no database connection")
            return
        
        session = self.db.query(SessionModel).filter(
            SessionModel.session_id == session_id
        ).first()
        
        if session:
            session.config = config
            session.updated_at = datetime.utcnow()
            self.commit()
    
    def record_metric(self, session_id: str, metric_type: str, value: float):
        """Record a performance metric"""
        if not self.db:
            logger.warning("Cannot record metric - no database connection")
            return
        
        session = self.db.query(SessionModel).filter(
            SessionModel.session_id == session_id
        ).first()
        
        if session:
            metric = PipelineMetric(
                session_id=session.id,
                metric_type=metric_type,
                metric_value=value
            )
            self.db.add(metric)
            self.commit()
    
    def get_metrics(self, session_id: Optional[str] = None, metric_type: Optional[str] = None, limit: int = 100) -> Dict:
        """Get metrics for sessions"""
        if not self.db:
            logger.warning("Cannot get metrics - no database connection")
            return {"metrics": [], "count": 0}
        
        query = self.db.query(PipelineMetric)
        
        if session_id:
            session = self.db.query(SessionModel).filter(SessionModel.session_id == session_id).first()
            if session:
                query = query.filter(PipelineMetric.session_id == session.id)
        
        if metric_type:
            query = query.filter(PipelineMetric.metric_type == metric_type)
        
        metrics = query.order_by(desc(PipelineMetric.timestamp)).limit(limit).all()
        
        return {
            "metrics": [
                {
                    "id": m.id,
                    "session_id": m.session_id,
                    "metric_type": m.metric_type,
                    "metric_value": float(m.metric_value),
                    "timestamp": m.timestamp.isoformat()
                }
                for m in metrics
            ],
            "count": len(metrics)
        }


class OCRRepository(DatabaseRepository):
    """Repository for OCR operations"""
    
    def create_ocr_result(
        self,
        session_id: str,
        text: str,
        confidence: float,
        bbox_data: Optional[Dict] = None,
        processing_time_ms: Optional[int] = None,
        is_duplicate: bool = False,
        similarity_score: Optional[float] = None
    ) -> Dict:
        """Create an OCR result"""
        # Get session DB ID
        session = self.db.query(SessionModel).filter(SessionModel.session_id == session_id).first()
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        # Sanitize text input
        sanitized_text = text[:10000] if text else ""  # Limit text length
        
        ocr_result = OCRResult(
            session_id=session.id,
            text=sanitized_text,
            confidence=confidence,
            bbox_data=bbox_data,
            processing_time_ms=processing_time_ms,
            is_duplicate=is_duplicate,
            similarity_score=similarity_score
        )
        self.db.add(ocr_result)
        self.commit()
        self.db.refresh(ocr_result)
        
        return {
            "id": ocr_result.id,
            "text": ocr_result.text,
            "confidence": float(ocr_result.confidence),
            "bbox_data": ocr_result.bbox_data,
            "processing_time_ms": ocr_result.processing_time_ms,
            "is_duplicate": ocr_result.is_duplicate,
            "similarity_score": float(ocr_result.similarity_score) if ocr_result.similarity_score else None,
            "created_at": ocr_result.created_at
        }
    
    def get_ocr_results(
        self,
        limit: int = 50,
        offset: int = 0,
        session_id: Optional[str] = None
    ) -> List[Dict]:
        """Get OCR results with optional filtering"""
        # Validate limit to prevent excessive queries
        limit = min(limit, 1000)
        offset = max(offset, 0)
        
        query = self.db.query(OCRResult)
        
        if session_id:
            session = self.db.query(SessionModel).filter(SessionModel.session_id == session_id).first()
            if session:
                query = query.filter(OCRResult.session_id == session.id)
        
        results = query.order_by(desc(OCRResult.created_at)).offset(offset).limit(limit).all()
        
        return [
            {
                "id": r.id,
                "text": r.text,
                "confidence": float(r.confidence),
                "bbox_data": r.bbox_data,
                "processing_time_ms": r.processing_time_ms,
                "is_duplicate": r.is_duplicate,
                "similarity_score": float(r.similarity_score) if r.similarity_score else None,
                "created_at": r.created_at,
                "verification_status": r.verification_status
            }
            for r in results
        ]
    
    def verify_ocr_result(self, result_id: int, status: str, verified_by: str) -> Dict:
        """Verify or reject an OCR result"""
        result = self.db.query(OCRResult).filter(OCRResult.id == result_id).first()
        
        if result:
            result.verification_status = status
            result.verified_by = verified_by[:100]  # Limit length
            self.commit()
            self.db.refresh(result)
            
            return {
                "id": result.id,
                "verification_status": result.verification_status,
                "verified_by": result.verified_by
            }
        
        raise ValueError(f"OCR result {result_id} not found")
    
    def export_csv(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> str:
        """Export OCR results as CSV"""
        query = self.db.query(OCRResult)
        
        if session_id:
            session = self.db.query(SessionModel).filter(SessionModel.session_id == session_id).first()
            if session:
                query = query.filter(OCRResult.session_id == session.id)
        
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date)
                query = query.filter(OCRResult.created_at >= start_dt)
            except ValueError:
                logger.warning(f"Invalid start_date format: {start_date}")
        
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date)
                query = query.filter(OCRResult.created_at <= end_dt)
            except ValueError:
                logger.warning(f"Invalid end_date format: {end_date}")
        
        results = query.order_by(OCRResult.created_at).limit(10000).all()
        
        # Create CSV
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'id', 'text', 'confidence', 'processing_time_ms',
            'is_duplicate', 'similarity_score', 'created_at',
            'verification_status', 'verified_by'
        ])
        
        # Rows
        for r in results:
            writer.writerow([
                r.id, r.text, float(r.confidence), r.processing_time_ms,
                r.is_duplicate, float(r.similarity_score) if r.similarity_score else '',
                r.created_at.isoformat(), r.verification_status, r.verified_by
            ])
        
        return output.getvalue()
    
    def export_json(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> str:
        """Export OCR results as JSON"""
        results = self.get_ocr_results(limit=10000, session_id=session_id)
        
        # Filter by date if provided
        if start_date or end_date:
            try:
                start_dt = datetime.fromisoformat(start_date) if start_date else datetime.min
                end_dt = datetime.fromisoformat(end_date) if end_date else datetime.max
                
                results = [
                    r for r in results
                    if start_dt <= datetime.fromisoformat(r['created_at'].isoformat() if isinstance(r['created_at'], str) else r['created_at'].isoformat()) <= end_dt
                ]
            except ValueError as e:
                logger.warning(f"Invalid date format: {e}")
        
        return json.dumps(results, indent=2)
    
    def get_metrics(self, session_id: Optional[str] = None, limit: int = 100) -> Dict:
        """Get OCR-related metrics"""
        query = self.db.query(OCRResult)
        
        if session_id:
            session = self.db.query(SessionModel).filter(SessionModel.session_id == session_id).first()
            if session:
                query = query.filter(OCRResult.session_id == session.id)
        
        results = query.all()
        
        total_count = len(results)
        duplicate_count = sum(1 for r in results if r.is_duplicate)
        avg_confidence = sum(float(r.confidence) for r in results) / total_count if total_count > 0 else 0.0
        avg_processing_time = sum(r.processing_time_ms for r in results if r.processing_time_ms) / total_count if total_count > 0 else 0.0
        
        return {
            "total_processed": total_count,
            "duplicate_count": duplicate_count,
            "duplicate_rate": duplicate_count / total_count if total_count > 0 else 0.0,
            "avg_confidence": avg_confidence,
            "avg_processing_time_ms": avg_processing_time
        }
