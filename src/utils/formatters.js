/* ──────────────────────────────────────────────────────────────────────────
 * Legacy per-pineapple grading (superseded — kept for reference only)
 *
 * OLD client spec (pre crate/bin rescoping):
 *   < 1200g           → Light
 *   1200–1500g (incl.) → Grade 1
 *   > 1500g           → Heavy
 *
 * DO NOT APPLY THESE THRESHOLDS TO CRATE WEIGHTS — they will misgrade every
 * reading. See gradeCrate() below for the swappable crate-grading function.
 * ────────────────────────────────────────────────────────────────────────── */

export const GRADE_THRESHOLDS = {
  LIGHT_MAX_G: 1200,
  HEAVY_MIN_G: 1500,
};

/**
 * Map a single-pineapple weight in grams to a grade code.
 * @deprecated Use gradeCrate() for crate/bin weights. This function only
 *             applies to the old per-item measurement model and will produce
 *             wrong results on multi-kilogram crate totals.
 * @param {number} weightGrams - weight in grams (single pineapple)
 * @returns {'light' | 'grade_1' | 'heavy' | 'invalid'}
 */
export function classifyWeight(weightGrams) {
  if (weightGrams == null || weightGrams < 0) return 'invalid';
  if (weightGrams < GRADE_THRESHOLDS.LIGHT_MAX_G) return 'light';
  if (weightGrams > GRADE_THRESHOLDS.HEAVY_MIN_G) return 'heavy';
  return 'grade_1';
}

/* ──────────────────────────────────────────────────────────────────────────
 * Crate/bin grading (current model — forge.md §2)
 *
 * PLACEHOLDER FORMULA — the actual crate-grade thresholds have NOT yet been
 * specified by the client or hackathon judges. This pure function exists so
 * the real formula can be swapped in without touching UI code. Until then,
 * it returns a clearly flagged placeholder result.
 *
 * Expected inputs once confirmed:
 *   - weightGrams: total crate mass from scale (always required)
 *   - itemCount:  number of pineapples in the crate (optional — from camera
 *                 or manual entry; degrades gracefully when absent)
 *
 * Do NOT deploy to production with this placeholder active — it will grade
 * every crate as "PENDING_FORMULA."
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Grade a crate/bin based on total weight and optional item count.
 *
 * This is a SWAPPABLE PURE FUNCTION — replace its body with the confirmed
 * grading formula once specified. No UI code depends on the internal logic.
 *
 * @param {number} weightGrams — total crate mass in grams
 * @param {number} [itemCount] — optional number of pineapples in the crate
 * @returns {string} grade code for UI display
 */
export function gradeCrate(weightGrams, itemCount) {
  if (weightGrams == null || weightGrams <= 0) return 'invalid';

  // ── PLACEHOLDER — replace with confirmed crate-grading thresholds ──
  // The following is a deliberately naive placeholder that will grade
  // every crate as "PENDING_FORMULA" so no one mistakes it for real.
  // Once the client confirms the actual formula, replace this block.
  return 'PENDING_FORMULA';

  /* Example of what the confirmed formula might look like:
  if (itemCount != null && itemCount > 0) {
    const avgG = weightGrams / itemCount;
    if (avgG < 1100) return 'light';
    if (avgG <= 1600) return 'grade_1';
    return 'heavy';
  }
  // No item count — grade by total crate weight bands (TBD):
  return 'grade_1';
  */
}

/**
 * Crate-grade display labels.
 * @param {string} code — from gradeCrate() or firmware grade field
 * @returns {string} human-readable label
 */
export function crateGradeLabel(code) {
  const labels = {
    PENDING_FORMULA: 'FORMULA PENDING',
    light: 'Light',
    grade_1: 'Grade 1',
    heavy: 'Heavy',
    invalid: '--',
  };
  return labels[code] || code || '--';
}

/* ──────────────────────────────────────────────────────────────────────────
 * Shared display helpers (used by both legacy and crate grading)
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Human-readable grade label for UI display (legacy per-pineapple).
 * @deprecated Use crateGradeLabel() for crate/bin grades.
 * @param {string} gradeCode - raw grade string from firmware or classifyWeight()
 * @returns {string}
 */
export function gradeLabel(gradeCode) {
  const labels = {
    light: 'Light',
    grade_1: 'Grade 1',
    heavy: 'Heavy',
    invalid: '--',
    PENDING_FORMULA: 'FORMULA PENDING',
  };
  return labels[gradeCode] || '--';
}

/**
 * Format grams to kilograms display string.
 * @param {number} grams - weight in grams
 * @returns {string} e.g. "1.42"
 */
export function gramsToKg(grams) {
  if (grams == null || grams < 0) return '0.000';
  return (grams / 1000).toFixed(3);
}

/**
 * Format a number with locale string (thousands separators).
 * @param {number} n
 * @returns {string}
 */
export function formatNumber(n) {
  if (n == null) return '0';
  return n.toLocaleString('en-US');
}

/**
 * Format a percentage string.
 * @param {number} value - e.g. 0.9984
 * @returns {string} e.g. "99.84%"
 */
export function formatPercent(value) {
  if (value == null) return '0%';
  return (value * 100).toFixed(2) + '%';
}

/**
 * Map dBm RSSI to signal bar count (0–5).
 * Per BUILD_SPEC.md [INFERRED] mapping:
 *   ≥ -50 = 5, -50 to -60 = 4, -60 to -70 = 3,
 *   -70 to -80 = 2, -80 to -90 = 1, < -90 = 0
 * @param {number} dBm
 * @returns {{ bars: number, label: string }}
 */
export function signalStrength(dBm) {
  if (dBm == null) return { bars: 0, label: 'No Signal' };
  if (dBm >= -50) return { bars: 5, label: 'Excellent' };
  if (dBm >= -60) return { bars: 4, label: 'Excellent' };
  if (dBm >= -70) return { bars: 3, label: 'Good' };
  if (dBm >= -80) return { bars: 2, label: 'Fair' };
  if (dBm >= -90) return { bars: 1, label: 'Weak' };
  return { bars: 0, label: 'No Signal' };
}
