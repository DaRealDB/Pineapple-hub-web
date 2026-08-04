"""
OCR Engine - Handles text recognition using EasyOCR
"""

import cv2
import numpy as np
import base64
from typing import Dict, Optional
import time

from utils.config import settings
from utils.logger import setup_logger

logger = setup_logger(__name__)


class OCREngine:
    """OCR Engine for text recognition"""
    
    def __init__(self, engine: str = "easyocr", gpu_enabled: str = "auto", confidence_threshold: float = 0.5):
        """
        Initialize OCR engine
        
        Args:
            engine: OCR engine to use ('easyocr')
            gpu_enabled: GPU setting ('auto', 'true', 'false')
            confidence_threshold: Minimum confidence threshold
        """
        self.engine = engine
        self.gpu_enabled = gpu_enabled
        self.confidence_threshold = confidence_threshold
        self.reader = None
        self._initialize_engine()
    
    def _initialize_engine(self):
        """Initialize the OCR engine"""
        try:
            if self.engine == "easyocr":
                import easyocr
                gpu = self.gpu_enabled == "true" or (self.gpu_enabled == "auto" and self._check_gpu_available())
                
                logger.info(f"Initializing EasyOCR with GPU={gpu}")
                self.reader = easyocr.Reader(['en'], gpu=gpu)
            else:
                raise ValueError(f"Unsupported OCR engine: {self.engine}")
                
        except ImportError:
            logger.error("EasyOCR not installed. Install with: pip install easyocr")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize OCR engine: {e}")
            raise
    
    def _check_gpu_available(self) -> bool:
        """Check if GPU is available"""
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False
    
    def process_image(self, image_data: str) -> Dict:
        """
        Process image and extract text
        
        Args:
            image_data: Base64 encoded image string
            
        Returns:
            Dictionary with OCR results
        """
        try:
            start_time = time.time()
            
            # Decode base64 image
            image_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                raise ValueError("Failed to decode image")
            
            # Perform OCR
            if self.engine == "easyocr":
                results = self.reader.readtext(image)
                
                # Filter by confidence threshold
                filtered_results = [
                    (bbox, text, confidence) 
                    for bbox, text, confidence in results 
                    if confidence >= self.confidence_threshold
                ]
                
                # Extract text and bounding boxes
                texts = []
                bbox_data = []
                
                for bbox, text, confidence in filtered_results:
                    texts.append(text)
                    bbox_data.append({
                        "text": text,
                        "confidence": float(confidence),
                        "bbox": [[int(x), int(y)] for x, y in bbox]
                    })
                
                # Combine all detected text
                combined_text = " ".join(texts) if texts else ""
                avg_confidence = sum(conf for _, _, conf in filtered_results) / len(filtered_results) if filtered_results else 0.0
                
                processing_time = time.time() - start_time
                
                logger.info(f"OCR processed: {len(texts)} text regions found, avg confidence: {avg_confidence:.2f}")
                
                return {
                    "text": combined_text,
                    "confidence": avg_confidence,
                    "bbox_data": bbox_data,
                    "processing_time": processing_time,
                    "region_count": len(texts)
                }
                
        except Exception as e:
            logger.error(f"Error processing image: {e}")
            raise
    
    def set_confidence_threshold(self, threshold: float):
        """Update confidence threshold"""
        self.confidence_threshold = max(0.0, min(1.0, threshold))
        logger.info(f"Confidence threshold updated to {self.confidence_threshold}")
