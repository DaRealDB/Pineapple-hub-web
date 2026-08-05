@echo off
echo ============================================
echo   Pineapple Hub — Starting All Services
echo ============================================
echo.

cd /d "%~dp0"

REM ── 1. MQTT Broker ──────────────────────────────────────────
echo [1/5] Starting MQTT broker (ws://127.0.0.1:9001, tcp://0.0.0.0:1884) ...
start "MQTT Broker" cmd /c "cd node-red && node broker.js"

REM ── 2. Seed Data Publisher ───────────────────────────────────
echo [2/5] Starting seed data publisher ...
start "Seed Data" cmd /c "cd node-red && node seed-data.js"

REM ── 3. Node-RED (monitoring flows) ───────────────────────────
echo [3/5] Starting Node-RED (http://127.0.0.1:1881) ...
start "Node-RED" cmd /c "cd node-red && npx node-red --settings settings.js --flows flows.json"

REM ── 4. OCR Backend ──────────────────────────────────────────
echo [4/5] Starting OCR Pipeline backend (http://127.0.0.1:8000) ...
start "OCR Backend" cmd /c "python backend/main.py"

REM ── 5. React Frontend ───────────────────────────────────────
echo [5/5] Starting React frontend (http://localhost:5173) ...
start "React App" cmd /c "npm run dev"

echo.
echo All services launching in separate windows.
echo.
echo   MQTT Broker   : ws://127.0.0.1:9001  (tcp://0.0.0.0:1884)
echo   Seed Data     : publishing every 2s
echo   Node-RED      : http://127.0.0.1:1881
echo   OCR Backend   : http://127.0.0.1:8000
echo   React App     : http://localhost:5173
echo.
echo Close each window to stop that service.
pause
