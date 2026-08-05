"""
Deduplication manager for OCR results.
Supports fuzzy, exact, and semantic deduplication strategies.
"""

from typing import Tuple
from difflib import SequenceMatcher
from collections import defaultdict
from threading import Lock

from utils.logger import setup_logger

logger = setup_logger(__name__)


class DeduplicationManager:
    """
    Detects duplicate OCR results across frames.

    Strategies:
      - fuzzy:   SequenceMatcher ratio (default)
      - exact:   Case-insensitive string equality
      - semantic: Placeholder — not yet implemented, falls back to fuzzy
    """

    def __init__(
        self,
        similarity_threshold: float = 0.85,
        max_history: int = 10,
        strategy: str = "fuzzy",
    ):
        self._threshold = similarity_threshold
        self._max_history = max_history
        self._strategy = strategy
        self._lock = Lock()
        # session_id → list of recent text strings
        self._history: dict[str, list[str]] = defaultdict(list)

    def check_duplicate(self, text: str, session_id: str) -> Tuple[bool, float]:
        """
        Check if the given text is a duplicate of any recent text.

        Returns:
            (is_duplicate, similarity_score)
        """
        if not text or not text.strip():
            return False, 0.0

        with self._lock:
            recent = self._history.get(session_id, [])

            for prev_text in recent:
                if self._strategy == "exact":
                    sim = 1.0 if text.strip().lower() == prev_text.strip().lower() else 0.0
                elif self._strategy == "semantic":
                    # Fall back to fuzzy until semantic is implemented
                    sim = SequenceMatcher(None, text.strip(), prev_text.strip()).ratio()
                else:  # fuzzy (default)
                    sim = SequenceMatcher(None, text.strip(), prev_text.strip()).ratio()

                if sim >= self._threshold:
                    logger.debug(
                        f"Dedup match: '{text[:40]}' ~ '{prev_text[:40]}' "
                        f"(sim={sim:.3f}, threshold={self._threshold})"
                    )
                    return True, sim

            return False, 0.0

    def add_to_history(self, text: str, session_id: str) -> None:
        """Add a text to the deduplication history."""
        if not text or not text.strip():
            return

        with self._lock:
            history = self._history[session_id]
            history.append(text.strip())

            # Trim to max history
            if len(history) > self._max_history:
                self._history[session_id] = history[-self._max_history:]
