import { Router } from 'express';
import { ocrQuery, query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/analytics/weight-trend?days=7
 * Daily average crate weight over the time range.
 * Returns: [{ date: string, avg_weight_kg: number, crate_count: number }]
 */
router.get('/weight-trend', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7', 10);
    const { rows } = await ocrQuery(
      `SELECT
         DATE(timestamp) AS date,
         ROUND(AVG(weight_g)::numeric / 1000, 2) AS avg_weight_kg,
         COUNT(*)::int AS crate_count
       FROM operations_log
       WHERE timestamp >= NOW() - ($1 || ' days')::interval
         AND weight_g > 0
       GROUP BY DATE(timestamp)
       ORDER BY date ASC`,
      [days]
    );
    res.json({ data: rows, days });
  } catch (err) {
    console.error('[Analytics] weight-trend error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/throughput?days=7
 * Crate counts per grade, bucketed by day.
 * Returns: [{ date: string, grade: string, count: number }]
 */
router.get('/throughput', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7', 10);
    const { rows } = await ocrQuery(
      `SELECT
         DATE(timestamp) AS date,
         grade,
         COUNT(*)::int AS count
       FROM operations_log
       WHERE timestamp >= NOW() - ($1 || ' days')::interval
         AND weight_g > 0
       GROUP BY DATE(timestamp), grade
       ORDER BY date ASC, grade`,
      [days]
    );
    res.json({ data: rows, days });
  } catch (err) {
    console.error('[Analytics] throughput error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/grade-distribution?days=7
 * Overall grade breakdown as percentages.
 * Returns: [{ grade: string, count: number, percentage: number }]
 */
router.get('/grade-distribution', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7', 10);
    const { rows } = await ocrQuery(
      `SELECT
         grade,
         COUNT(*)::int AS count,
         ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS percentage
       FROM operations_log
       WHERE timestamp >= NOW() - ($1 || ' days')::interval
         AND weight_g > 0
       GROUP BY grade
       ORDER BY count DESC`,
      [days]
    );
    res.json({ data: rows, days });
  } catch (err) {
    console.error('[Analytics] grade-distribution error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/uptime?days=7
 * System uptime score based on MQTT availability events logged in hmi_command_log
 * and scale data continuity.
 *
 * Heuristic: percentage of expected polling intervals where scale data was received.
 * For now, uses operations_log timestamp density as a proxy for scale uptime.
 * Returns: { uptime_pct: number, total_expected_intervals: number, observed_intervals: number }
 */
router.get('/uptime', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7', 10);

    // Count distinct hours with at least one log entry as "up" hours
    const { rows } = await ocrQuery(
      `WITH hours_in_range AS (
         SELECT generate_series(
           date_trunc('hour', NOW() - ($1 || ' days')::interval),
           date_trunc('hour', NOW()),
           '1 hour'::interval
         ) AS hour
       ),
       up_hours AS (
         SELECT DISTINCT date_trunc('hour', timestamp) AS hour
         FROM operations_log
         WHERE timestamp >= NOW() - ($1 || ' days')::interval
       )
       SELECT
         (SELECT COUNT(*) FROM hours_in_range) AS total_hours,
         (SELECT COUNT(*) FROM up_hours) AS up_hours`,
      [days]
    );

    const totalHours = parseInt(rows[0]?.total_hours || 1, 10);
    const upHours = parseInt(rows[0]?.up_hours || 0, 10);
    const uptimePct = Math.round((upHours / totalHours) * 100);

    res.json({
      uptime_pct: uptimePct,
      total_expected_intervals: totalHours,
      observed_intervals: upHours,
      days,
    });
  } catch (err) {
    console.error('[Analytics] uptime error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
