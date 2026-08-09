"""
YOLO Object Detector — wraps Ultralytics YOLOv8 for crate/box and hand detection.

Loads the trained weights from weights/best.pt (99.5% mAP@50) and exposes a
detect() method that returns structured bounding-box data for:
  - Class 0: hands   (safety zone — suppress OCR when hands are near)
  - Class 1: box     (crate/container — crop region for focused OCR)

The detector is lazily initialised on first use to avoid loading the model
into memory at import time (same pattern as OCREngine).
"""

import os
import time
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from utils.logger import setup_logger

logger = setup_logger(__name__)


class YOLODetector:
    """
    Wraps Ultralytics YOLOv8 for crate and hand detection.

    Usage:
        detector = YOLODetector(weights_path="weights/best.pt", confidence=0.5)
        detections = detector.detect(frame)
        # → {"hands": [...], "boxes": [...], "annotated_frame": np.ndarray}
    """

    def __init__(
        self,
        weights_path: str = "weights/best.pt",
        confidence: float = 0.5,
        image_size: int = 640,
        enabled: bool = True,
    ):
        # Resolve weights path relative to project root
        # The project root is two levels up from this file:
        #   backend/core/yolo_detector.py → ../../ = project root
        _core_dir = os.path.dirname(os.path.abspath(__file__))
        _backend_dir = os.path.dirname(_core_dir)
        _project_root = os.path.dirname(_backend_dir)

        if not os.path.isabs(weights_path):
            self._weights_path = os.path.join(_project_root, weights_path)
        else:
            self._weights_path = weights_path

        self._confidence = confidence
        self._image_size = image_size
        self._enabled = enabled
        self._model: Optional[object] = None
        self._initialised = False
        self._init_error: Optional[str] = None

    # ── public API ────────────────────────────────────────────────────

    @property
    def is_ready(self) -> bool:
        """True when the model is loaded and ready for inference."""
        return self._initialised and self._model is not None

    @property
    def init_error(self) -> Optional[str]:
        """Human-readable error message if initialisation failed, else None."""
        return self._init_error

    def _ensure_model(self) -> bool:
        """Lazy-initialise the YOLO model. Returns True if ready."""
        if not self._enabled:
            return False

        if self._initialised:
            return self._model is not None

        self._initialised = True

        if not os.path.exists(self._weights_path):
            self._init_error = (
                f"YOLO weights not found at {self._weights_path}. "
                f"Place best.pt in the project root or set YOLO_WEIGHTS_PATH."
            )
            logger.warning(self._init_error)
            return False

        try:
            from ultralytics import YOLO

            logger.info(
                "Loading YOLO model from %s (imgsz=%d, conf=%.2f) ...",
                self._weights_path,
                self._image_size,
                self._confidence,
            )
            t0 = time.time()
            self._model = YOLO(self._weights_path)
            elapsed = time.time() - t0
            logger.info("YOLO model loaded in %.1fs", elapsed)
            return True

        except ImportError:
            self._init_error = (
                "ultralytics package not installed. "
                "Run: pip install ultralytics>=8.0.0"
            )
            logger.error(self._init_error)
            return False
        except Exception as e:
            self._init_error = f"Failed to load YOLO model: {e}"
            logger.error(self._init_error, exc_info=True)
            return False

    def detect(self, frame: np.ndarray) -> Dict:
        """
        Run YOLO detection on a BGR frame.

        Args:
            frame: BGR image as numpy array (from cv2.imread / webcam).

        Returns:
            {
                "hands": [
                    {
                        "bbox": [x1, y1, x2, y2],   # pixel coords
                        "confidence": float,
                        "label": "hands",
                    },
                    ...
                ],
                "boxes": [
                    {
                        "bbox": [x1, y1, x2, y2],
                        "confidence": float,
                        "label": "box",
                    },
                    ...
                ],
                "hands_present": bool,       # convenience: any hand detected?
                "box_present": bool,         # convenience: any box detected?
                "primary_box": dict | None,  # highest-confidence box (for OCR crop)
                "total_detections": int,
                "inference_ms": float,
            }
        """
        default_result = {
            "hands": [],
            "boxes": [],
            "hands_present": False,
            "box_present": False,
            "primary_box": None,
            "total_detections": 0,
            "inference_ms": 0.0,
        }

        if not self._ensure_model():
            return default_result

        try:
            t0 = time.time()

            results = self._model(
                frame,
                conf=self._confidence,
                imgsz=self._image_size,
                verbose=False,
            )

            inference_ms = (time.time() - t0) * 1000

            hands = []
            boxes = []

            for result in results:
                if result.boxes is None:
                    continue

                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
                    bbox = [int(round(v)) for v in xyxy]

                    detection = {
                        "bbox": bbox,
                        "confidence": round(conf, 4),
                        "label": "hands" if cls_id == 0 else "box",
                    }

                    if cls_id == 0:
                        hands.append(detection)
                    elif cls_id == 1:
                        boxes.append(detection)

            # Primary box = highest-confidence box detection
            primary_box = None
            if boxes:
                boxes_sorted = sorted(boxes, key=lambda d: d["confidence"], reverse=True)
                primary_box = boxes_sorted[0]

            return {
                "hands": hands,
                "boxes": boxes,
                "hands_present": len(hands) > 0,
                "box_present": len(boxes) > 0,
                "primary_box": primary_box,
                "total_detections": len(hands) + len(boxes),
                "inference_ms": round(inference_ms, 1),
            }

        except Exception as e:
            logger.error("YOLO detection error: %s", e, exc_info=True)
            return default_result

    def crop_to_box(
        self, frame: np.ndarray, bbox: List[int], padding: int = 10
    ) -> Optional[np.ndarray]:
        """
        Crop the frame to a bounding box with optional padding.

        Args:
            frame: BGR image as numpy array.
            bbox: [x1, y1, x2, y2] in pixel coordinates.
            padding: Extra pixels to add around the bbox (clamped to frame edges).

        Returns:
            Cropped BGR image, or None if the bbox is invalid.
        """
        if frame is None or bbox is None:
            return None

        try:
            h, w = frame.shape[:2]
            x1, y1, x2, y2 = bbox

            # Clamp with padding
            x1 = max(0, x1 - padding)
            y1 = max(0, y1 - padding)
            x2 = min(w, x2 + padding)
            y2 = min(h, y2 + padding)

            if x2 <= x1 or y2 <= y1:
                return None

            return frame[y1:y2, x1:x2]

        except Exception as e:
            logger.warning("Failed to crop frame to bbox: %s", e)
            return None

    def draw_detections(
        self, frame: np.ndarray, detections: Dict, draw_labels: bool = True
    ) -> np.ndarray:
        """
        Draw bounding boxes and labels onto a copy of the frame.

        Color scheme:
          - Box (crate):   Green  #10B981
          - Hands:         Red    #EF4444

        Args:
            frame: BGR image.
            detections: Dict returned by detect().
            draw_labels: Whether to draw class name + confidence.

        Returns:
            Annotated BGR image (safe for encoding and broadcasting).
        """
        annotated = frame.copy()

        colors = {
            "box": (0x10, 0xB9, 0x81),    # Green in BGR → #10B981
            "hands": (0x44, 0x44, 0xEF),  # Red in BGR   → #EF4444
        }

        for det in detections.get("boxes", []):
            x1, y1, x2, y2 = det["bbox"]
            color = colors["box"]
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            if draw_labels:
                label = f"CRATE {det['confidence']:.0%}"
                cv2.putText(
                    annotated, label, (x1, y1 - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2,
                )

        for det in detections.get("hands", []):
            x1, y1, x2, y2 = det["bbox"]
            color = colors["hands"]
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            if draw_labels:
                label = f"HAND {det['confidence']:.0%}"
                cv2.putText(
                    annotated, label, (x1, y1 - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2,
                )

        return annotated
