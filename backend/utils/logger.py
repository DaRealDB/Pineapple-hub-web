"""
Simple logger setup for the OCR Pipeline backend.
Provides a consistent logger instance across all backend modules.
"""

import logging
import sys


def setup_logger(name: str) -> logging.Logger:
    """Create or return a logger with consistent formatting."""
    logger = logging.getLogger(name)

    # Avoid adding duplicate handlers on re-import
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.DEBUG)
        formatter = logging.Formatter(
            "[%(asctime)s] %(levelname)-8s %(name)s | %(message)s",
            datefmt="%H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    logger.setLevel(logging.DEBUG)
    return logger
