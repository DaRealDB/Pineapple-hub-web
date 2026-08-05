@echo off
echo ============================================
echo   Pineapple Hub — Starting All Services
echo ============================================
echo.

cd /d "%~dp0"

REM ── 1. MQTT Broker ──────────────────────────────────────────
echo [1/4] Starting MQTT broker (ws://127.0.0.1:9001) ...
start "MQTT Broker" cmd /c "cd node-red && node broker.js"

REM ── 2. Node-RED Seed Data ───────────────────────────────────
echo [2/4] Starting Node-RED seed data flow (http://127.0.0.1:1881) ...
start "Node-RED" cmd /c "cd node-red && npx node-red --settings settings.js --flows flows.json"

REM ── 3. OCR Backend ──────────────────────────────────────────
echo [3/4] Starting OCR Pipeline backend (http://127.0.0.1:8000) ...
start "OCR Backend" cmd /c "python backend/main.py"

REM ── 4. React Frontend ───────────────────────────────────────
echo [4/4] Starting React frontend (http://localhost:5173) ...
start "React App" cmd /c "npm run dev"

echo.
echo All services launching in separate windows.
echo.
echo   MQTT Broker  : ws://127.0.0.1:9001
echo   Node-RED     : http://127.0.0.1:1881
echo   OCR Backend  : http://127.0.0.1:8000
echo   React App    : http://localhost:5173
echo.
echo Close each window to stop that service.
pause
