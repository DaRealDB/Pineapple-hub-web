import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

// All device routes require authentication
router.use(authenticate);

/**
 * GET /api/devices
 * Returns all devices, ordered by created_at.
 */
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM grading.devices ORDER BY created_at DESC'
    );
    res.json({ devices: rows });
  } catch (err) {
    console.error('[Devices] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/devices
 * Body: { device_id, label, location_path, mqtt_topic_prefix }
 */
router.post('/', requirePermission('devices.manage'), async (req, res) => {
  try {
    const { device_id, label, location_path, mqtt_topic_prefix } = req.body;

    if (!device_id || !label || !location_path || !mqtt_topic_prefix) {
      return res.status(400).json({
        error: 'device_id, label, location_path, and mqtt_topic_prefix are required',
      });
    }

    const { rows } = await query(
      `INSERT INTO grading.devices (device_id, label, location_path, mqtt_topic_prefix)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [device_id, label, location_path, mqtt_topic_prefix]
    );

    res.status(201).json({ device: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A device with that device_id already exists' });
    }
    console.error('[Devices] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/devices/:id
 * Body: any of { device_id, label, location_path, mqtt_topic_prefix, is_active }
 */
router.put('/:id', requirePermission('devices.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['device_id', 'label', 'location_path', 'mqtt_topic_prefix', 'is_active'];
    const sets = [];
    const values = [];
    let idx = 1;

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = $${idx++}`);
        values.push(req.body[f]);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    sets.push(`updated_at = now()`);
    values.push(id);

    const { rows } = await query(
      `UPDATE grading.devices SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ device: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A device with that device_id already exists' });
    }
    console.error('[Devices] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/devices/:id
 */
router.delete('/:id', requirePermission('devices.manage'), async (req, res) => {
  try {
    const { rows } = await query(
      'DELETE FROM grading.devices WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[Devices] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
