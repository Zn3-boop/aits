# Emotion Inference Service

服务端情绪推理服务 - 使用 MediaPipe FaceLandmarker 进行实时情绪检测。

## 架构

```
┌─────────────┐     JPEG 帧      ┌─────────────────────┐
│   浏览器     │  ────────────>   │  Python 推理服务     │
│  (React)    │  WebSocket      │  FastAPI + MediaPipe│
│             │                  │  Port: 10096       │
│             │  <─────────────  │  • 接收JPEG帧        │
│             │    JSON结果        │  • 推理情绪/blendshapes│
└─────────────┘                  └─────────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
cd tools/emotion_service
pip install -r requirements.txt
```

### 2. 下载模型文件

下载 `face_landmarker.task` 并放置到 `models/` 目录：

- 下载地址: https://developers.google.com/mediapipe/samples/vision#face_landmarker
- 模型大小: 约 30MB

### 3. 启动服务

```bash
# Windows
start.bat

# Linux/Mac
python main.py
```

服务将在 `http://localhost:10096` 启动。

### 4. 验证服务

```bash
curl http://localhost:10096/health
```

响应:
```json
{
  "status": "ok",
  "model_loaded": true,
  "mediapipe_available": true
}
```

## WebSocket API

### 连接端点

```
ws://localhost:10096/ws/emotion/{session_id}
```

### 发送数据

发送 JPEG 二进制数据（图像帧）。

### 接收数据

```json
{
  "type": "emotion_update",
  "session_id": "user123",
  "frame_count": 42,
  "has_face": true,
  "emotion": "happy",
  "confidence": 0.92,
  "all_scores": {
    "happy": 0.92,
    "sad": 0.05,
    "surprised": 0.02,
    "neutral": 0.01
  },
  "blendshapes": {
    "mouthSmile_L": 0.85,
    "mouthSmile_R": 0.82,
    "cheekPuff": 0.45
  }
}
```

## 前端集成

```typescript
import { useServerEmotion } from '../hooks/useServerEmotion';

// 使用
const { isConnected, lastEmotion } = useServerEmotion({
  sessionId: 'user123',
  enabled: true,
  fps: 10,
  quality: 0.5,
});

// 监听全局事件
window.addEventListener('user-emotion-detected', (event) => {
  const { emotion, confidence, blendshapes } = event.detail;
  console.log('User emotion:', emotion, confidence);
});
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 10096 | 服务端口 |

## Mock 模式

如果 MediaPipe 不可用，服务将以 Mock 模式运行，返回模拟的情绪数据用于测试。

## 性能优化

- 降低分辨率: 320x240
- 降低质量: quality = 0.4
- 降低帧率: fps = 5
- 使用 GPU: 确保 CUDA 环境可用

## 项目结构

```
tools/emotion_service/
├── main.py              # FastAPI 应用
├── requirements.txt      # 依赖
├── models/              # 模型文件目录
│   └── face_landmarker.task
└── README.md
```
