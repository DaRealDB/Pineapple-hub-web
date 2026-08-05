/**
 * Standalone Aedes MQTT broker with WebSocket support.
 *
 * Listens on:
 *   - Port 1884 (raw MQTT TCP, bound to 0.0.0.0 — reachable from ESP32)
 *   - Port 9001 (MQTT over WebSocket — React app connects here)
 *
 *   ESP32 firmware  →  mqtt://<laptop-ip>:1884
 *   React app       →  ws://127.0.0.1:9001
 *   Node-RED        →  mqtt://127.0.0.1:1884
 *
 * Start with:  node broker.js
 */

const aedes = require('aedes')();
const net = require('net');
const http = require('http');
const ws = require('websocket-stream');

// ── MQTT over TCP (port 1884, bind all interfaces for ESP32) ─────────
const tcpServer = net.createServer(aedes.handle);
tcpServer.listen(1884, '0.0.0.0', () => {
  console.log('[broker] MQTT TCP listening on 0.0.0.0:1884 (ESP32-ready)');
});

// ── MQTT over WebSocket (port 9001, bind all interfaces) ────────────
const httpServer = http.createServer();
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(9001, '0.0.0.0', () => {
  console.log('[broker] MQTT WebSocket listening on ws://0.0.0.0:9001');
});

// ── Events ─────────────────────────────────────────────────────────
aedes.on('client', (client) => {
  console.log(`[broker] Client connected: ${client ? client.id : 'unknown'}`);
});

aedes.on('clientDisconnect', (client) => {
  console.log(`[broker] Client disconnected: ${client ? client.id : 'unknown'}`);
});

aedes.on('publish', (packet, client) => {
  if (client) {
    console.log(`[broker] Published: ${packet.topic} ← ${client.id}`);
  }
});

aedes.on('subscribe', (subscriptions, client) => {
  console.log(`[broker] Subscribed: ${subscriptions.map(s => s.topic).join(', ')} ← ${client.id}`);
});

console.log('[broker] Aedes MQTT broker started');
