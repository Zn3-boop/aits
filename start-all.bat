@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ==================== User Config ====================
set "BACKEND_PORT=8787"
set "FRONTEND_PORT=5174"
set "WHISPER_PORT=10095"
set "EMOTION_PORT=10096"

set "BACKEND_DIR=apps\server"
set "FRONTEND_DIR=apps\web"
set "WHISPER_SCRIPT=tools\faster-whisper-server.py"
set "EMOTION_SCRIPT=tools\emotion_service\main.py"

set "TITLE_BACKEND=AI-Backend-8787"
set "TITLE_FRONTEND=AI-Frontend-5174"
set "TITLE_WHISPER=AI-Whisper-10095"
set "TITLE_EMOTION=AI-Emotion-10096"
:: =====================================================

cd /d "%~dp0"
set "PROJECT_ROOT=%cd%"

:: ==================== Color Codes ====================
set "ESC=["
set "RED=%ESC%~1"
set "GREEN=%ESC%~2"
set "YELLOW=%ESC%~3"
set "BLUE=%ESC%~96m"
set "NC=%ESC~0m"

echo ========================================
echo   AI Companion System - Starting All
echo ========================================
echo.
echo Project: %PROJECT_ROOT%
echo Backend Port: %BACKEND_PORT%    Frontend Port: %FRONTEND_PORT%
echo STT Port: %WHISPER_PORT%         Emotion Port: %EMOTION_PORT%
echo.

:: ==================== 0. Check Python ====================
echo [0/6] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERR] Python not found! Please install Python 3.8+ from https://python.org
    pause
    exit /b 1
)
echo   [OK] Python found
for /f "delims=" %%i in ('python --version 2^>^&1') do set "PYTHON_VER=%%i"
echo   Version: !PYTHON_VER!

:: ==================== 1. Kill old processes ====================
echo.
echo [1/6] Cleaning old services...
for %%p in (%BACKEND_PORT% %FRONTEND_PORT% %WHISPER_PORT% %EMOTION_PORT%) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr /C:":%%p "') do (
        taskkill /F /PID %%a >nul 2>&1 && echo   Released port %%p ^(PID: %%a^)
    )
)
taskkill /FI "WINDOWTITLE eq %TITLE_BACKEND%" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq %TITLE_FRONTEND%" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq %TITLE_WHISPER%" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq %TITLE_EMOTION%" /T /F >nul 2>&1
timeout /t 2 >nul

:: ==================== 2. Check pnpm ====================
echo.
echo [2/6] Checking pnpm...
where pnpm >nul 2>&1
if errorlevel 1 (
    echo   pnpm not found, installing...
    echo   Using npm to install pnpm globally...
    call npm install -g pnpm
    if errorlevel 1 (
        echo [ERR] pnpm installation failed!
        pause
        exit /b 1
    )
    echo   [OK] pnpm installed
) else (
    echo   [OK] pnpm found
)
for /f "delims=" %%i in ('pnpm --version 2^>^&1') do set "PNPM_VER=%%i"
echo   Version: !PNPM_VER!

:: ==================== 3. Install Node.js dependencies ====================
echo.
echo [3/6] Installing Node.js dependencies...
if not exist "%PROJECT_ROOT%\node_modules" (
    echo   Running pnpm install...
    cd /d "%PROJECT_ROOT%"
    call pnpm install --force
    if errorlevel 1 (
        echo [ERR] pnpm install failed!
        pause
        exit /b 1
    )
    echo   [OK] Dependencies installed
) else (
    echo   [OK] node_modules already exists
)

:: Check if edge-tts npm package is installed (required by server)
if not exist "%PROJECT_ROOT%\apps\server\node_modules\edge-tts" (
    echo   Installing edge-tts for server...
    cd /d "%PROJECT_ROOT%\apps\server"
    call pnpm add edge-tts
)
echo   [OK] edge-tts package ready

:: ==================== 4. Setup Python venv and packages ====================
echo.
echo [4/6] Setting up Python environment...

:: Create venv if not exists
if not exist "%PROJECT_ROOT%\.venv\Scripts\python.exe" (
    echo   Creating Python virtual environment...
    python -m venv "%PROJECT_ROOT%\.venv"
    echo   [OK] Virtual environment created
)

:: Install Python packages using a loop approach to avoid parameter issues
set "PIP_VENV=%PROJECT_ROOT%\.venv\Scripts\pip.exe"

:: Define packages to install (space-separated)
set "PYTHON_PKGS=faster-whisper edge-tts uvicorn fastapi python-multipart mediapipe numpy opencv-python"

:: Process each package
for %%p in (%PYTHON_PKGS%) do (
    :: Check if already installed
    call "%PIP_VENV%" show %%p >nul 2>&1
    if not errorlevel 1 (
        echo   [OK] %%p already installed
    ) else (
        echo   Installing %%p...
        call "%PIP_VENV%" install %%p -i https://pypi.tuna.tsinghua.edu.cn/simple --no-cache-dir --default-timeout=300
        if errorlevel 1 (
            echo   Retry with Baidu mirror...
            call "%PIP_VENV%" install %%p -i https://mirror.baidu.com/pypi/simple --no-cache-dir --default-timeout=300
            if errorlevel 1 (
                echo   Retry with USTC mirror...
                call "%PIP_VENV%" install %%p -i https://pypi.mirrors.ustc.edu.cn/simple/ --no-cache-dir --default-timeout=300
                if errorlevel 1 (
                    echo   [WARN] Failed to install %%p
                ) else (
                    echo   [OK] %%p installed ^(USTC^)
                )
            ) else (
                echo   [OK] %%p installed ^(Baidu^)
            )
        ) else (
            echo   [OK] %%p installed ^(Tsinghua^)
        )
    )
)


:: ==================== 5. Start services ====================
echo.
echo [5/6] Starting services...

:: Copy .env.example to .env if not exists
if not exist "%PROJECT_ROOT%\.env" (
    echo   Creating .env from .env.example...
    if exist "%PROJECT_ROOT%\.env.example" (
        copy "%PROJECT_ROOT%\.env.example" "%PROJECT_ROOT%\.env" >nul
        echo   [OK] .env created
    )
)

:: Start Backend
echo.
echo   Starting Backend API on port %BACKEND_PORT%...
start "%TITLE_BACKEND%" cmd /k "title %TITLE_BACKEND% && cd /d "%PROJECT_ROOT%\%BACKEND_DIR%" && echo [Backend] Starting on port %BACKEND_PORT%... && pnpm dev"

timeout /t 3 >nul

:: Start Frontend
echo   Starting Frontend on port %FRONTEND_PORT%...
start "%TITLE_FRONTEND%" cmd /k "title %TITLE_FRONTEND% && cd /d "%PROJECT_ROOT%\%FRONTEND_DIR%" && echo [Frontend] Starting on port %FRONTEND_PORT%... && pnpm dev"

timeout /t 3 >nul

:: Start Faster-Whisper STT
echo   Starting Faster-Whisper STT on port %WHISPER_PORT%...
start "%TITLE_WHISPER%" cmd /k "title %TITLE_WHISPER% && cd /d "%PROJECT_ROOT%" && echo [STT] Starting whisper service... && call .venv\Scripts\activate.bat && python %WHISPER_SCRIPT%"

timeout /t 2 >nul

:: Start Emotion Service
echo   Starting Emotion Service on port %EMOTION_PORT%...
start "%TITLE_EMOTION%" cmd /k "title %TITLE_EMOTION% && cd /d "%PROJECT_ROOT%\tools\emotion_service" && echo [Emotion] Starting emotion inference... && call ..\..\.venv\Scripts\activate.bat && python main.py"

timeout /t 2 >nul

:: ==================== 6. Health check ====================
echo.
echo [6/6] Waiting for services to be ready ^(max 120s^)...
set "retries=0"
set "backend_ok="
set "frontend_ok="
set "whisper_ok="
set "emotion_ok="

:check_loop
set "all_ready=true"

:: Check Backend
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod 'http://localhost:%BACKEND_PORT%/health' -TimeoutSec 2 -UseBasicParsing; if($r.status -eq 'ok') { exit 0 } } catch {} exit 1" >nul 2>&1
if errorlevel 1 (set "all_ready=false") else (set "backend_ok=1")

:: Check Frontend
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest 'http://localhost:%FRONTEND_PORT%' -TimeoutSec 2 -UseBasicParsing; if($r.StatusCode -eq 200) { exit 0 } } catch {} exit 1" >nul 2>&1
if errorlevel 1 (set "all_ready=false") else (set "frontend_ok=1")

:: Check Whisper
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod 'http://localhost:%WHISPER_PORT%/api/health' -TimeoutSec 2 -UseBasicParsing; if($r.status -eq 'ok') { exit 0 } } catch {} exit 1" >nul 2>&1
if errorlevel 1 (set "all_ready=false") else (set "whisper_ok=1")

:: Check Emotion
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod 'http://localhost:%EMOTION_PORT%/health' -TimeoutSec 2 -UseBasicParsing; if($r -ne $null) { exit 0 } } catch {} exit 1" >nul 2>&1
if errorlevel 1 (set "all_ready=false") else (set "emotion_ok=1")

if "!all_ready!"=="true" goto all_ready

set /a retries+=1
if !retries!==10 echo   Compiling TypeScript, please wait...
if !retries!==30 echo   Still compiling...
if !retries!==60 echo   Waited 1 minute, services starting in background...
if !retries!==90 echo   Almost ready...
if !retries! gtr 120 (
    echo.
    echo ========================================
    echo   Startup Status:
    echo ========================================
    if defined backend_ok (echo   [OK] Backend API: http://localhost:%BACKEND_PORT%) else (echo   [--] Backend API: NOT ready)
    if defined frontend_ok (echo   [OK] Frontend: http://localhost:%FRONTEND_PORT%) else (echo   [--] Frontend: NOT ready)
    if defined whisper_ok (echo   [OK] Whisper STT: http://localhost:%WHISPER_PORT%) else (echo   [--] Whisper STT: NOT ready)
    if defined emotion_ok (echo   [OK] Emotion Svc: http://localhost:%EMOTION_PORT%) else (echo   [--] Emotion Svc: NOT ready)
    echo.
    echo   Services are starting in background windows.
    echo   Check each window for logs if any service failed.
    goto :generate_stop
)

timeout /t 1 >nul
goto check_loop

:all_ready
echo   [OK] All services ready!

:generate_stop
:: Generate stop-all.bat
echo.
echo Generating stop-all.bat...
(
echo @echo off
echo chcp 65001 ^>nul
echo echo Stopping all AI Companion services...
echo taskkill /FI "WINDOWTITLE eq %TITLE_BACKEND%" /T /F ^>nul 2^>^&1
echo taskkill /FI "WINDOWTITLE eq %TITLE_FRONTEND%" /T /F ^>nul 2^>^&1
echo taskkill /FI "WINDOWTITLE eq %TITLE_WHISPER%" /T /F ^>nul 2^>^&1
echo taskkill /FI "WINDOWTITLE eq %TITLE_EMOTION%" /T /F ^>nul 2^>^&1
echo taskkill /IM node.exe /F ^>nul 2^>^&1
echo taskkill /IM python.exe /F ^>nul 2^>^&1
echo for %%%%p in ^(%BACKEND_PORT% %FRONTEND_PORT% %WHISPER_PORT% %EMOTION_PORT%^) do ^(
echo     for /f "tokens=5" %%%%a in ^('netstat -ano ^^^| findstr /C:"/:%%%p "' ^^) do ^(
echo         taskkill /F /PID %%%%a ^>nul 2^>^&1
echo     ^)
echo ^)
echo echo All services stopped.
echo pause
) > "%PROJECT_ROOT%\stop-all.bat"

echo.
echo ========================================
echo   ALL SERVICES READY!
echo ========================================
echo.
echo   Frontend:    http://localhost:%FRONTEND_PORT%
echo   Backend API: http://localhost:%BACKEND_PORT%
echo   STT Service: http://localhost:%WHISPER_PORT%
echo   Emotion Svc: http://localhost:%EMOTION_PORT%
echo.
echo   Stop services: stop-all.bat
echo   Debug: check each window for logs
echo.

:: Open frontend in browser
start http://localhost:%FRONTEND_PORT%

echo Press any key to close this window ^(services keep running^)...
pause >nul
