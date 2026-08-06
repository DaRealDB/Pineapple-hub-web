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

    // Publish command to MQTT
    const published = publishCommand(device_id, action);
    if (!published) {
      return res.status(503).json({ error: 'MQTT broker not connected' });
    }

    // Log the command
    const { rows: logRows } = await query(
      `INSERT INTO grading.hmi_command_log (device_id, user_id, action)
       VALUES ($1, $2, $3) RETURNING id`,
      [devices[0].id, req.user.id, action]
    );

    res.json({
      ok: true,
      command_id: logRows[0].id,
      device_id,
      action,
      status: 'pending',
    });
  } catch (err) {
    console.error('[HMI] Command error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
