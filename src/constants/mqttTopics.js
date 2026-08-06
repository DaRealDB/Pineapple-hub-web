/**
 * Single source of truth for every MQTT topic string used in the app.
 * Per forge.md §5 — no component or hook should hardcode a topic literal;
 * import from here instead.
 *
 * When hardware/firmware teams finalize the actual topic names, change them
 * here and the entire app remaps in one edit.
 */

/* ── Scale telemetry (existing, per README.md contract) ── */

/** Subscription wildcard — covers all scale1 subtopics */
export const TOPIC_SCALE1_WILDCARD = 'pineapple/scale1/#';

/** Retained, QoS 1 — "online" | "offline" */
export const TOPIC_SCALE1_AVAILABILITY = 'pineapple/scale1/availability';

/** Not retained, QoS 1 — JSON { weight_g, grade, status: { hx711_fault, eth_or_wifi_issue }, ts } */
export const TOPIC_SCALE1_DATA = 'pineapple/scale1/data';

/* ── AI camera vision zones (forge.md §3, placeholder contract) ── */

/** Not retained, QoS 1 — "occupied" | "clear" — hand/forklift at the scale */
export const TOPIC_VISION_ZONE1 = 'pineapple/vision/zone1';

/** Not retained, QoS 1 — "occupied" | "clear" — hand/forklift at the bin/crate */
export const TOPIC_VISION_ZONE2 = 'pineapple/vision/zone2';

/* ── Physical switch HMI (forge.md §4, placeholder contract) ── */

/** Wildcard subscription — covers all switch state topics */
export const TOPIC_HMI_STATE_WILDCARD = 'pineapple/hmi/+/state';

/**
 * Build a switch state topic from the switch config.
 * @param {string} switchId — e.g. "switch_1"
 * @returns {string} e.g. "pineapple/hmi/switch_1/state"
 */
export function hmiStateTopic(switchId) {
  return `pineapple/hmi/${switchId}/state`;
}

/**
 * Build a switch command topic from the switch config.
 * @param {string} switchId — e.g. "switch_1"
 * @returns {string} e.g. "pineapple/hmi/${switchId}/set"
 */
export function hmiSetTopic(switchId) {
  return `pineapple/hmi/${switchId}/set`;
}

/* ── Device command + state (Part 3: HMI remote control) ── */

/** App → Firmware — command payload. Not retained, QoS 1 */
export function deviceCommandTopic(deviceId) {
  return `pineapple/${deviceId}/command`;
}

/** Firmware → App — device state confirmation. Not retained, QoS 1 */
export const TOPIC_SCALE1_DEVICE_STATE = 'pineapple/scale1/device_state';
