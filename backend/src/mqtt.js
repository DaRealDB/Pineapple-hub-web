import mqtt from 'mqtt';
import config from './config.js';

let client = null;

/**
 * Connect to the MQTT broker and set up subscriptions.
 * Called once at server startup.
 */
export function connectMqtt() {
  client = mqtt.connect(config.mqttBrokerUrl, {
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 10,
  });

  client.on('connect', () => {
    console.log('[MQTT] Backend connected to broker');
  });

  client.on('error', (err) => {
    console.error('[MQTT] Backend error:', err);
  });

  client.on('close', () => {
    console.warn('[MQTT] Backend disconnected');
  });
}

/**
 * Publish a command to a device's command topic.
 * Topic: pineapple/{device_id}/command
 * Payload: { action: 'power' | 'tare' | 'mode' | 'log_trigger' }
 *
 * @param {string} deviceId — e.g. 'scale1'
 * @param {'power' | 'tare' | 'mode' | 'log_trigger'} action
 * @returns {boolean} true if published, false if client not connected
 */
export function publishCommand(deviceId, action) {
  if (!client || !client.connected) {
    console.warn('[MQTT] Cannot publish — not connected');
    return false;
  }

  const topic = `pineapple/${deviceId}/command`;
  const payload = JSON.stringify({ action });
  client.publish(topic, payload, { qos: 1 });
  console.log(`[MQTT] Published ${topic} → ${payload}`);
  return true;
}
