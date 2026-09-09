@echo off
REM ============================================
REM   FunASR 本地服务启动脚本
REM   使用 Docker 运行 FunASR 服务端
REM   默认端口：10095
REM ============================================

echo.
echo   ========================================
echo    FunASR 本地语音识别服务启动器
echo   ========================================
echo.

REM 检查 Docker 是否安装
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo   [错误] Docker 未安装或未启动！
    echo.
    echo   请先安装 Docker Desktop:
    echo   https://www.docker.com/products/docker-desktop
    echo.
    echo   或者使用 Python 方式启动（见下方说明）:
    echo   python tools/funasr_server.py
    echo.
    pause
    exit /b 1
)

echo   [检查] Docker 已就绪
echo.

REM 设置默认参数
set FUNASR_PORT=10095
set FUNASR_MODEL=paraformer-zh
set FUNASR_VAD_MODEL=fsmpc-vad
set FUNASR_PUNC_MODEL=ct-punc

REM 检查是否已有 FunASR 容器在运行
docker ps --filter "name=funasr-server" --format "{{.Names}}" | findstr /x "funasr-server" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [提示] FunASR 服务已在运行中
    echo.
    echo   服务地址: http://localhost:%FUNASR_PORT%
    echo.
    echo   停止服务: docker stop funasr-server
    echo   查看日志: docker logs funasr-server
    echo.
    pause
    exit /b 0
)

echo   [启动] 正在启动 FunASR 服务...
echo   [信息] 模型: %FUNASR_MODEL%
echo   [信息] 端口: %FUNASR_PORT%
echo.
echo   首次启动需要下载模型，请耐心等待...
echo.

REM 运行 FunASR Docker 容器
docker run -d ^
  --name funasr-server ^
  --gpus all ^
  -p %FUNASR_PORT%:%FUNASR_PORT% ^
  -e FUNASR_PORT=%FUNASR_PORT% ^
  -e MODEL_DIR=/workspace/models ^
  -v "%~dp0models":/workspace/models ^
  registry.cn-hangzhou.aliyuncs.com/funasr_repo/funasr:funasr-runtime-sdk-online-cpu-0.1.12 ^
  /bin/bash -c "cd /workspace/FunASR/runtime && nohup bash run_server.sh --download-model-dir /workspace/models --vad-dir %FUNASR_VAD_MODEL% --model-dir %FUNASR_MODEL% --punc-dir %FUNASR_PUNC_MODEL% --hotword /workspace/models/hotwords.txt --certfile 0"

if %errorlevel% neq 0 (
    echo.
    echo   [错误] Docker 容器启动失败！
    echo.
    echo   尝试使用 CPU 模式启动...
    echo.
    docker rm funasr-server >nul 2>&1

    docker run -d ^
      --name funasr-server ^
      -p %FUNASR_PORT%:%FUNASR_PORT% ^
      -e FUNASR_PORT=%FUNASR_PORT% ^
      -e MODEL_DIR=/workspace/models ^
      -v "%~dp0models":/workspace/models ^
      registry.cn-hangzhou.aliyuncs.com/funasr_repo/funasr:funasr-runtime-sdk-online-cpu-0.1.12 ^
      /bin/bash -c "cd /workspace/FunASR/runtime && nohup bash run_server.sh --download-model-dir /workspace/models --vad-dir %FUNASR_VAD_MODEL% --model-dir %FUNASR_MODEL% --punc-dir %FUNASR_PUNC_MODEL% --hotword /workspace/models/hotwords.txt --certfile 0"

    if %errorlevel% neq 0 (
        echo   [错误] CPU 模式启动也失败了
        echo   请检查 Docker 是否正常运行
        pause
        exit /b 1
    )
)

echo.
echo   ========================================
echo    FunASR 服务已启动！
echo   ========================================
echo.
echo   服务地址: http://localhost:%FUNASR_PORT%
echo   API 端点: http://localhost:%FUNASR_PORT%/api/asr
echo.
echo   常用命令:
echo     查看日志: docker logs -f funasr-server
echo     停止服务: docker stop funasr-server
echo     重启服务: docker restart funasr-server
echo     删除容器: docker rm -f funasr-server
echo.
echo   等待模型加载完成（约30秒-2分钟）...
echo   可以通过以下命令查看加载进度:
echo     docker logs -f funasr-server
echo.

pause
