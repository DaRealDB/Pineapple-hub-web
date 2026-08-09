# Dual-Trigger Crate Logging — Design Spec

**Date:** 2026-08-07
**Status:** Approved

## Summary

Replace the hand-wave trigger with a two-way logging system:
1. **Auto:** 5-second hand-absence countdown — when the crate is detected, weight is stable, and OCR has extracted the batch ID, the system waits for hands to clear the camera. If no hands are detected for 5 continuous seconds, the log auto-commits.
2. **Manual:** HMI "LOG TRIGGER" button in the web UI directly triggers the state machine to commit immediately if all data is ready.

## Current vs New Flow

### State Machine

```
CURRENT:
  IDLE → AWAITING_DATA → READY → hand crosses trigger line → LOGGED → cooldown → IDLE

NEW:
  IDLE → AWAITING_DATA → READY → hands absent for 5s countdown → LOGGED → cooldown → IDLE
                                → manual_log() called via API  → LOGGED → cooldown → IDLE
```

### HMI Log Trigger

```
CURRENT:
  Web button → MQTT → ESP32 → MQTT data event (does not reach state machine)

NEW:
  Web button → Express /api/hmi/command
    ├── MQTT publish to ESP32 (keeps firmware LED feedback)
    └── HTTP POST to Python :8000/api/pipeline/manual-log
          → CrateStateMachine.manual_log()
          → commit if READY, return result
    → Express returns { ok, batch_id, weight_g } to frontend
```

## Changes by File

### 1. `backend/core/crate_state_machine.py` — Core Logic

**Remove:**
- Hand-crossing detection: `_prev_hand_centers` dict, `cross_detected` logic in `on_yolo_detection()`
- Trigger line approach: `_trigger_approach` field, approach margin calculation
- `trigger_line_x` field (moved to config but no longer needed)

**Add:**
- `_hands_absent_since: float | None` — timestamp when hands last became absent while READY
- `_auto_log_delay_seconds: int` — from config `CRATE_AUTO_LOG_DELAY_SECONDS` (default 5)
- Countdown logic in `on_yolo_detection()`:
  - When READY and `hands_present=false`: start/continue countdown from `_hands_absent_since`
  - When READY and `hands_present=true`: reset `_hands_absent_since = None`
  - When countdown reaches delay: commit log, transition to LOGGED
- `manual_log_trigger() -> dict` method:
  - If state is READY: commit immediately, return `{success: true, batch_id, weight_g, grade}`
  - If not READY: return `{success: false, reason: "not_ready", missing: [...], current_state}`
  - Resets `_hands_absent_since` after commit
- `get_state()` return dict: replace `trigger_line_x`/`trigger_line_approach` with `countdown_seconds` (float, 0 if not counting) and `hands_present` (bool from latest detection)

### 2. `backend/api/pipeline.py` — New Endpoint

**Add:** `POST /api/pipeline/manual-log`
- Protected by `x-internal-key` header (service-to-service, no JWT)
- Body: `{ device_id: "scale1" }`
- Calls `state_machine.manual_log()`
- Returns HTTP 200 with `{success, batch_id, weight_g, grade}` on success
- Returns HTTP 409 with `{success: false, reason, missing, current_state}` if not ready
- The `state_machine` reference is held in the pipeline worker's scope; expose via a module-level getter or pass to the router

### 3. `backend/src/routes/hmi.js` — Express HMI Route

**Change `log_trigger` action:**
- Keep existing: MQTT publish to ESP32 via `publishCommand()`
- Keep existing: DB audit log insert to `hmi_command_log`
- Add: HTTP POST to `http://localhost:8000/api/pipeline/manual-log` with `x-internal-key` header
- If OCR backend returns success: include `batch_id`, `weight_g` in response
- If OCR backend returns 409 (not ready): include `reason`, `missing` in response
- If OCR backend is unreachable: return `{ok: true, status: "mqtt_sent_only", warning: "OCR backend unreachable"}`
- MQTT + audit log still happen regardless (the firmware LED still flashes)

### 4. `backend/utils/config.py` — Config

**Add:**
```python
CRATE_AUTO_LOG_DELAY_SECONDS: int = 5
```
With validator: must be between 1 and 30.

**Remove:**
```python
TRIGGER_LINE_X: float = 0.6
```
And its validator.

### 5. `.env.backend` — Env Override

**Add:**
```
CRATE_AUTO_LOG_DELAY_SECONDS=5
```
**Remove:**
```
TRIGGER_LINE_X=0.6
```

### 6. `backend/core/yolo_detector.py` — Visual Cleanup

**Remove:** `draw_trigger_line()` method (lines 304-343)

### 7. `backend/api/pipeline.py` — Pipeline Worker

**Remove:** Trigger line drawing block (lines 504-511) from `capture_loop()` that calls `yolo_detector.draw_trigger_line()`

### 8. `src/components/HMIPanel.jsx` — Frontend

**Enhance LOG TRIGGER button:**
- Before press: show readiness indicator (green dot = state is READY, yellow = partial data, grey = no data)
- On success response: flash green with batch_id text briefly
- On failure response: flash red with reason text (e.g. "NO CRATE DETECTED")
- Read readiness from `crate_state` WebSocket/SSE messages

### 9. WebSocket/SSE Contract

**`crate_state` message payload changes:**
```json
{
  "state": "READY",
  "batch_id": "BN",
  "batch_confidence": 0.892,
  "weight_g": 1342,
  "grade": "grade_1",
  "countdown_seconds": 0,
  "hands_present": true,
  "log_count": 5,
  "cooldown_remaining_ms": 0
}
```
- Remove: `trigger_line_x`, `trigger_line_approach`
- Add: `countdown_seconds` (float, seconds remaining on countdown, 0 if not counting), `hands_present` (bool)

## State Machine States

| State | Meaning | countdown_seconds |
|-------|---------|-------------------|
| IDLE | No data cached | 0 |
| AWAITING_DATA | Partial (batch or weight only) | 0 |
| READY | Both batch + weight, hands present | 0 (waiting for hands to clear) |
| READY (hands absent) | Both batch + weight, no hands | 5 → 4 → ... → 0 → LOGGED |
| LOGGED | Entry committed, cooling down | 0 |

## Error Handling

- **OCR backend unreachable:** Express HMI falls back to MQTT-only, returns warning
- **State machine not ready:** Returns 409 with `missing` array so frontend can show what's needed
- **Countdown interrupted by hands:** Timer resets silently, no error — just wait again
- **Data TTL expiry:** If batch_id or weight expires during countdown (10s TTL), state drops back to AWAITING_DATA or IDLE, countdown cancels

## Implementation Note: State Machine Access

The state machine instance is currently a local variable in `pipeline_worker()`. To expose it to the `/api/pipeline/manual-log` endpoint, add a module-level reference in `pipeline.py`:

```python
# Module-level reference (set by pipeline worker, read by API endpoint)
_active_state_machine: Optional[CrateStateMachine] = None

def get_active_state_machine():
    """Returns the active state machine instance, or None if pipeline not running."""
    return _active_state_machine
```

The worker sets `_active_state_machine = state_machine` on start and `_active_state_machine = None` on stop. The `manual-log` endpoint calls `get_active_state_machine()`.

## Testing Approach

- Unit test `CrateStateMachine` state transitions for all paths (auto countdown, manual trigger, hand interruption, TTL expiry)
- Integration test Express → OCR backend manual-log endpoint
- Manual test: webcam showing crate + scale publishing weight → verify auto-log after hands clear for 5s
- Manual test: press LOG TRIGGER in UI while READY → verify immediate log commit
