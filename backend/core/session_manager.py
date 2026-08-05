"""
In-memory session manager for the OCR Pipeline.
Tracks active sessions and their performance metrics.
Falls back gracefully when the database is unavailable.
"""

import uuid
import time
from typing import Optional, Dict, List
from threading import Lock

from utils.logger import setup_logger

logger = setup_logger(__name__)


class SessionManager:
    """
    Manages OCR pipeline sessions and metrics in memory.

    Attempts to persist to the database when available,
    but degrades gracefully to in-memory-only operation.
    """

    def __init__(self):
        self._lock = Lock()
        # session_id → {device_id, config, status, start_time, end_time}
        self._sessions: Dict[str, Dict] = {}
        # session_id → [{metric_type, metric_value, timestamp}, ...]
        self._metrics: Dict[str, List[Dict]] = {}

    def create_session(self, device_id: str, config: Dict) -> str:
        """Create a new session and return its ID."""
        session_id = str(uuid.uuid4())

        with self._lock:
            self._sessions[session_id] = {
                "device_id": device_id,
                "config": config,
                "status": "active",
                "start_time": time.time(),
                "end_time": None,
            }
            self._metrics[session_id] = []

        # Best-effort DB persistence
        try:
            from database.repository import SessionRepository
            repo = SessionRepository()
            repo.create_session(session_id, device_id, config)
        except Exception as e:
            logger.warning(f"Session created in-memory only (DB unavailable): {e}")

        logger.info(f"Session created: {session_id} (device={device_id})")
        return session_id

    def end_session(self, session_id: str) -> None:
        """Mark a session as completed."""
        with self._lock:
            if session_id in self._sessions:
                self._sessions[session_id]["status"] = "completed"
                self._sessions[session_id]["end_time"] = time.time()

        try:
            from database.repository import SessionRepository
            repo = SessionRepository()
            repo.end_session(session_id)
        except Exception as e:
            logger.warning(f"Session ended in-memory only: {e}")

        logger.info(f"Session ended: {session_id}")

    def update_session_config(self, session_id: str, config: Dict) -> None:
        """Update a session's configuration."""
        with self._lock:
            if session_id in self._sessions:
                self._sessions[session_id]["config"].update(config)

        try:
            from database.repository import SessionRepository
            repo = SessionRepository()
            repo.update_session_config(session_id, config)
        except Exception:
            pass

    def record_metric(self, session_id: str, metric_type: str, value: float) -> None:
        """Record a performance metric for a session."""
        entry = {
            "metric_type": metric_type,
            "metric_value": value,
            "timestamp": time.time(),
        }

        with self._lock:
            if session_id not in self._metrics:
                self._metrics[session_id] = []
            self._metrics[session_id].append(entry)

        try:
            from database.repository import SessionRepository
            repo = SessionRepository()
            repo.record_metric(session_id, metric_type, value)
        except Exception:
            pass

    def get_session_metrics(
        self,
        session_id: str,
        metric_type: Optional[str] = None,
        limit: int = 100,
    ) -> Dict:
        """Retrieve metrics for a session."""
        with self._lock:
            entries = self._metrics.get(session_id, [])

            if metric_type:
                entries = [e for e in entries if e["metric_type"] == metric_type]

            # Return the most recent entries
            recent = entries[-limit:]

            # Compute aggregates
            avg_value = (
                sum(e["metric_value"] for e in recent) / len(recent)
                if recent
                else 0.0
            )

            return {
                "metrics": recent,
                "count": len(recent),
                "avg_value": avg_value,
                "session_status": (
                    self._sessions.get(session_id, {}).get("status", "unknown")
                ),
            }
