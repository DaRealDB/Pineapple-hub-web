@echo off
echo ============================================
echo   Pineapple Hub — Starting All Services
echo ============================================
echo.

cd /d "%~dp0"

REM ── 1. MQTT Broker ──────────────────────────────────────────
echo [1/6] Starting MQTT broker (ws://127.0.0.1:9001, tcp://0.0.0.0:1884) ...
start "MQTT Broker" cmd /c "cd node-red && node broker.js"

REM ── 2. Seed Data Publisher ───────────────────────────────────
echo [2/6] Starting seed data publisher ...
start "Seed Data" cmd /c "cd node-red && node seed-data.js"

REM ── 3. Node-RED (monitoring flows) ───────────────────────────
echo [3/6] Starting Node-RED (http://127.0.0.1:1881) ...
start "Node-RED" cmd /c "cd node-red && npx node-red --settings settings.js --flows flows.json"

REM ── 4. Express Backend (auth, API, DB) ──────────────────────
echo [4/6] Starting Express backend (http://localhost:3001) ...
start "Express API" cmd /c "cd backend && npm run dev"

REM ── 5. OCR Backend ──────────────────────────────────────────
echo [5/6] Starting OCR Pipeline backend (http://127.0.0.1:8000) ...
start "OCR Backend" cmd /c "python backend/main.py"

REM ── 6. React Frontend ───────────────────────────────────────
echo [6/6] Starting React frontend (http://localhost:5173) ...
start "React App" cmd /c "npm run dev"

echo.
echo All services launching in separate windows.
echo.
echo   MQTT Broker    : ws://127.0.0.1:9001  (tcp://0.0.0.0:1884)
echo   Node-RED       : http://127.0.0.1:1881
echo   Express API    : http://localhost:3001
echo   OCR Backend    : http://127.0.0.1:8000
echo   React App      : http://localhost:5173
echo.
echo   PostgreSQL must already be running on :5432
echo   Default login: admin@pineapple-hub.local / admin123
echo.
echo Close each window to stop that service.
pause
