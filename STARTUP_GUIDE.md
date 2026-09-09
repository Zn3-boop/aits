# AI Companion System - 启动说明

## 一键启动

运行项目根目录下的 `start-all.bat` 即可启动所有服务。

```bash
D:\aits.copy22\start-all.bat
```

## 启动脚本功能

`start-all.bat` 会自动执行以下操作：

### 1. 环境检查
- ✅ 检查 Python 是否安装
- ✅ 检查 pnpm 是否安装（如果没有自动安装）
- ✅ 检查 Node.js 依赖是否完整

### 2. 依赖安装
- **Node.js**: 使用 pnpm 安装所有前端和后端依赖
- **Python**: 在 `.venv` 虚拟环境中安装以下包：
  - `faster-whisper` - 语音识别
  - `edge-tts` - 微软语音合成
  - `uvicorn` - ASGI 服务器
  - `fastapi` - Web 框架
  - `mediapipe` - 人脸表情检测
  - `opencv-python` - 图像处理
  - `numpy` - 数值计算

### 3. 模型下载
- 自动下载 MediaPipe FaceLandmarker 模型到 `tools/emotion_service/models/` 目录

### 4. 服务启动
脚本会启动 4 个独立服务（每个在单独的窗口中）：

| 服务 | 端口 | 说明 |
|------|------|------|
| **Backend API** | 8787 | Fastify 后端服务 |
| **Frontend** | 5174 | React 前端界面 |
| **STT Service** | 10095 | Faster-Whisper 语音识别 |
| **Emotion Service** | 10096 | MediaPipe 情绪检测 |

### 5. 健康检查
- 最多等待 120 秒让所有服务就绪
- 实时显示每个服务的启动状态

### 6. 自动生成
- 自动创建 `stop-all.bat` 用于停止所有服务

## 访问地址

启动成功后：
- **前端界面**: http://localhost:5174
- **后端 API**: http://localhost:8787
- **语音识别**: http://localhost:10095
- **情绪服务**: http://localhost:10096

## 停止服务

运行 `stop-all.bat` 或关闭对应的命令行窗口。

## 常见问题

### Q: 启动时提示 Python 未找到
**A:** 请先安装 Python 3.8+：https://www.python.org/downloads/

### Q: pnpm 安装失败
**A:** 确保 npm 可用，可以手动运行 `npm install -g pnpm`

### Q: Python 包安装超时
**A:** 脚本会自动尝试多个国内镜像源（清华、百度、中科大），如果仍失败请检查网络连接。

### Q: 模型下载失败
**A:** 可以手动下载：
1. 访问 https://developers.google.com/mediapipe/samples/vision#face_landmarker
2. 下载 `face_landmarker.task` 文件
3. 放置到 `tools/emotion_service/models/` 目录

### Q: 前端端口被占用
**A:** 修改 `start-all.bat` 中的 `FRONTEND_PORT` 变量为其他端口（如 5175）

## 配置说明

编辑 `.env` 文件可以配置：

```env
# 前端配置
VITE_API_BASE_URL=http://localhost:8787
VITE_WS_BASE_URL=ws://localhost:8787

# 后端配置
PORT=8787
CORS_ORIGIN=http://localhost:5174

# LLM 配置（需要 Ollama）
MODEL_PROVIDER=ollama
MODEL_BASE_URL=http://localhost:11434
MODEL_NAME=qwen2.5:7b

# 语音服务
WHISPER_URL=http://localhost:10095

# 情绪服务
EMOTION_SERVICE_URL=http://localhost:10096
```

## Ollama 配置（可选）

如果需要 AI 对话功能，需要安装并运行 Ollama：

```bash
# 安装 Ollama
winget install Ollama.Ollama

# 启动 Ollama 服务
ollama serve

# 下载模型
ollama pull qwen2.5:7b
```

## 目录结构

```
aits.copy22/
├── apps/
│   ├── server/        # 后端服务
│   └── web/          # 前端应用
├── packages/         # 共享包
├── tools/
│   ├── faster-whisper-server.py  # 语音识别服务
│   └── emotion_service/          # 情绪检测服务
├── scripts/
│   └── install-stt-windows.bat  # STT 安装脚本
├── .venv/            # Python 虚拟环境
├── start-all.bat      # ⭐ 一键启动脚本
├── stop-all.bat       # 停止所有服务
└── .env               # 环境配置
```

## 技术栈

- **前端**: React + Vite + TypeScript + Zustand
- **后端**: Fastify + Prisma + PostgreSQL
- **语音识别**: Faster-Whisper
- **语音合成**: Microsoft Edge TTS
- **情绪检测**: MediaPipe FaceLandmarker
- **包管理**: pnpm + npm workspaces
