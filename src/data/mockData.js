/**
 * Seed / mock data used ONLY as placeholder state when the MQTT broker is
 * unreachable. All values match BUILD_SPEC.md verbatim. Any field that has
 * a real MQTT source MUST be replaced by live data once the connection is
 * established — these values are visibly labeled as seed/demo in the UI.
 */

export const SEED_WEIGHT_G = 1420; // grams (1.42 kg)

export const SEED_GRADE = 'grade_1';

export const SEED_GRADE_DISPLAY = 'GRADE 1 (SUB-GRADE B)';

export const SEED_THROUGHPUT = {
  unitsProcessed: 12402,
  yieldAccuracy: 0.9984,
  avgCycleTime: 0.42,
};

export const SEED_BATCH_LOG = [
  { batchId: '#9422', weightKg: 1.42, timestamp: '10:42:01', status: 'Current' },
  { batchId: '#9421', weightKg: 1.39, timestamp: '10:41:59', status: 'Archive' },
  { batchId: '#9420', weightKg: 1.51, timestamp: '10:41:56', status: 'Archive' },
  { batchId: '#9419', weightKg: 1.48, timestamp: '10:41:54', status: 'Archive' },
];

export const SEED_DEVICES = [
  {
    id: 'ESP32-B-4F2A',
    label: 'Scale 04',
    sublabel: 'SC-004-B',
    online: true,
    dBm: -54,
    lastSeen: '2024-05-24 14:32:01',
  },
  {
    id: 'ESP32-C-8E11',
    label: 'Scale 05',
    sublabel: 'SC-005-C',
    online: true,
    dBm: -72,
    lastSeen: '2024-05-24 14:31:45',
  },
  {
    id: 'ESP32-D-9A24',
    label: 'Scale 06',
    sublabel: 'SC-006-D',
    online: false,
    dBm: null,
    lastSeen: '2024-05-24 13:15:10',
  },
];

export const SEED_OPERATIONS_LOG = [
  { ts: '2024-05-24 14:22:01', batchId: 'PN-BKD-1029', scaleId: 'SC-004-B', weightKg: 1.425, grade: 'grade-a', audit: 'verified' },
  { ts: '2024-05-24 14:21:44', batchId: 'PN-BKD-1029', scaleId: 'SC-004-B', weightKg: 1.390, grade: 'grade-a', audit: 'verified' },
  { ts: '2024-05-24 14:21:29', batchId: 'PN-BKD-1028', scaleId: 'SC-004-B', weightKg: 0.940, grade: 'rejected', audit: 'flagged' },
  { ts: '2024-05-24 14:21:12', batchId: 'PN-BKD-1028', scaleId: 'SC-004-B', weightKg: 1.550, grade: 'grade-b', audit: 'verified' },
  { ts: '2024-05-24 14:20:55', batchId: 'PN-BKD-1028', scaleId: 'SC-004-B', weightKg: 1.410, grade: 'grade-a', audit: 'verified' },
  { ts: '2024-05-24 14:20:30', batchId: 'PN-BKD-1028', scaleId: 'SC-004-B', weightKg: 1.285, grade: 'grade-b', audit: 'verified' },
  { ts: '2024-05-24 14:20:15', batchId: 'PN-BKD-1027', scaleId: 'SC-004-B', weightKg: 1.605, grade: 'grade-a', audit: 'pending' },
];

export const SEED_RECENT_EXPORTS = [
  { filename: 'daily_audit_2024-05-24.pdf', type: 'pdf', generatedBy: 'QA_Manager_01', date: '2024-05-24 14:30' },
  { filename: 'grade_export_may_2024.csv', type: 'csv', generatedBy: 'System_Auto', date: '2024-05-24 06:00' },
  { filename: 'device_downtime_weekly.csv', type: 'csv', generatedBy: 'Maintenance_03', date: '2024-05-23 18:00' },
  { filename: 'audit_summary_q2_2024.pdf', type: 'pdf', generatedBy: 'QA_Manager_01', date: '2024-05-22 09:15' },
  { filename: 'batch_traceability_may.csv', type: 'csv', generatedBy: 'System_Auto', date: '2024-05-21 23:59' },
];

export const SEED_STACKED_BAR = [
  { day: 'MON', g1: 60, g2: 25, rej: 5 },
  { day: 'TUE', g1: 55, g2: 30, rej: 8 },
  { day: 'WED', g1: 65, g2: 15, rej: 4 },
  { day: 'THU', g1: 70, g2: 20, rej: 2 },
  { day: 'FRI', g1: 50, g2: 40, rej: 10 },
];
