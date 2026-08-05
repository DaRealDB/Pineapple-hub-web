/**
 * Standalone Aedes MQTT broker with WebSocket support.
 *
 * Listens on:
 *   - Port 1883 (raw MQTT TCP)
 *   - Port 9001 (MQTT over WebSocket)
 *
 * The React app connects via: ws://127.0.0.1:9001
 * Node-RED publishes MQTT messages via: mqtt://127.0.0.1:1883
 *
 * Start with:  node broker.js
 */

const aedes = require('aedes')();
const net = require('net');
const http = require('http');
const ws = require('websocket-stream');

// ── MQTT over TCP (port 1883) ──────────────────────────────────────
const tcpServer = net.createServer(aedes.handle);
tcpServer.listen(1884, '127.0.0.1', () => {
  console.log('[broker] MQTT TCP listening on 127.0.0.1:1884');
});

// ── MQTT over WebSocket (port 9001) ────────────────────────────────
const httpServer = http.createServer();
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(9001, '127.0.0.1', () => {
  console.log('[broker] MQTT WebSocket listening on ws://127.0.0.1:9001');
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
