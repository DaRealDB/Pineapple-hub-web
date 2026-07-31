/**
 * Grade mapping — the single authoritative source for grading logic.
 * Per README.md client spec:
 *   < 1200g           → Light
 *   1200–1500g (incl.) → Grade 1
 *   > 1500g           → Heavy
 */

export const GRADE_THRESHOLDS = {
  LIGHT_MAX_G: 1200,
  HEAVY_MIN_G: 1500,
};

/**
 * Map a weight in grams to a grade code.
 * @param {number} weightGrams - weight in grams
 * @returns {'light' | 'grade_1' | 'heavy' | 'invalid'}
 */
export function classifyWeight(weightGrams) {
  if (weightGrams == null || weightGrams < 0) return 'invalid';
  if (weightGrams < GRADE_THRESHOLDS.LIGHT_MAX_G) return 'light';
  if (weightGrams > GRADE_THRESHOLDS.HEAVY_MIN_G) return 'heavy';
  return 'grade_1';
}

/**
 * Human-readable grade label for UI display.
 * @param {string} gradeCode - raw grade string from firmware or classifyWeight()
 * @returns {string}
 */
export function gradeLabel(gradeCode) {
  const labels = {
    light: 'Light',
    grade_1: 'Grade 1',
    heavy: 'Heavy',
    invalid: '--',
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
