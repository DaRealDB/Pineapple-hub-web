"""
OCR API endpoints
Handles text recognition and OCR result management
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, validator
from typing import Optional, List, Union, Dict, Any
from datetime import datetime
import uuid
import base64
import re

from core.ocr_engine import OCREngine
from core.deduplication import DeduplicationManager
from database.repository import OCRRepository
from utils.config import settings
from utils.logger import setup_logger
from utils.api_helpers import handle_api_error, APIResponse, validate_pagination

router = APIRouter()
logger = setup_logger(__name__)


class OCRRequest(BaseModel):
    """OCR request model"""
    image_data: str  # Base64 encoded image
    session_id: Optional[str] = None
    
    @validator('image_data')
    def validate_image_data(cls, v):
        if not v:
            raise ValueError('Image data cannot be empty')
        try:
            # Validate base64 format
            if not re.match(r'^[A-Za-z0-9+/]+={0,2}$', v):
                raise ValueError('Invalid base64 format')
            # Decode to validate it's valid base64
            decoded = base64.b64decode(v, validate=True)
            if len(decoded) > 10 * 1024 * 1024:  # 10MB limit
                raise ValueError('Image data too large')
        except Exception as e:
            raise ValueError(f'Invalid image data: {str(e)}')
        return v
    
    @validator('session_id')
    def validate_session_id(cls, v):
        if v:
            try:
                uuid.UUID(v)
            except ValueError:
                # Auto-generate UUID if invalid format
                import uuid
                return str(uuid.uuid4())
        return v


class OCRResponse(BaseModel):
    """OCR response model"""
    id: int
    text: str
    confidence: float
    bbox_data: Optional[Union[dict, List[Dict[str, Any]]]] = None
    processing_time_ms: int
    is_duplicate: bool
    similarity_score: Optional[float] = None
    created_at: datetime
    
    class Config:
        # Allow any type for bbox_data
        arbitrary_types_allowed = True


class VerificationRequest(BaseModel):
    """OCR verification request model"""
    result_id: int
    status: str  # 'verified' | 'rejected'
    verified_by: str
    
    @validator('result_id')
    def validate_result_id(cls, v):
        if v <= 0:
            raise ValueError('Result ID must be positive')
        return v
    
    @validator('status')
    def validate_status(cls, v):
        valid_statuses = ['verified', 'rejected']
        if v not in valid_statuses:
            raise ValueError(f'Status must be one of {valid_statuses}')
        return v
    
    @validator('verified_by')
    def validate_verified_by(cls, v):
        if not v or not v.strip():
            raise ValueError('Verified by cannot be empty')
        if len(v) > 100:
            raise ValueError('Verified by too long')
        return v.strip()


# Global OCR engine and deduplication manager
ocr_engine = None
dedup_manager = None
ocr_repository = None


def get_ocr_engine():
    """Get or create OCR engine"""
    global ocr_engine
    if ocr_engine is None:
        ocr_engine = OCREngine(
            engine=settings.OCR_ENGINE,
            gpu_enabled=settings.GPU_ENABLED,
            confidence_threshold=settings.CONFIDENCE_THRESHOLD
        )
    return ocr_engine


def get_dedup_manager():
    """Get or create deduplication manager"""
    global dedup_manager
    if dedup_manager is None:
        dedup_manager = DeduplicationManager(
            similarity_threshold=settings.DEDUP_SIMILARITY_THRESHOLD,
            max_history=settings.DEDUP_MAX_HISTORY,
            strategy=settings.DEDUP_STRATEGY
        )
    return dedup_manager


def get_ocr_repository():
    """Get or create OCR repository"""
    global ocr_repository
    if ocr_repository is None:
        try:
            ocr_repository = OCRRepository()
        except Exception as e:
            logger.error(f"Failed to create OCR repository: {e}")
            ocr_repository = None
    return ocr_repository


@router.post("/process", response_model=OCRResponse)
async def process_ocr(request: OCRRequest):
    """Process OCR on image data"""
    try:
        import time
        
        engine = get_ocr_engine()
        dedup = get_dedup_manager()
        repo = get_ocr_repository()
        
        # Start timing
        start_time = time.time()
        
        # Process OCR
        result = engine.process_image(request.image_data)
        
        # Check for duplicates
        is_duplicate, similarity_score = dedup.check_duplicate(
            result['text'],
            request.session_id
        )
        
        # Save to database (if available)
        if repo and repo.db:
            try:
                ocr_result = repo.create_ocr_result(
                    session_id=request.session_id,
                    text=result['text'],
                    confidence=result['confidence'],
                    bbox_data=result.get('bbox_data'),
                    processing_time_ms=int((time.time() - start_time) * 1000),
                    is_duplicate=is_duplicate,
                    similarity_score=similarity_score
                )
            except Exception as db_error:
                logger.warning(f"Database save failed: {db_error}")
                ocr_result = None
        else:
            ocr_result = None
            logger.warning("OCR processed but not saved to database (development mode)")
        
        # Add to dedup history if not duplicate
        if not is_duplicate:
            dedup.add_to_history(result['text'], request.session_id)
        
        logger.info(f"OCR processed: {result['text'][:50]}... (confidence: {result['confidence']:.2f})")
        
        # Return result (with or without database ID)
        return OCRResponse(
            id=ocr_result['id'] if ocr_result else 0,
            text=result['text'],
            confidence=result['confidence'],
            bbox_data=result.get('bbox_data'),
            processing_time_ms=int((time.time() - start_time) * 1000),
            is_duplicate=is_duplicate,
            similarity_score=similarity_score,
            created_at=datetime.utcnow()
        )
    except Exception as e:
        logger.error(f"Error processing OCR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/results", response_model=List[OCRResponse])
async def get_ocr_results(
    limit: int = 50,
    offset: int = 0,
    session_id: Optional[str] = None
):
    """Get OCR results with optional filtering"""
    try:
        validated_limit, validated_offset = validate_pagination(limit, offset)
        repo = get_ocr_repository()
        results = repo.get_ocr_results(limit=validated_limit, offset=validated_offset, session_id=session_id)
        return results
    except Exception as e:
        handle_api_error(e, "get_ocr_results")


@router.post("/verify", response_model=dict)
async def verify_ocr_result(request: VerificationRequest):
    """Verify or reject OCR result"""
    try:
        repo = get_ocr_repository()
        result = repo.verify_ocr_result(
            result_id=request.result_id,
            status=request.status,
            verified_by=request.verified_by
        )
        
        logger.info(f"OCR result {request.result_id} {request.status} by {request.verified_by}")
        
        return {"status": "success", "result": result}
    except Exception as e:
        logger.error(f"Error verifying OCR result: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export")
async def export_ocr_data(
    format: str = "csv",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    session_id: Optional[str] = None
):
    """Export OCR data in specified format"""
    try:
        repo = get_ocr_repository()
        
        if format == "csv":
            data = repo.export_csv(start_date=start_date, end_date=end_date, session_id=session_id)
            return {"data": data, "format": "csv"}
        elif format == "json":
            data = repo.export_json(start_date=start_date, end_date=end_date, session_id=session_id)
            return {"data": data, "format": "json"}
        else:
            raise HTTPException(status_code=400, detail="Unsupported format")
    except Exception as e:
        logger.error(f"Error exporting OCR data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics")
async def get_ocr_metrics(
    session_id: Optional[str] = None,
    limit: int = 100
):
    """Get OCR performance metrics"""
    try:
        repo = get_ocr_repository()
        metrics = repo.get_metrics(session_id=session_id, limit=limit)
        return metrics
    except Exception as e:
        logger.error(f"Error fetching OCR metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
