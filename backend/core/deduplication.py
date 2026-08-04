"""
Deduplication Manager - Handles duplicate detection for OCR results
"""

from typing import Tuple, List, Optional
from collections import deque
import difflib
from datetime import datetime, timedelta

from utils.config import settings
from utils.logger import setup_logger

logger = setup_logger(__name__)


class DeduplicationManager:
    """Manages deduplication of OCR results"""
    
    def __init__(self, similarity_threshold: float = 0.85, max_history: int = 10, strategy: str = "fuzzy"):
        """
        Initialize deduplication manager
        
        Args:
            similarity_threshold: Threshold for considering texts as similar (0-1)
            max_history: Maximum number of recent texts to keep in history
            strategy: Deduplication strategy ('fuzzy', 'exact', 'semantic')
        """
        self.similarity_threshold = similarity_threshold
        self.max_history = max_history
        self.strategy = strategy
        
        # History storage: {session_id: deque of (text, timestamp)}
        self.history = {}
        
        logger.info(f"Deduplication manager initialized: strategy={strategy}, threshold={similarity_threshold}")
    
    def check_duplicate(self, text: str, session_id: Optional[str] = None) -> Tuple[bool, Optional[float]]:
        """
        Check if text is a duplicate of recent results
        
        Args:
            text: Text to check
            session_id: Session identifier for history tracking
            
        Returns:
            Tuple of (is_duplicate, similarity_score)
        """
        if not session_id or session_id not in self.history:
            return False, None
        
        history = self.history[session_id]
        
        # Clean old entries (older than 1 minute)
        cutoff_time = datetime.now() - timedelta(minutes=1)
        while history and history[0][1] < cutoff_time:
            history.popleft()
        
        # Check for duplicates
        for historical_text, _ in history:
            similarity = self._calculate_similarity(text, historical_text)
            
            if similarity >= self.similarity_threshold:
                logger.info(f"Duplicate detected: {similarity:.2f} similarity with '{historical_text[:30]}...'")
                return True, similarity
        
        return False, None
    
    def add_to_history(self, text: str, session_id: str):
        """
        Add text to history for deduplication
        
        Args:
            text: Text to add
            session_id: Session identifier
        """
        if session_id not in self.history:
            self.history[session_id] = deque(maxlen=self.max_history)
        
        self.history[session_id].append((text, datetime.now()))
        
        # Trim if exceeds max history
        while len(self.history[session_id]) > self.max_history:
            self.history[session_id].popleft()
    
    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate similarity between two texts based on strategy
        
        Args:
            text1: First text
            text2: Second text
            
        Returns:
            Similarity score (0-1)
        """
        if self.strategy == "exact":
            return 1.0 if text1.lower() == text2.lower() else 0.0
        
        elif self.strategy == "fuzzy":
            # Use difflib SequenceMatcher
            return difflib.SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
        
        elif self.strategy == "semantic":
            # Placeholder for semantic similarity (would require embeddings)
            # For now, fall back to fuzzy matching
            return difflib.SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
        
        else:
            logger.warning(f"Unknown strategy: {self.strategy}, falling back to fuzzy")
            return difflib.SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
    
    def clear_history(self, session_id: str):
        """Clear history for a specific session"""
        if session_id in self.history:
            del self.history[session_id]
            logger.info(f"Cleared deduplication history for session {session_id}")
    
    def update_threshold(self, threshold: float):
        """Update similarity threshold"""
        self.similarity_threshold = max(0.0, min(1.0, threshold))
        logger.info(f"Similarity threshold updated to {self.similarity_threshold}")
    
    def update_strategy(self, strategy: str):
        """Update deduplication strategy"""
        valid_strategies = ['fuzzy', 'exact', 'semantic']
        if strategy in valid_strategies:
            self.strategy = strategy
            logger.info(f"Deduplication strategy updated to {strategy}")
        else:
            logger.warning(f"Invalid strategy: {strategy}. Valid options: {valid_strategies}")
    
    def get_history_size(self, session_id: str) -> int:
        """Get current history size for a session"""
        return len(self.history.get(session_id, []))
