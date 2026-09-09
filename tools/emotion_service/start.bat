@echo off
REM Emotion Service Startup Script

echo ========================================
echo  Emotion Inference Service Starter
echo ========================================

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python not found. Please install Python 3.8+
    pause
    exit /b 1
)

REM Install dependencies if needed
echo.
echo [1/3] Checking dependencies...
pip show mediapipe >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    pip install -r requirements.txt
)

REM Create models directory
if not exist "models" mkdir models

REM Download model if needed
if not exist "models\face_landmarker.task" (
    echo.
    echo [2/3] Model file not found at models/face_landmarker.task
    echo Download from: https://developers.google.com/mediapipe/samples/vision#face_landmarker
    echo Place it in tools/emotion_service/models/
)

REM Start service
echo.
echo [3/3] Starting Emotion Service on port 10096...
echo Press Ctrl+C to stop
echo.

cd /d "%~dp0"
python main.py

pause
