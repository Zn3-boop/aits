# FunASR/Paraformer 本地部署指南

## 当前状态

✅ **已完成：**
- FunASR 项目已克隆到 `d:\aits.1\tools\FunASR`
- faster-whisper 已安装（更好的 Whisper 实现）

❌ **遇到问题：**
- editdistance 包在 Windows 上编译失败（需要 C++ 编译器）

## 两种方案选择

### 方案 A：使用 faster-whisper（推荐，更简单）

你的环境中已经安装了 faster-whisper，可以直接使用：

```bash
# 测试 faster-whisper
& "d:\aits.1\.venv\Scripts\python.exe" -c "from faster_whisper import WhisperModel; print('faster-whisper OK')"
```

### 方案 B：继续安装 FunASR/Paraformer

需要先解决 editdistance 的编译问题。运行以下命令安装 Microsoft C++ Build Tools：

1. 下载 Visual Studio Build Tools 2022: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
2. 安装时选择 "C++ 生成工具"
3. 然后重新运行：
```bash
& "d:\aits.1\.venv\Scripts\pip.exe" install funasr modelscope torch torchaudio -i https://pypi.tuna.tsinghua.edu.cn/simple
```

## 下一步操作

1. 启动 FastAPI 服务（需要在 FunASR 目录中创建服务脚本）
2. 配置 STT API 路由
3. 测试语音识别

请告诉我你选择哪个方案，我可以继续帮你完成部署。
