/**
 * HMI Switch Panel configuration (forge.md §4).
 *
 * This is a PLACEHOLDER config array. The actual switch IDs, labels, and
 * functions have NOT yet been confirmed by the hardware team. Add/remove
 * entries once the physical switch assignments are finalized.
 *
 * The SwitchPanel component reads this array generically — no hardcoded
 * switch-specific logic exists in the component.
 *
 * @type {Array<{ id: string, label: string }>}
 */
export const switches = [
  {
    id: 'switch_1',
    label: 'PLACEHOLDER — confirm with hardware team',
  },
  // Add confirmed switches here, e.g.:
  // { id: 'conveyor_power', label: 'Conveyor Power' },
  // { id: 'scale_tare',     label: 'Scale Tare Reset' },
  // { id: 'camera_power',   label: 'AI Camera Power' },
];
