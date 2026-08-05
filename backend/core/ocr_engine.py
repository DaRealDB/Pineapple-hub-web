"""
OCR Engine — wraps EasyOCR for text recognition.
Processes base64-encoded image frames and returns text + confidence.
"""

import base64
import io
import time
from typing import Dict, Optional

import cv2
import numpy as np

from utils.logger import setup_logger

logger = setup_logger(__name__)


class OCREngine:
    """
    Wraps EasyOCR for text recognition with configurable confidence threshold.

    The engine is lazily initialised on first use to avoid loading
    the model into memory at import time.
    """

    def __init__(
        self,
        engine: str = "easyocr",
        gpu_enabled: str = "auto",
        confidence_threshold: float = 0.5,
    ):
        if engine != "easyocr":
            raise ValueError(f"Unsupported OCR engine: {engine}")

        self._engine = engine
        self._gpu_enabled = gpu_enabled.lower() == "true" or (
            gpu_enabled.lower() == "auto" and self._cuda_available()
        )
        self._confidence_threshold = confidence_threshold
        self._reader: Optional[object] = None

    @staticmethod
    def _cuda_available() -> bool:
        """Check if CUDA is available for GPU-accelerated OCR."""
        try:
            import torch
            return torch.cuda.is_available()
        except Exception:
            return False

    def _get_reader(self):
        """Lazy-initialise the EasyOCR reader."""
        if self._reader is None:
            logger.info(
                "Initialising EasyOCR (gpu=%s, lang=['en']) ...",
                self._gpu_enabled,
            )
            import easyocr
            self._reader = easyocr.Reader(
                ["en"],
                gpu=self._gpu_enabled,
            )
            logger.info("EasyOCR initialised")
        return self._reader

    def process_image(self, image_data: str) -> Dict:
        """
        Run OCR on a base64-encoded JPEG image.

        Args:
            image_data: Base64-encoded JPEG image string.

        Returns:
            {
                "text": str,
                "confidence": float,
                "bbox_data": list | None,
            }
        """
        t_start = time.time()

        try:
            # Decode base64 to numpy array
            img_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                logger.warning("Failed to decode image for OCR")
                return {"text": "", "confidence": 0.0, "bbox_data": None}

            reader = self._get_reader()
            results = reader.readtext(img)

            if not results:
                elapsed_ms = int((time.time() - t_start) * 1000)
                logger.debug(f"OCR returned no text in {elapsed_ms}ms")
                return {"text": "", "confidence": 0.0, "bbox_data": None}

            # Combine all detected text blocks
            texts = []
            confidences = []
            bbox_data = []

            for bbox, text, confidence in results:
                if confidence >= self._confidence_threshold:
                    texts.append(text)
                    confidences.append(confidence)
                    bbox_data.append({
                        "bbox": [[int(p[0]), int(p[1])] for p in bbox],
                        "text": text,
                        "confidence": float(confidence),
                    })

            combined_text = " ".join(texts).strip()
            avg_confidence = (
                sum(confidences) / len(confidences) if confidences else 0.0
            )

            elapsed_ms = int((time.time() - t_start) * 1000)
            logger.debug(
                f"OCR processed in {elapsed_ms}ms: "
                f"'{combined_text[:60]}' conf={avg_confidence:.2f}"
            )

            return {
                "text": combined_text,
                "confidence": float(avg_confidence),
                "bbox_data": bbox_data if bbox_data else None,
            }

        except Exception as e:
            logger.error(f"OCR processing error: {e}", exc_info=True)
            return {"text": "", "confidence": 0.0, "bbox_data": None}
