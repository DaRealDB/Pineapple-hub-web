import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/crate-logs
 * Query params: device_id, batch_id, from, to, limit (default 50), offset (default 0)
 * Requires: operations_log.view
 */
router.get('/', requirePermission('operations_log.view'), async (req, res) => {
  try {
    const {
      device_id,
      batch_id,
      from,
      to,
      limit = '50',
      offset = '0',
    } = req.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (device_id) {
      conditions.push(`d.device_id = $${idx++}`);
      values.push(device_id);
    }
    if (batch_id) {
      conditions.push(`cl.batch_id ILIKE $${idx++}`);
      values.push(`%${batch_id}%`);
    }
    if (from) {
      conditions.push(`cl.captured_at >= $${idx++}`);
      values.push(from);
    }
    if (to) {
      conditions.push(`cl.captured_at <= $${idx++}`);
      values.push(to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT cl.*, d.device_id AS device_id_text, d.label AS device_label
       FROM grading.crate_logs cl
       JOIN grading.devices d ON d.id = cl.device_id
       ${where}
       ORDER BY cl.captured_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, parseInt(limit, 10), parseInt(offset, 10)]
    );

    // Count total
    const { rows: countRows } = await query(
      `SELECT COUNT(*) AS total
       FROM grading.crate_logs cl
       JOIN grading.devices d ON d.id = cl.device_id
       ${where}`,
      values
    );

    res.json({
      logs: rows,
      total: parseInt(countRows[0].total, 10),
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  } catch (err) {
    console.error('[CrateLogs] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/crate-logs
 * Body: { device_id, batch_id?, crate_weight_g, grade, zone1_status, zone2_status,
 *         ocr_extracted_id?, ocr_confidence?, capture_trigger, captured_at }
 * Requires: any authenticated user (auto_zone capture) or hmi.log_trigger (manual_button)
 */
router.post('/', async (req, res, next) => {
  // manual_button requires explicit permission; auto_zone is allowed for any auth user
  if (req.body.capture_trigger === 'manual_button') {
    return requirePermission('hmi.log_trigger')(req, res, next);
  }
  next();
}, async (req, res) => {
  try {
    const {
      device_id,
      batch_id = null,
      crate_weight_g,
      grade,
      zone1_status,
      zone2_status,
      ocr_extracted_id = null,
      ocr_confidence = null,
      capture_trigger,
      captured_at,
    } = req.body;

    // Validate required fields
    if (!device_id || crate_weight_g == null || !grade || !zone1_status || !zone2_status || !capture_trigger) {
      return res.status(400).json({
        error: 'device_id, crate_weight_g, grade, zone1_status, zone2_status, and capture_trigger are required',
      });
    }

    // Resolve device UUID from device_id text
    const { rows: devices } = await query(
      'SELECT id FROM grading.devices WHERE device_id = $1',
      [device_id]
    );

    if (devices.length === 0) {
      return res.status(400).json({ error: `Device not found: ${device_id}` });
    }

    const deviceUuid = devices[0].id;

    const { rows } = await query(
      `INSERT INTO grading.crate_logs
       (device_id, batch_id, crate_weight_g, grade, zone1_status_at_capture,
        zone2_status_at_capture, ocr_extracted_id, ocr_confidence,
        capture_trigger, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        deviceUuid,
        batch_id,
        crate_weight_g,
        grade,
        zone1_status,
        zone2_status,
        ocr_extracted_id,
        ocr_confidence,
        capture_trigger,
        captured_at || new Date().toISOString(),
      ]
    );

    res.status(201).json({ log: rows[0] });
  } catch (err) {
    console.error('[CrateLogs] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
