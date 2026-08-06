@echo off
echo ============================================
echo   Pineapple Hub — Install All Dependencies
echo ============================================
echo.

cd /d "%~dp0"

echo [1/5] Installing frontend dependencies ...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo [2/5] Installing Node-RED dependencies ...
cd node-red
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node-RED npm install failed
    pause
    exit /b 1
)
cd ..

echo.
echo [3/5] Installing Express backend dependencies ...
cd backend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Backend npm install failed
    pause
    exit /b 1
)
cd ..

echo.
echo [4/5] Installing Python dependencies ...
pip install -r backend/requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: pip install had errors — check the output above
)

echo.
echo ============================================
echo   Setup complete!
echo.
echo   NEXT STEPS:
echo   1. Create the PostgreSQL database:
echo        psql -U postgres -c "CREATE DATABASE pineapple_hub;"
echo.
echo   2. Copy backend\.env.example to backend\.env
echo      and edit JWT_SECRET if needed.
echo.
echo   3. Run database migrations:
echo        cd backend ^&^& npm run migrate
echo.
echo   4. Then start everything:
echo        start-all.bat
echo ============================================
pause
