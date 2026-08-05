# Pineapple Hub — Setup Guide

Fresh clone to running app in under 10 minutes.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         YOUR NETWORK                              │
│                                                                  │
│  ┌──────────────┐                                               │
│  │  ESP32-P4     │  Ethernet (static IP 192.168.1.20)            │
│  │  HX711 + LCD  │                                              │
│  │  (firmware)   │──┐                                           │
│  └──────────────┘  │                                           │
│                     │  mqtt://192.168.1.10:1884                  │
│  ┌──────────────────┼──────────────────────────────────────────┐ │
│  │            YOUR LAPTOP                                      │ │
│  │                  │                                          │ │
│  │  ┌─────────┐    │    ┌──────────┐    ┌──────────────┐      │ │
│  │  │  React   │   │    │ Node-RED │    │  OCR Backend │      │ │
│  │  │  :5173   │   │    │  :1881   │    │   :8000      │      │ │
│  │  │  (Vite)  │   │    │ (flows)  │    │ (FastAPI+WS) │      │ │
│  │  └────┬─────┘   │    └────┬─────┘    └──────┬───────┘      │ │
│  │       │          │         │                 │              │ │
│  │       │  ws://   │   mqtt://   mqtt://       │              │ │
│  │       └──────────┼─────────┼─────────────────┘              │ │
│  │                  │         │                                │ │
│  │           ┌──────┴─────────┴──────┐                         │ │
│  │           │        Aedes          │                         │ │
│  │           │     MQTT Broker       │                         │ │
│  │           │  0.0.0.0:9001 (WS)    │                         │ │
│  │           │  0.0.0.0:1884 (TCP)   │                         │ │
│  │           └───────────────────────┘                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

| Service | Port | Tech | What it does |
|---------|------|------|-------------|
| React frontend | 5173 | Vite + React 19 | Dashboard, OCR pipeline UI, live grading |
| OCR backend | 8000 | Python FastAPI | Webcam capture, EasyOCR, WebSocket streaming |
| Node-RED | 1881 | Node-RED | Seed data generator, MQTT publisher |
| Aedes broker | 9001 (WS) / 1884 (TCP) | Aedes MQTT | Message broker — frontend connects via WebSocket |

---

## Prerequisites

Install these before anything else:

| Tool | Min version | Check with |
|------|-------------|------------|
| **Node.js** | 18+ | `node --version` |
| **Python** | 3.10+ | `python --version` |
| **pip** | (comes with Python) | `pip --version` |
| **Git** | any recent | `git --version` |

All commands below run from the project root unless stated otherwise.

---

## One-time setup

### 1. Clone and install frontend dependencies

```bash
git clone <repo-url> pineapple-hub-web
cd pineapple-hub-web
npm install
```

### 2. Install Node-RED and MQTT broker dependencies

```bash
cd node-red
npm install
cd ..
```

### 3. Install Python backend dependencies

```bash
pip install -r backend/requirements.txt
```

> **Note:** `easyocr` will download the English recognition model (~100 MB) on first use.
> `torch` may take a while to install. Consider using a virtual environment:
> ```bash
> python -m venv venv
> venv\Scripts\activate      # Windows
> source venv/bin/activate   # Unix
> pip install -r backend/requirements.txt
> ```

### 4. Configure environment variables

Copy the example env file and adjust if needed:

```bash
cp .env.example .env
```

The defaults work out of the box for local development. Edit `.env` if:
- Your MQTT broker runs on a different machine → change `VITE_MQTT_WS_URL`
- Your OCR backend runs on a different port → change `VITE_OCR_API_URL` and `VITE_OCR_WS_URL`

---

## Starting everything

### Option A: One-click (Windows)

Double-click `start-all.bat`. Four terminal windows open — one per service. Close each window to stop that service.

### Option B: One command (Unix / Git Bash)

```bash
bash start-all.sh
```

Press `Ctrl+C` to stop all services.

### Option C: Manual (four terminals)

If you prefer to see logs separately or need to debug one service:

**Terminal 1 — MQTT Broker:**
```bash
cd node-red
node broker.js
```

**Terminal 2 — Node-RED seed data:**
```bash
cd node-red
npx node-red --settings settings.js --flows flows.json
```

**Terminal 3 — OCR backend:**
```bash
python backend/main.py
```

**Terminal 4 — React frontend:**
```bash
npm run dev
```

---

## Verifying it works

1. Open **http://localhost:5173** in a browser
2. The **Live Grading** screen should show live weight data updating every 2 seconds
3. The **OCR Pipeline** screen should show a webcam feed (if a camera is connected) and the connection badge should be green
4. Open **http://127.0.0.1:1881** to see the Node-RED flow editor

### Quick health checks

```bash
# MQTT broker
curl http://127.0.0.1:9001  # Should respond (WebSocket upgrade)
# OCR backend
curl http://127.0.0.1:8000/api/health  # Should return {"status": "healthy", ...}
# React app
curl http://localhost:5173  # Should return HTML
```

---

## What each service does

### Aedes MQTT Broker (`node-red/broker.js`)

A lightweight MQTT broker with WebSocket support. The React app connects via `ws://127.0.0.1:9001`. Node-RED publishes seed data via `mqtt://127.0.0.1:1884`.

All telemetry uses the `pineapple/` topic prefix:
- `pineapple/scale1/availability` — `"online"` (retained, published once)
- `pineapple/scale1/data` — `{ weight_g, grade, status, ts }` (every 2 seconds)
- `pineapple/vision/zone1` — `"clear"` or `"occupied"` (manual via Node-RED inject)
- `pineapple/vision/zone2` — same as above
- `pineapple/hmi/+/state` — switch states (`"on"` / `"off"`)

### Node-RED (`node-red/`)

Provides the seed data generator. Open the editor at **http://127.0.0.1:1881** to:
- Click inject buttons to toggle vision zones
- Click switch state injects to test the HMI panel
- Modify the weight generation function for different test data
- Add new flows for additional MQTT topics

### OCR Backend (`backend/`)

Python FastAPI server handling:
- **`POST /api/webcam/start`** — opens the USB/IP webcam via OpenCV
- **`POST /api/pipeline/start`** — starts the capture → OCR → broadcast pipeline
- **`GET /api/webcam/stream`** — MJPEG live preview stream
- **`GET /api/health`** — health check
- **`WS /ws`** — WebSocket for real-time OCR results, pipeline status, and webcam frames

OCR uses EasyOCR with English language model. The pipeline: capture frame → resize to 320×240 → EasyOCR → dedup → broadcast result.

### React Frontend (`src/`)

Vite dev server on port 5173. Screens:
- **Live Grading** (`/`) — real-time weight, grade, zone indicators, batch log
- **Operations Log** (`/operations-log`)
- **Analytics** (`/analytics`)
- **Device Management** (`/devices`) — HMI Switch Panel
- **Reports** (`/reports`)
- **OCR Pipeline** (`/ocr-pipeline`) — webcam feed, live OCR results, image upload OCR

---

## Development workflow

```bash
# Day-to-day: just start what you need

# If working on the dashboard / live grading:
cd node-red && node broker.js       # Terminal 1
npm run dev                          # Terminal 2

# If working on OCR pipeline:
python backend/main.py               # Terminal 1
cd node-red && node broker.js       # Terminal 2
npm run dev                          # Terminal 3

# Full stack:
bash start-all.sh                    # or double-click start-all.bat
```

The React app hot-reloads on file changes. The OCR backend auto-reloads (`reload=True` in uvicorn). Node-RED watches its flows file.

---

## Connecting the ESP32 Firmware

The firmware is **already compatible** with the web app's MQTT topic structure.
Only two config constants in the firmware need to match your network:

### Firmware changes required

Open the firmware `.ino` file and update these two lines near the top:

```cpp
// Your laptop's IP address (run `ipconfig` on Windows to find it)
const char* MQTT_BROKER     = "192.168.1.10";  // ← CHANGE THIS

// Aedes broker TCP port (1884 — Mosquitto is on 1883)
const int   MQTT_PORT       = 1884;             // ← CHANGE FROM 1883
```

Everything else — topic names, payload format, JSON structure — matches the web app exactly:

```
ESP32 publishes                     Web App subscribes
─────────────────────────────────────────────────────────
pineapple/scale1/availability  →    pineapple/scale1/#
pineapple/scale1/data          →    pineapple/scale1/#
pineapple/scale1/device_state  →    pineapple/scale1/#  (ignored, but available)

Web App publishes                   ESP32
─────────────────────────────────────────────────────────
pineapple/hmi/{id}/set              (not consumed by firmware — use Node-RED to bridge)
```

### Verify the connection

1. Flash the firmware with updated `MQTT_BROKER` and `MQTT_PORT`
2. Open Serial Monitor (115200 baud) on the ESP32
3. You should see: `[MQTT] Connecting to 192.168.1.10:1884... connected`
4. Open the React app — the Live Grading screen should show live weight data
5. Open Node-RED at http://127.0.0.1:1881 — the debug sidebar shows raw ESP32 telemetry

### Switching between dev mode and production

**Dev mode (no ESP32 hardware):**
- The seed data generator (enabled by default) publishes fake crate weights every 2 seconds
- Vision zones can be toggled via inject buttons in Node-RED

**Production mode (ESP32 connected):**
- In Node-RED, double-click the seed data inject nodes and set "Enabled: false"
- The ESP32's real telemetry takes over
- Vision zones will be published by the AI camera system (future)

---

## Troubleshooting

### "Failed to fetch" error on OCR Pipeline screen

The Python backend isn't running or isn't reachable at `http://localhost:8000`.
```bash
# Check if it's running
curl http://127.0.0.1:8000/api/health
# Start it
python backend/main.py
```

### MQTT shows "offline" or "disconnected"

The Aedes broker isn't running.
```bash
# Check port
netstat -an | grep 9001       # Unix
netstat -ano | findstr 9001   # Windows
# Start it
cd node-red && node broker.js
```

### Webcam shows black or corrupted frames

1. Check if a USB webcam is connected (Windows: open Camera app to test)
2. Try changing the device index in `backend/utils/config.py` (`WEBCAM_DEVICE_INDEX`)
3. For IP camera: check the "Use IP Camera" box in the OCR Pipeline UI and enter the URL
4. The OCR path saves a debug frame on first pipeline start: check `backend/debug_ocr_frame.jpg`

### Port already in use

If port 1884, 8000, or 9001 is occupied:
- **1884**: change the port in `node-red/broker.js` and `node-red/flows.json`
- **8000**: change `WEBSOCKET_PORT` in `backend/utils/config.py` and update `.env`
- **9001**: change the port in `node-red/broker.js` and update `.env`

### EasyOCR model download

The first pipeline start downloads the English recognition model (~100 MB). This happens once and may take a minute. Subsequent starts are fast.

### Python import errors

Make sure you're running from the project root and the virtual environment is activated:
```bash
python -c "import fastapi; import cv2; import easyocr; print('All imports OK')"
```
