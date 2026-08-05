/**
 * Seed data publisher for Pineapple Hub.
 *
 * Publishes simulated scale data to the Aedes MQTT broker so the web app
 * has live telemetry even when the ESP32 hardware isn't connected.
 *
 * Start with:  node seed-data.js
 * Stop with:   Ctrl+C
 */

const mqtt = require('mqtt');

const BROKER = 'mqtt://127.0.0.1:1884';
const INTERVAL_MS = 2000;

const client = mqtt.connect(BROKER);

client.on('connect', () => {
  console.log('[seed] Connected to MQTT broker');

  // Publish availability (retained — survives disconnects)
  client.publish('pineapple/scale1/availability', 'online', { retain: true, qos: 1 });
  console.log('[seed] Published pineapple/scale1/availability = online (retained)');

  // Publish zone defaults
  client.publish('pineapple/vision/zone1', 'clear');
  client.publish('pineapple/vision/zone2', 'clear');
  console.log('[seed] Published vision zones = clear');

  // Start publishing weight data on interval
  let count = 0;
  setInterval(() => {
    count++;
    const baseWeight = 14000 + Math.sin(Date.now() / 5000) * 2000;
    const jitter = (Math.random() - 0.5) * 200;
    const weightG = Math.round(baseWeight + jitter);

    const grades = ['grade_1', 'grade_1', 'grade_1', 'light', 'heavy'];
    const grade = grades[Math.floor(Math.random() * grades.length)];

    const payload = JSON.stringify({
      weight_g: weightG,
      grade: grade,
      status: {
        hx711_fault: false,
        eth_or_wifi_issue: false,
      },
      ts: Date.now(),
    });

    client.publish('pineapple/scale1/data', payload, { qos: 1 });
    console.log(`[seed] #${count} weight=${weightG}g grade=${grade}`);
  }, INTERVAL_MS);
});

client.on('error', (err) => {
  console.error('[seed] MQTT error:', err.message);
});

client.on('close', () => {
  console.log('[seed] Disconnected from broker');
});

console.log('[seed] Starting Pineapple Hub seed data publisher...');
console.log(`[seed] Broker: ${BROKER}, interval: ${INTERVAL_MS}ms`);
