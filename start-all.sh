#!/usr/bin/env bash
# Pineapple Hub — Start All Services (Unix / Git Bash / WSL)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "============================================"
echo "  Pineapple Hub — Starting All Services"
echo "============================================"
echo ""

# ── 1. MQTT Broker ───────────────────────────────────────────────
echo "[1/4] Starting MQTT broker (ws://127.0.0.1:9001) ..."
(cd node-red && node broker.js) &
BROKER_PID=$!

# ── 2. Node-RED Seed Data ────────────────────────────────────────
echo "[2/4] Starting Node-RED seed data (http://127.0.0.1:1881) ..."
(cd node-red && npx node-red --settings settings.js --flows flows.json) &
NODERED_PID=$!

# ── 3. OCR Backend ───────────────────────────────────────────────
echo "[3/4] Starting OCR Pipeline backend (http://127.0.0.1:8000) ..."
python backend/main.py &
OCR_PID=$!

# ── 4. React Frontend ────────────────────────────────────────────
echo "[4/4] Starting React frontend (http://localhost:5173) ..."
npm run dev &
REACT_PID=$!

echo ""
echo "All services running. PIDs:"
echo "  MQTT Broker : $BROKER_PID"
echo "  Node-RED    : $NODERED_PID"
echo "  OCR Backend : $OCR_PID"
echo "  React App   : $REACT_PID"
echo ""
echo "  MQTT Broker  : ws://127.0.0.1:9001"
echo "  Node-RED     : http://127.0.0.1:1881"
echo "  OCR Backend  : http://127.0.0.1:8000"
echo "  React App    : http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all services."

# Cleanup on Ctrl+C
trap "kill $BROKER_PID $NODERED_PID $OCR_PID $REACT_PID 2>/dev/null; exit 0" INT TERM
wait
