"""
Crate Logging State Machine — backend-driven crate capture orchestrator.

Replaces the frontend-only useCrateLogCapture.js with a server-side state
machine that requires ALL core parameters before committing a log:

  1. CNN (YOLO) detects a crate → OCR extracts batch ID from the bbox
  2. MQTT scale provides load weight (weight_g + grade)
  3. Hand crossing the trigger line releases the state → log committed

States:
  IDLE           — no batch_id cached, no weight cached
  AWAITING_DATA  — partial (either batch_id OR weight received)
  READY          — both batch_id AND weight present, waiting for hand wave
  LOGGED         — entry written to database, cooling down → IDLE
"""

import json
import time
import threading
import requests
from typing import Dict, Optional

from utils.logger import setup_logger
from utils.config import settings

logger = setup_logger(__name__)


class CrateStateMachine:
    """
    Orchestrates the crate capture lifecycle.

    Usage:
        sm = CrateStateMachine()
        # In OCR loop:
        result = sm.on_yolo_detection(detections, ocr_text, confidence, frame_w)
        # In MQTT callback:
        sm.on_weight_reading(weight_g, grade)
        # For dashboard:
        state = sm.get_state()
    """

    def __init__(self):
        self._lock = threading.Lock()

        # Configuration (from settings, with defaults)
        self.cooldown_ms = getattr(settings, "CRATE_LOG_COOLDOWN_MS", 3000)
        self.data_ttl_ms = getattr(settings, "CRATE_DATA_TTL_MS", 10000)
        self._auto_log_delay_s = getattr(settings, "CRATE_AUTO_LOG_DELAY_SECONDS", 5)
        self.express_api_url = getattr(
            settings, "EXPRESS_API_URL", "http://localhost:3001"
        )
        self.express_api_token = getattr(settings, "EXPRESS_INTERNAL_KEY", "pineapple-internal-key-change-me")

        # State
        self._state = "IDLE"
        self._pending_batch_id: Optional[str] = None
        self._pending_confidence: float = 0.0
        self._pending_weight_g: Optional[int] = None
        self._pending_grade: str = "PENDING_FORMULA"
        self._batch_timestamp: float = 0.0
        self._weight_timestamp: float = 0.0

        # Hand-absence countdown (replaces trigger line crossing)
        self._hands_absent_since: Optional[float] = None
        self._hands_present: bool = False
        self._last_logged_at: float = 0.0
        self._log_count: int = 0

    # ── public API ────────────────────────────────────────────────────

    def on_yolo_detection(
        self,
        detections: dict,
        ocr_text: str,
        ocr_confidence: float,
        frame_width: int = 640,
    ) -> Optional[str]:
        """
        Process a YOLO detection frame + OCR result.

        Called from the OCR thread every OCR interval.

        Returns:
            None — no log committed this frame
            "logged: <batch_id>" — a crate log was just created
        """
        with self._lock:
            now = time.time()

            # ── expire stale data ─────────────────────────────────────
            ttl_s = self.data_ttl_ms / 1000.0
            if self._pending_batch_id and (now - self._batch_timestamp) > ttl_s:
                logger.debug("[CrateSM] Batch ID expired (TTL exceeded)")
                self._pending_batch_id = None
                self._pending_confidence = 0.0
            if self._pending_weight_g is not None and (now - self._weight_timestamp) > ttl_s:
                logger.debug("[CrateSM] Weight reading expired (TTL exceeded)")
                self._pending_weight_g = None

            # ── update batch_id from YOLO + OCR ────────────────────────
            box_present = detections.get("box_present", False)
            if box_present and ocr_text and ocr_text.strip():
                self._pending_batch_id = ocr_text.strip()
                self._pending_confidence = ocr_confidence
                self._batch_timestamp = now
                logger.info(f"[CrateSM] Batch ID captured: '{self._pending_batch_id}' "
                           f"conf={ocr_confidence:.2f}")

            # ── track hands present state ──────────────────────────────
            hands = detections.get("hands", [])
            self._hands_present = len(hands) > 0

            # ── recalculate state ──────────────────────────────────────
            has_batch = self._pending_batch_id is not None
            has_weight = self._pending_weight_g is not None

            if self._state == "LOGGED":
                if (now - self._last_logged_at) * 1000 >= self.cooldown_ms:
                    self._state = "IDLE"
                    self._pending_batch_id = None
                    self._pending_weight_g = None

            if self._state in ("IDLE", "AWAITING_DATA"):
                if has_batch and has_weight:
                    self._state = "READY"
                    logger.info(
                        f"[CrateSM] → READY  batch='{self._pending_batch_id}' "
                        f"weight={self._pending_weight_g}g  "
                        f"→ hands absent for {self._auto_log_delay_s}s to auto-log"
                    )
                elif has_batch or has_weight:
                    self._state = "AWAITING_DATA"
                else:
                    self._state = "IDLE"

            # ── hand-absence countdown while READY ─────────────────────
            if self._state == "READY":
                if self._hands_present:
                    # Hands in frame — reset countdown
                    self._hands_absent_since = None
                else:
                    # Hands absent — start or continue countdown
                    if self._hands_absent_since is None:
                        self._hands_absent_since = now
                    elapsed = now - self._hands_absent_since
                    if elapsed >= self._auto_log_delay_s:
                        # Countdown complete — commit log
                        self._state = "LOGGED"
                        self._last_logged_at = now
                        self._hands_absent_since = None
                        success = self._commit_log(trigger_type="auto_countdown")
                        if success:
                            self._log_count += 1
                            logger.info(
                                f"[CrateSM] ✅ AUTO-LOGGED #{self._log_count}  "
                                f"batch='{self._pending_batch_id}'  "
                                f"weight={self._pending_weight_g}g  "
                                f"(hands absent {elapsed:.1f}s)"
                            )
                            return f"logged: {self._pending_batch_id}"
                        else:
                            logger.error("[CrateSM] ❌ Log commit FAILED — "
                                        "check Express API connection and x-internal-key")
                            return "log_failed"

            return None

    def on_weight_reading(self, weight_g: int, grade: str) -> None:
        """
        Process a weight reading from the MQTT scale.

        Called from the MQTT client thread whenever a scale/data message
        is received.
        """
        with self._lock:
            self._pending_weight_g = weight_g
            self._pending_grade = grade
            self._weight_timestamp = time.time()
            logger.debug(
                f"[CrateSM] Weight received: {weight_g}g grade={grade}"
            )

    def manual_log_trigger(self) -> dict:
        """
        Manually trigger a log commit if the state machine is READY.
        Called from the /api/pipeline/manual-log endpoint (via Express HMI).

        Returns:
            {success: bool, batch_id: str|None, weight_g: int|None,
             grade: str|None, reason: str|None, missing: list[str],
             current_state: str}
        """
        with self._lock:
            if self._state != "READY":
                missing = []
                if self._pending_batch_id is None:
                    missing.append("batch_id")
                if self._pending_weight_g is None:
                    missing.append("weight")
                return {
                    "success": False,
                    "batch_id": self._pending_batch_id,
                    "weight_g": self._pending_weight_g,
                    "grade": self._pending_grade,
                    "reason": "not_ready",
                    "missing": missing,
                    "current_state": self._state,
                }

            self._state = "LOGGED"
            self._last_logged_at = time.time()
            self._hands_absent_since = None

            success = self._commit_log(trigger_type="manual_button")
            if success:
                self._log_count += 1
                logger.info(
                    f"[CrateSM] ✅ MANUAL-LOGGED #{self._log_count}  "
                    f"batch='{self._pending_batch_id}'  "
                    f"weight={self._pending_weight_g}g"
                )
            return {
                "success": success,
                "batch_id": self._pending_batch_id,
                "weight_g": self._pending_weight_g,
                "grade": self._pending_grade,
                "reason": None if success else "commit_failed",
                "missing": [],
                "current_state": self._state,
            }

    def get_state(self) -> dict:
        """Return the current state for WebSocket broadcast / dashboard."""
        with self._lock:
            countdown = 0.0
            if self._state == "READY" and self._hands_absent_since is not None:
                elapsed = time.time() - self._hands_absent_since
                countdown = round(max(0, self._auto_log_delay_s - elapsed), 1)
            return {
                "state": self._state,
                "batch_id": self._pending_batch_id,
                "batch_confidence": round(self._pending_confidence, 4),
                "weight_g": self._pending_weight_g,
                "grade": self._pending_grade,
                "countdown_seconds": countdown,
                "hands_present": self._hands_present,
                "log_count": self._log_count,
                "cooldown_remaining_ms": max(
                    0,
                    int(
                        self.cooldown_ms
                        - (time.time() - self._last_logged_at) * 1000
                    ),
                )
                if self._state == "LOGGED"
                else 0,
            }

    def reset(self) -> None:
        """Force-reset the state machine to IDLE."""
        with self._lock:
            self._state = "IDLE"
            self._pending_batch_id = None
            self._pending_confidence = 0.0
            self._pending_weight_g = None
            self._pending_grade = "PENDING_FORMULA"
            self._batch_timestamp = 0.0
            self._weight_timestamp = 0.0
            self._hands_absent_since = None
            self._hands_present = False
            logger.info("[CrateSM] Reset to IDLE")

    # ── internal ──────────────────────────────────────────────────────

    def _commit_log(self, trigger_type: str = "auto_countdown") -> bool:
        """
        Write crate log to the OCR pipeline's own database (operations_log).
        Also attempts Express API as secondary path.
        """
        batch_id = self._pending_batch_id
        weight_g = self._pending_weight_g
        grade = self._pending_grade
        confidence = self._pending_confidence

        if batch_id is None or weight_g is None:
            logger.error("[CrateSM] Cannot commit log — missing data")
            return False

        success = False

        # ── primary: write directly to operations_log via SQL ─────
        try:
            from database.repository import DatabaseRepository
            repo = DatabaseRepository()
            if repo.db:
                from sqlalchemy import text
                repo.db.execute(
                    text(
                        "INSERT INTO operations_log "
                        "(batch_id, device_id, weight_g, grade, ocr_text, "
                        "ocr_confidence, audit_status, timestamp, metadata) "
                        "VALUES (:bid, :did, :wg, :gr, :ot, :oc, :as, NOW(), :md)"
                    ),
                    {
                        "bid": batch_id,
                        "did": "scale1",
                        "wg": weight_g,
                        "gr": grade,
                        "ot": batch_id,
                        "oc": confidence,
                        "as": "pending",
                        "md": json.dumps({
                            "capture_trigger": trigger_type,
                            "zone1_status": "clear",
                            "zone2_status": "occupied",
                        }),
                    },
                )
                repo.commit()
                logger.info(f"[CrateSM] ✅ Logged to operations_log: batch='{batch_id}' weight={weight_g}g")
                success = True
        except Exception as e:
            logger.error(f"[CrateSM] operations_log insert failed: {e}")

        # ── secondary: POST to Express API (best-effort) ──────────
        try:
            payload = {
                "device_id": "scale1",
                "batch_id": batch_id,
                "crate_weight_g": weight_g,
                "grade": grade,
                "zone1_status": "clear",
                "zone2_status": "occupied",
                "ocr_extracted_id": batch_id,
                "ocr_confidence": round(confidence * 100, 2),
                "capture_trigger": trigger_type,
                "captured_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            }
            headers = {"Content-Type": "application/json"}
            if self.express_api_token:
                headers["x-internal-key"] = self.express_api_token
            resp = requests.post(
                f"{self.express_api_url}/api/crate-logs",
                json=payload, headers=headers, timeout=5,
            )
            if resp.status_code in (200, 201):
                logger.info(f"[CrateSM] Also logged to Express: {resp.json()}")
            else:
                logger.debug(f"[CrateSM] Express API returned {resp.status_code} (non-critical)")
        except Exception:
            pass  # Express is optional

        return success
