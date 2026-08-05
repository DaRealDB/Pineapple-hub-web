"""
API helper utilities — consistent response shapes and error handling
for FastAPI endpoints.
"""

from fastapi import HTTPException
from typing import Any, Optional


class APIResponse:
    """Standardised API response wrapper."""

    @staticmethod
    def success(data: Any = None, message: str = "OK") -> dict:
        return {
            "status": "success",
            "message": message,
            "data": data,
        }

    @staticmethod
    def error(message: str, detail: Optional[Any] = None) -> dict:
        return {
            "status": "error",
            "message": message,
            "detail": detail,
        }


def handle_api_error(error: Exception, context: str = "") -> None:
    """
    Log the error and raise an HTTPException with a 500 status.
    Designed as a catch-all for API route handlers.
    """
    import logging
    logger = logging.getLogger(__name__)

    logger.error(f"[{context}] {type(error).__name__}: {error}", exc_info=True)
    raise HTTPException(
        status_code=500,
        detail=f"{'[' + context + '] ' if context else ''}{str(error)}",
    )
