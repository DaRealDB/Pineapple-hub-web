"""
Session Manager - Manages OCR pipeline sessions
"""

from typing import Dict, Optional, List
from datetime import datetime
import uuid

from database.repository import SessionRepository
from utils.config import settings
from utils.logger import setup_logger

logger = setup_logger(__name__)


class SessionManager:
    """Manages OCR pipeline sessions"""
    
    def __init__(self):
        """Initialize session manager"""
        self.session_repository = SessionRepository()
        self.active_sessions: Dict[str, Dict] = {}
        logger.info("Session manager initialized")
    
    def create_session(self, device_id: str, config: Dict) -> str:
        """
        Create a new session
        
        Args:
            device_id: Device identifier
            config: Session configuration
            
        Returns:
            Session ID
        """
        session_id = str(uuid.uuid4())
        
        # Create in database (if available)
        db_session = None
        try:
            db_session = self.session_repository.create_session(
                session_id=session_id,
                device_id=device_id,
                config=config
            )
        except Exception as e:
            logger.warning(f"Database not available, creating session in memory only: {e}")
        
        # Store in memory
        self.active_sessions[session_id] = {
            "id": db_session["id"] if db_session else None,
            "session_id": session_id,
            "device_id": device_id,
            "config": config,
            "start_time": datetime.now(),
            "total_processed": 0,
            "duplicate_count": 0
        }
        
        logger.info(f"Session created: {session_id} for device {device_id}")
        return session_id
    
    def end_session(self, session_id: str):
        """
        End a session
        
        Args:
            session_id: Session identifier
        """
        if session_id in self.active_sessions:
            session_data = self.active_sessions[session_id]
            
            # Update in database (if available)
            try:
                self.session_repository.end_session(session_id)
            except Exception as e:
                logger.warning(f"Database not available, ending session in memory only: {e}")
            
            # Remove from memory
            del self.active_sessions[session_id]
            
            logger.info(f"Session ended: {session_id}")
        else:
            logger.warning(f"Session not found: {session_id}")
    
    def update_session_config(self, session_id: str, config: Dict):
        """
        Update session configuration
        
        Args:
            session_id: Session identifier
            config: New configuration
        """
        if session_id in self.active_sessions:
            self.active_sessions[session_id]["config"] = config
            try:
                self.session_repository.update_session_config(session_id, config)
            except Exception as e:
                logger.warning(f"Database not available, updating config in memory only: {e}")
            logger.info(f"Session config updated: {session_id}")
        else:
            logger.warning(f"Session not found: {session_id}")
    
    def record_metric(self, session_id: str, metric_type: str, value: float):
        """
        Record a performance metric for a session
        
        Args:
            session_id: Session identifier
            metric_type: Type of metric (fps, cpu_usage, etc.)
            value: Metric value
        """
        if session_id in self.active_sessions:
            try:
                self.session_repository.record_metric(session_id, metric_type, value)
            except Exception as e:
                logger.warning(f"Database not available, recording metric in memory only: {e}")
            
            # Update in-memory stats
            if metric_type == "total_processed":
                self.active_sessions[session_id]["total_processed"] = int(value)
            elif metric_type == "duplicate_count":
                self.active_sessions[session_id]["duplicate_count"] = int(value)
    
    def get_session_metrics(self, session_id: Optional[str], metric_type: Optional[str] = None, limit: int = 100) -> Dict:
        """
        Get metrics for a session
        
        Args:
            session_id: Session identifier (None for all sessions)
            metric_type: Filter by metric type
            limit: Maximum number of metrics to return
            
        Returns:
            Dictionary of metrics
        """
        return self.session_repository.get_metrics(
            session_id=session_id,
            metric_type=metric_type,
            limit=limit
        )
    
    def get_session_total_processed(self, session_id: str) -> int:
        """Get total processed count for a session"""
        if session_id in self.active_sessions:
            return self.active_sessions[session_id]["total_processed"]
        return 0
    
    def get_active_sessions(self) -> List[Dict]:
        """Get all active sessions"""
        return list(self.active_sessions.values())
    
    def is_session_active(self, session_id: str) -> bool:
        """Check if a session is active"""
        return session_id in self.active_sessions
