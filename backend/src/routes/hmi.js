import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { roleHasPermission } from '../middleware/rbac.js';
import { publishCommand } from '../mqtt.js';
import { query } from '../db.js';

const router = Router();

router.use(authenticate);

// Permission required per action
const ACTION_PERMISSION = {
  power: 'hmi.control',
  tare: 'hmi.control',
  mode: 'hmi.control',
  log_trigger: 'hmi.log_trigger',
};

/**
 * POST /api/hmi/command
 * Body: { device_id: string, action: 'power' | 'tare' | 'mode' | 'log_trigger' }
 *
 * Permission is checked per-action:
 *   power/tare/mode → hmi.control
 *   log_trigger     → hmi.log_trigger
 */
router.post('/command', async (req, res) => {
  try {
    const { device_id, action } = req.body;

    if (!device_id || !action) {
      return res.status(400).json({ error: 'device_id and action are required' });
    }

    const validActions = ['power', 'tare', 'mode', 'log_trigger'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`,
      });
    }

    // Check permission for this action
    const permKey = ACTION_PERMISSION[action];
    const allowed = await roleHasPermission(req.user.role, permKey);
    if (!allowed) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permKey,
        role: req.user.role,
      });
    }

    // Verify device exists
    const { rows: devices } = await query(
      'SELECT id FROM grading.devices WHERE device_id = $1',
      [device_id]
    );

    if (devices.length === 0) {
      return res.status(404).json({ error: `Device not found: ${device_id}` });
    }

    // Publish command to MQTT (best-effort for log_trigger, required for others)
    const published = publishCommand(device_id, action);
    if (!published && action !== 'log_trigger') {
      return res.status(503).json({ error: 'MQTT broker not connected' });
    }

    // Log the command
    const { rows: logRows } = await query(
      `INSERT INTO grading.hmi_command_log (device_id, user_id, action)
       VALUES ($1, $2, $3) RETURNING id`,
      [devices[0].id, req.user.id, action]
    );

    // For log_trigger: also call the OCR backend to commit via state machine
    let ocrResult = null;
    if (action === 'log_trigger') {
      try {
        const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'pineapple-internal-key-change-me';
        const resp = await fetch('http://localhost:8000/api/pipeline/manual-log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': INTERNAL_KEY,
          },
          body: JSON.stringify({ device_id }),
        });
        const raw = await resp.json();
        // FastAPI wraps HTTPException responses in {"detail": {...}} — unwrap it
        ocrResult = raw.detail || raw;
      } catch (err) {
        console.warn('[HMI] OCR backend unreachable for manual log:', err.message);
        ocrResult = { success: false, reason: 'ocr_backend_unreachable' };
      }
    }

    res.json({
      ok: true,
      command_id: logRows[0].id,
      device_id,
      action,
      status: 'pending',
      ...(ocrResult ? { ocr_result: ocrResult } : {}),
    });
  } catch (err) {
    console.error('[HMI] Command error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
