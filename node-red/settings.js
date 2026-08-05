/**
 * Node-RED settings for Pineapple Hub.
 *
 * Runs the Node-RED editor on port 1881 (not 1880) so the existing
 * Node-RED instance the app already references on :1880 isn't disturbed.
 * The embedded Aedes MQTT broker runs on port 9001 (WebSocket) so the
 * React app at ws://192.168.1.10:9001 connects without changes.
 */

module.exports = {
  // ── Editor ──────────────────────────────────────────────────────────
  uiPort: 1881,
  uiHost: '127.0.0.1',

  // ── Runtime ─────────────────────────────────────────────────────────
  flowFile: 'flows.json',
  userDir: __dirname,

  // ── Security (dev only — no auth) ───────────────────────────────────
  credentialSecret: false,

  // ── Logging ─────────────────────────────────────────────────────────
  logging: {
    console: {
      level: 'info',
      metrics: false,
      audit: false,
    },
  },

  // ── External modules ────────────────────────────────────────────────
  functionGlobalContext: {},

  // ── Editor customisation ────────────────────────────────────────────
  editorTheme: {
    projects: { enabled: false },
  },

  // ── Disable default MQTT broker on 1883 (Aedes node handles it) ───
  mqttReconnectTime: 15000,
  serialReconnectTime: 15000,
};
