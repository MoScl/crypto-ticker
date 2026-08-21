@echo off
setlocal
cd /d "%~dp0"

call :main
set "EXIT_CODE=%errorlevel%"
echo.
echo ============================================
echo  Script finished. Exit code: %EXIT_CODE%
echo  Press any key to close this window...
echo ============================================
pause >nul
exit /b %EXIT_CODE%

:main

echo ============================================
echo   CryptoTicker Launcher
echo ============================================
echo.

REM ---- 1. Clean harmful env vars --------------------------------------
REM Some terminals/sandboxes inject NODE_OPTIONS (--use-system-ca is not
REM accepted by Electron) or ELECTRON_RUN_AS_NODE=1 (makes electron.exe
REM run as plain Node, so app is undefined). Remove them so the app
REM starts correctly from any entry point.
powershell -NoProfile -Command "Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue; Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue" >nul 2>&1

REM ---- 2. Kill leftover processes (port conflict is the #1 cause of
REM        "second launch fails") ----------------------------------------
echo [1/4] Cleaning up leftover processes...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING" 2^>nul') do (
  taskkill /F /PID %%p >nul 2>&1
)
taskkill /F /IM electron.exe >nul 2>&1

REM ---- 3. Install dependencies (first run only) -----------------------
if not exist "node_modules" (
  echo [2/4] First run: installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    echo Try setting a mirror and rerun:
    echo   set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    echo   npm install
    exit /b 1
  )
)

REM ---- 4. Apply Vite crypto patch (idempotent self-heal) --------------
echo [3/4] Ensuring Vite crypto patch...
call node scripts\fix-vite-crypto.cjs
if errorlevel 1 (
  echo [WARN] Patch script reported an error, continuing anyway.
)

REM ---- 5. Verify Electron binary --------------------------------------
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo [ERROR] electron.exe not found. Electron install is incomplete.
  echo Please delete node_modules and rerun this script.
  exit /b 1
)

REM ---- 6. Launch -------------------------------------------------------
echo [4/4] Starting application...
echo ============================================
echo  CryptoTicker is starting...
echo  Keep this window open while using the app.
echo  Close this window or press Ctrl+C to stop.
echo ============================================
echo.
call npm run dev

exit /b 0
