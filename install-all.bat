@echo off
echo ============================================
echo   Pineapple Hub — Install All Dependencies
echo ============================================
echo.

cd /d "%~dp0"

echo [1/3] Installing frontend dependencies ...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo [2/3] Installing Node-RED dependencies ...
cd node-red
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node-RED npm install failed
    pause
    exit /b 1
)
cd ..

echo.
echo [3/3] Installing Python dependencies ...
pip install -r backend/requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: pip install had errors — check the output above
)

echo.
echo ============================================
echo   Setup complete!
echo.
echo   Next: copy .env.example to .env
echo         then run start-all.bat
echo ============================================
pause
