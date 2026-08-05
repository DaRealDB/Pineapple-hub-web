"""
API helper utilities — consistent response shapes and error handling
for FastAPI endpoints.
"""

from fastapi import HTTPException
from typing import Any, Dict, Optional
from datetime import datetime

from utils.logger import setup_logger

logger = setup_logger(__name__)


class APIResponse:
    """Standardised API response wrapper."""

    @staticmethod
    def success(data: Any = None, message: str = "Success") -> dict:
        return {
            "status": "success",
            "message": message,
            "data": data,
            "timestamp": datetime.utcnow().isoformat(),
        }

    @staticmethod
    def error(message: str, error_code: Optional[str] = None, details: Optional[Dict] = None) -> dict:
        return {
            "status": "error",
            "message": message,
            "error_code": error_code,
            "details": details,
            "timestamp": datetime.utcnow().isoformat(),
        }


def handle_api_error(error: Exception, context: str = "") -> None:
    """
    Log the error and raise an HTTPException.
    Preserves the status code of existing HTTPExceptions (e.g. 400).
    """
    if isinstance(error, HTTPException):
        raise error

    if isinstance(error, ValueError):
        raise HTTPException(status_code=400, detail=str(error))
    elif isinstance(error, PermissionError):
        raise HTTPException(status_code=403, detail="Permission denied")

    logger.error(f"[{context}] {type(error).__name__}: {error}", exc_info=True)
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
        re.IGNORECASE,
    )
    return bool(uuid_pattern.match(uuid_string))


def sanitize_string(input_string: str, max_length: int = 1000) -> str:
    """Sanitize string input"""
    if not input_string:
        return ""
    sanitized = ''.join(char for char in input_string if ord(char) >= 32 or char in '\n\r\t')
    return sanitized[:max_length]


def validate_date_range(start_date: Optional[str], end_date: Optional[str]) -> tuple:
    """Validate date range parameters"""
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
