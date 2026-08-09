# Dual-Trigger Crate Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-wave trigger with hand-absence 5s countdown + HMI manual log trigger that calls the state machine directly.

**Architecture:** CrateStateMachine gains a hand-absence countdown replacing the trigger-line crossing logic. A new `manual_log()` method allows immediate commit. Express HMI route calls a new OCR backend endpoint (`POST /api/pipeline/manual-log`) which invokes the state machine. Frontend HMIPanel shows richer feedback.

**Tech Stack:** Python/FastAPI (OCR backend), Express.js (API), React (frontend)

## Global Constraints

- `CRATE_AUTO_LOG_DELAY_SECONDS` defaults to 5, validator: 1-30
- Express→OCR backend calls use `x-internal-key` header for auth
- State machine must remain thread-safe (all public methods acquire `_lock`)
- `crate_state` WebSocket/SSE payload removes `trigger_line_x`/`trigger_line_approach`, adds `countdown_seconds`/`hands_present`
- Frontend supports both WebSocket and SSE transports

---

### Task 1: Config — Add delay setting, remove trigger line

**Files:**
- Modify: `backend/utils/config.py`
- Modify: `.env.backend`

**Interfaces:**
- Produces: `settings.CRATE_AUTO_LOG_DELAY_SECONDS` (int, default 5, range 1-30)

- [ ] **Step 1: Add `CRATE_AUTO_LOG_DELAY_SECONDS` to config.py**

In `backend/utils/config.py`, after the `CRATE_DATA_TTL_MS` block (line ~57), add:
```python
# Crate Auto-Log Delay (hand-absence countdown in seconds)
CRATE_AUTO_LOG_DELAY_SECONDS: int = 5
```
And its validator after `validate_crate_ttl` (after line ~222):
```python
@validator('CRATE_AUTO_LOG_DELAY_SECONDS')
def validate_auto_log_delay(cls, v):
    if not 1 <= v <= 30:
        raise ValueError('Auto-log delay must be between 1 and 30 seconds')
    return v
```

- [ ] **Step 2: Remove `TRIGGER_LINE_X` from config.py**

Delete line `TRIGGER_LINE_X: float = 0.6` and its validator `validate_trigger_line_x`.

- [ ] **Step 3: Update `.env.backend`**

Replace `TRIGGER_LINE_X=0.6` with `CRATE_AUTO_LOG_DELAY_SECONDS=5`.

---

### Task 2: CrateStateMachine — Replace hand-wave with hand-absence countdown + manual_log()

**Files:**
- Modify: `backend/core/crate_state_machine.py`

**Interfaces:**
- Consumes: `settings.CRATE_AUTO_LOG_DELAY_SECONDS`
- Produces: `CrateStateMachine.manual_log_trigger() -> dict`, updated `get_state() -> dict` with `countdown_seconds` and `hands_present`

- [ ] **Step 1: Update `__init__`**

Replace `self.trigger_line_x` initialization with:
```python
self._auto_log_delay_s = getattr(settings, "CRATE_AUTO_LOG_DELAY_SECONDS", 5)
```

Remove `self._prev_hand_centers` and `self._trigger_approach`. Add:
```python
self._hands_absent_since: Optional[float] = None
self._hands_present: bool = False
```

- [ ] **Step 2: Rewrite `on_yolo_detection()`**

Remove the entire "track hand positions for trigger line crossing" block (lines 113-156 of original) and "check trigger approach" block (lines 151-156). Remove `cross_detected` and `line_px` variables.

Replace the trigger section (lines 181-201 of original) with hand-absence countdown logic:

```python
# ── track hands present state ─────────────────────────────────────
self._hands_present = len(hands) > 0

# ── hand-absence countdown while READY ────────────────────────────
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
            success = self._commit_log()
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
                logger.error("[CrateSM] ❌ Log commit FAILED")
                return "log_failed"
```

Remove the old `cross_detected` trigger block.

Remove stale hand cleanup (`current_hand_ids` / `stale_ids` loop — no longer needed since we don't track per-hand centers).

- [ ] **Step 3: Add `manual_log_trigger()` method**

After `on_weight_reading()`, add:
```python
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

        success = self._commit_log()
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
```

- [ ] **Step 4: Update `get_state()`**

Replace `trigger_line_x` and `trigger_line_approach` fields with:
```python
"countdown_seconds": round(max(0, self._auto_log_delay_s - (time.time() - self._hands_absent_since)), 1)
if self._state == "READY" and self._hands_absent_since is not None
else 0,
"hands_present": self._hands_present,
```

- [ ] **Step 5: Update `reset()`**

Remove `self._prev_hand_centers.clear()` and `self._trigger_approach = False`.
Add:
```python
self._hands_absent_since = None
self._hands_present = False
```

- [ ] **Step 6: Update `_commit_log()` metadata**

Change `"capture_trigger": "hand_wave"` to `"capture_trigger": "auto_countdown"` in the operations_log insert.

Add a second commit path or a parameter so `manual_log_trigger` passes `"manual_button"` as the capture trigger. Simple approach: add a `trigger_type` parameter to `_commit_log(trigger_type="auto_countdown")`, defaulting to `"auto_countdown"`, and `manual_log_trigger` passes `"manual_button"`.

---

### Task 3: Pipeline module — State machine access + manual-log endpoint

**Files:**
- Modify: `backend/api/pipeline.py`

**Interfaces:**
- Consumes: `CrateStateMachine` from `backend/core/crate_state_machine.py`
- Produces: `get_active_state_machine()`, `POST /api/pipeline/manual-log` endpoint, updated `crate_state` broadcast payload

- [ ] **Step 1: Add module-level state machine reference**

At the top of `pipeline.py`, after imports and before route definitions (around line 83), add:
```python
from typing import Optional

_active_state_machine: Optional["CrateStateMachine"] = None

def get_active_state_machine():
    """Returns the active CrateStateMachine, or None if pipeline not running."""
    return _active_state_machine
```

- [ ] **Step 2: Set reference in pipeline_worker()**

In `pipeline_worker()`, after creating `state_machine` (around line 427), add:
```python
global _active_state_machine
_active_state_machine = state_machine
```

In the cleanup `finally` block of `pipeline_worker()` (around line 793), add:
```python
global _active_state_machine
_active_state_machine = None
```

- [ ] **Step 3: Add POST /api/pipeline/manual-log endpoint**

After the existing `/api/pipeline/metrics` endpoint (around line 327), add:
```python
class ManualLogResponse(BaseModel):
    success: bool
    batch_id: Optional[str] = None
    weight_g: Optional[int] = None
    grade: Optional[str] = None
    reason: Optional[str] = None
    missing: list = []
    current_state: Optional[str] = None

@router.post("/manual-log", response_model=ManualLogResponse)
async def manual_log_trigger():
    """
    Manually trigger a crate log commit if the state machine is READY.
    Called by the Express backend when the HMI LOG TRIGGER button is pressed.

    Protected by x-internal-key header (checked against settings).
    Returns 409 if state machine is not in READY state.
    """
    sm = get_active_state_machine()
    if sm is None:
        return ManualLogResponse(
            success=False,
            reason="pipeline_not_running",
            missing=["state_machine"],
            current_state="NONE",
        )

    result = sm.manual_log_trigger()

    if not result["success"]:
        raise HTTPException(status_code=409, detail=result)

    return ManualLogResponse(**result)
```

- [ ] **Step 4: Update crate_state SSE/WS broadcast payload**

In the `ocr_loop` of `pipeline_worker()`, where `crate_payload` is built (around line 740), the `get_state()` already returns the new fields (`countdown_seconds`, `hands_present`). No code change needed — `get_state()` dict is broadcast directly.

- [ ] **Step 5: Remove trigger line drawing from capture_loop**

Delete the trigger line drawing block (lines 504-511 in original):
```python
# ── draw trigger line ──────────────────────────────────
if state_machine:
    line_x = int(state_machine.trigger_line_x * frame.shape[1])
    ...
```

---

### Task 4: YOLO detector — Remove draw_trigger_line

**Files:**
- Modify: `backend/core/yolo_detector.py`

- [ ] **Step 1: Remove `draw_trigger_line()` method**

Delete lines 304-343 (the entire `draw_trigger_line` method).

---

### Task 5: Express HMI route — Call OCR backend on log_trigger

**Files:**
- Modify: `backend/src/routes/hmi.js`

**Interfaces:**
- Consumes: `http://localhost:8000/api/pipeline/manual-log` endpoint
- Produces: Updated `POST /api/hmi/command` response for `log_trigger` action

- [ ] **Step 1: Modify log_trigger handling in POST /api/hmi/command**

After the existing `publishCommand(device_id, action)` and DB audit log insert (around line 64-75), add a fetch to the OCR backend for `log_trigger`:

```javascript
// For log_trigger: also call the OCR backend to commit via state machine
let ocrResult = null;
if (action === 'log_trigger') {
  try {
    const resp = await fetch('http://localhost:8000/api/pipeline/manual-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_API_KEY || 'pineapple-internal-key-change-me',
      },
      body: JSON.stringify({ device_id }),
    });
    ocrResult = await resp.json();
  } catch (err) {
    console.warn('[HMI] OCR backend unreachable for manual log:', err.message);
    ocrResult = { success: false, reason: 'ocr_backend_unreachable' };
  }
}
```

Update the response to include `ocrResult`:
```javascript
res.json({
  ok: true,
  command_id: logRows[0].id,
  device_id,
  action,
  status: 'pending',
  ...(ocrResult ? { ocr_result: ocrResult } : {}),
});
```

---

### Task 6: Frontend HMIPanel — Enhanced LOG TRIGGER feedback

**Files:**
- Modify: `src/components/HMIPanel.jsx`

**Interfaces:**
- Consumes: `crate_state` from parent (LiveGrading) via `deviceState` prop or new prop
- Produces: Enhanced LOG TRIGGER button with readiness indicator and result feedback

- [ ] **Step 1: Add readiness indicator to LOG TRIGGER button**

The HMIPanel receives `deviceState` which currently is the MQTT device_state. We need to also pass `crateState` from the parent. Add a new prop `crateState` to HMIPanel.

In `HMIButton`, for the LOG TRIGGER action specifically, show readiness:
```jsx
// Before the button, check if crate data is ready
const isCrateReady = crateState?.state === 'READY';
const hasPartialData = crateState?.state === 'AWAITING_DATA';
```

Below the "PRESS" label, show:
```jsx
{isMomentary && action === 'log_trigger' && (
  <div className="flex items-center gap-1 mt-1">
    <div className={`w-2 h-2 rounded-full ${
      isCrateReady ? 'bg-[#10B981]' : hasPartialData ? 'bg-[#F59E0B]' : 'bg-[#6B7280]'
    }`} />
    <span className="text-[9px] text-on-surface-variant/60">
      {isCrateReady ? 'DATA READY' : hasPartialData ? 'PARTIAL' : 'NO DATA'}
    </span>
  </div>
)}
```

- [ ] **Step 2: Update `useApi` or HMI to pass through OCR result**

The Express HMI endpoint now returns `ocr_result` in the response. The frontend needs to display this. Update the `handleClick` in `HMIButton` to:
1. After getting the response, check `ocr_result`
2. If `ocr_result.success`: briefly show "LOGGED: BN" in green
3. If not: show reason in red

This requires the `publish` callback to return a result. Change the `publish` prop to be async:
```javascript
async function handleClick() {
  if (!isLive || pending) return;
  setPending(true);
  setTimedOut(false);
  try {
    const result = await publish(action);
    if (result?.ocr_result) {
      if (result.ocr_result.success) {
        setFeedback({ type: 'success', text: `LOGGED: ${result.ocr_result.batch_id}` });
      } else {
        setFeedback({ type: 'error', text: result.ocr_result.reason || 'FAILED' });
      }
    }
  } catch {
    setTimedOut(true);
  }
  // Clear feedback after 3s
  setTimeout(() => setFeedback(null), 3000);
}
```

Add a `feedback` state and display it below the button.

- [ ] **Step 3: Update LiveGrading to pass crateState to HMIPanel**

In `src/screens/LiveGrading.jsx`, find where `<HMIPanel` is rendered and add `crateState={crateState}` prop (already received from WebSocket/SSE).

---

### Task 7: Verification — Restart services and test

- [ ] **Step 1: Restart OCR backend**

Kill existing Python process on :8000 and restart:
```powershell
cd D:\gogel\pinefinal\Pineapple-hub-web
python backend/main.py
```

- [ ] **Step 2: Restart Express backend**

Kill existing Node process on :3001 and restart:
```powershell
cd D:\gogel\pinefinal\Pineapple-hub-web\backend
npm run dev
```

- [ ] **Step 3: Verify backend health**

```bash
curl http://localhost:8000/api/health
curl http://localhost:3001/api/health
```

- [ ] **Step 4: Verify crate_state payload has new fields**

Connect to WebSocket and check `crate_state` messages include `countdown_seconds` and `hands_present`.

- [ ] **Step 5: Manual test — auto-log on hand absence**

1. Show a crate to camera (YOLO detects box)
2. Ensure OCR extracts text
3. Ensure MQTT scale publishes weight
4. Remove hands from camera
5. Verify 5s countdown → log committed

- [ ] **Step 6: Manual test — HMI manual trigger**

1. Press LOG TRIGGER when state is READY
2. Verify immediate log commit
3. Press LOG TRIGGER when state is not READY
4. Verify error response with missing fields
