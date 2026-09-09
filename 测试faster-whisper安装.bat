@echo off
chcp 65001 > nul
echo ========================================
echo   Faster-Whisper 安装验证脚本
echo ========================================
echo.

echo [1/4] 检查 Python 环境...
python --version
if errorlevel 1 (
    echo ❌ Python 未安装或未添加到 PATH
    pause
    exit /b 1
)
echo ✅ Python 正常
echo.

echo [2/4] 检查虚拟环境...
if not exist ".venv\Scripts\python.exe" (
    echo ❌ 虚拟环境 .venv 未找到
    pause
    exit /b 1
)
echo ✅ 虚拟环境存在
echo.

echo [3/4] 激活虚拟环境并检查 faster-whisper...
call .venv\Scripts\Activate.ps1 > nul 2>&1
python -c "import faster_whisper; print(f'✅ faster-whisper 版本: {faster_whisper.__version__}')"
if errorlevel 1 (
    echo ❌ faster-whisper 未安装
    echo.
    echo 正在安装 faster-whisper...
    pip install faster-whisper -i https://pypi.tuna.tsinghua.edu.cn/simple --default-timeout=300
    if errorlevel 1 (
        echo ❌ 安装失败
        pause
        exit /b 1
    )
    echo ✅ 安装完成
)
echo.

echo [4/4] 测试 WhisperModel 导入...
python -c "from faster_whisper import WhisperModel; print('✅ WhisperModel 导入成功')"
if errorlevel 1 (
    echo ❌ WhisperModel 导入失败
    pause
    exit /b 1
)
echo.

echo ========================================
echo   ✅ 所有检查通过！
echo ========================================
echo.
echo 📋 提示：
echo    - faster-whisper 已成功安装
echo    - 启动语音服务：python tools\faster-whisper-server.py
echo    - 查看详细文档：重要文件_请勿删除_faster-whisper说明.md
echo.
pause
