@echo off
REM Windows 批处理脚本 - 一键安装 faster-whisper
REM 用于解决网络超时和安装问题

echo 🎙️  AI语音识别模块安装向导
echo ================================================

REM 检查Python是否安装
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python 未找到，请先安装Python 3.8+
    pause
    exit /b 1
)

echo ✅ Python 已找到
echo.

REM 检查是否在正确的目录
if not exist "package.json" (
    echo ⚠️  警告：未在项目根目录运行
    echo 当前目录：%cd%
    echo 请切换到 apps\server 目录后再运行此脚本
    pause
    exit /b 1
)

echo 📦 正在升级 pip...
python -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple
if %errorlevel% neq 0 (
    echo ❌ pip 升级失败
    pause
    exit /b 1
)
echo ✅ pip 升级完成
echo.

echo 🔧 正在安装 faster-whisper...
echo 请耐心等待，首次安装可能需要几分钟...

:attempt_install
pip install faster-whisper --default-timeout=300 -i https://pypi.tuna.tsinghua.edu.cn/simple --no-cache-dir
if %errorlevel% neq 0 (
    echo 尝试备用镜像源...
    pip install faster-whisper --default-timeout=300 -i https://mirror.baidu.com/pypi/simple --no-cache-dir
    if %errorlevel% neq 0 (
        echo 尝试中科大镜像源...
        pip install faster-whisper --default-timeout=300 -i https://pypi.mirrors.ustc.edu.cn/simple/ --no-cache-dir
        if %errorlevel% neq 0 (
            echo ❌ 所有镜像源安装失败
            echo.
            echo 💡 建议尝试以下方法：
            echo 1. 检查网络连接
            echo 2. 使用管理员权限运行此脚本
            echo 3. 查看 docs\stt-installation-guide.md 获取更多帮助
            pause
            exit /b 1
        )
    )
)

echo ✅ faster-whisper 安装成功！
echo.

echo 🧪 正在验证安装...
python -c "import faster_whisper; print('faster-whisper 版本:', faster_whisper.__version__)"
if %errorlevel% neq 0 (
    echo ❌ 验证失败
    pause
    exit /b 1
)
echo ✅ 安装验证成功
echo.

echo 🌟 语音识别模块安装完成！
echo.
echo 💡 提示：
echo   • 首次使用会自动下载模型文件
echo   • 可以在 .env 文件中配置 STT_MODEL_SIZE 选择模型大小
echo   • 详情请查看 docs\stt-installation-guide.md
echo.
echo 🚀 现在可以启动服务器体验语音识别功能了！

pause