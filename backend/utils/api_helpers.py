"""
API Helper Functions
Standardized API response patterns and error handling
"""

from fastapi import HTTPException
from typing import Any, Dict, Optional
from datetime import datetime
import json

from utils.logger import setup_logger

logger = setup_logger(__name__)


class APIResponse:
    """Standardized API response format"""
    
    @staticmethod
    def success(data: Any = None, message: str = "Success") -> Dict:
        """Standard success response"""
        return {
            "status": "success",
            "message": message,
            "data": data,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def error(message: str, error_code: Optional[str] = None, details: Optional[Dict] = None) -> Dict:
        """Standard error response"""
        return {
            "status": "error",
            "message": message,
            "error_code": error_code,
            "details": details,
            "timestamp": datetime.utcnow().isoformat()
        }


def handle_api_error(error: Exception, context: str = ""):
    """Centralized error handling for API endpoints"""
    logger.error(f"API Error in {context}: {str(error)}")
    
    if isinstance(error, ValueError):
        raise HTTPException(status_code=400, detail=str(error))
    elif isinstance(error, PermissionError):
        raise HTTPException(status_code=403, detail="Permission denied")
    else:
        raise HTTPException(status_code=500, detail="Internal server error")


def validate_pagination(limit: int, offset: int) -> tuple:
    """Validate and sanitize pagination parameters"""
    validated_limit = min(max(limit, 1), 1000)
    validated_offset = max(offset, 0)
    return validated_limit, validated_offset


def validate_uuid(uuid_string: str) -> bool:
    """Validate UUID format"""
    import re
    uuid_pattern = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        re.IGNORECASE
    )
    return bool(uuid_pattern.match(uuid_string))


def sanitize_string(input_string: str, max_length: int = 1000) -> str:
    """Sanitize string input"""
    if not input_string:
        return ""
    
    # Remove null bytes and control characters
    sanitized = ''.join(char for char in input_string if ord(char) >= 32 or char in '\n\r\t')
    
    # Truncate to max length
    return sanitized[:max_length]


def validate_date_range(start_date: Optional[str], end_date: Optional[str]) -> tuple:
    """Validate date range parameters"""
    from datetime import datetime
    
    start_dt = None
    end_dt = None
    
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
        except ValueError:
            raise ValueError("Invalid start date format")
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date)
        except ValueError:
            raise ValueError("Invalid end date format")
    
    if start_dt and end_dt and start_dt > end_dt:
        raise ValueError("Start date must be before end date")
    
    return start_dt, end_dt
