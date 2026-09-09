# VAD 语音监听功能使用说明

## 🎤 功能概述

本项目实现了 **VAD (Voice Activity Detection)** 语音活动检测功能，配合 WebSocket 实现持续的语音监听。

### 核心特性

1. **持续 WebSocket 连接**
   - 与传统的一次性请求不同，WebSocket 保持长连接
   - 自动重连机制，连接断开后 5 秒自动重试
   - 定期发送 ping 保活，每 10 秒一次

2. **VAD 语音活动检测**
   - 实时检测麦克风音频能量
   - 检测到语音时自动识别
   - 静音 1.5 秒后自动完成当前识别
   - 识别完成后自动重新开始监听

3. **实时反馈**
   - 中间结果实时显示 (interim)
   - 最终结果确认 (final)
   - 说话/静音状态实时显示

## 🚀 启动方式

### 方法 1：使用专用启动脚本（推荐）

```powershell
cd "d:\aits.copy1 - 副本 (2)"
.\start-voice-vad.ps1
```

这将自动：
- 启动 Ollama（如果未运行）
- 启动 Faster-Whisper（如果未运行）
- 启动后端服务 (端口 8787)
- 启动前端服务 (端口 5174)
- 建立 WebSocket VAD 监听连接

### 方法 2：手动启动

```powershell
# 终端 1：后端
cd "d:\aits.copy1 - 副本 (2)"
pnpm --filter @lpm/server dev

# 终端 2：前端
cd "d:\aits.copy1 - 副本 (2)"
pnpm --filter @lpm/web dev
```

然后在前端界面点击语音按钮开始 VAD 监听。

## 📡 WebSocket 协议

### 连接地址
```
ws://localhost:8787/api/stt/ws
```

### 消息格式

#### 前端 → 后端

```json
// 开始监听
{"type": "start"}

// 停止监听
{"type": "stop"}

// 保活 ping
{"type": "ping"}

// 音频数据（二进制）
<Uint8Array>
```

#### 后端 → 前端

```json
// 连接成功
{"type": "connected", "sessionId": "xxx"}

// 就绪确认
{"type": "ready", "sessionId": "xxx", "whisperUrl": "http://..."}

// 中间结果
{"type": "interim", "text": "正在说的内容...", "sessionId": "xxx"}

// 最终结果
{"type": "final", "text": "最终识别的文字", "sessionId": "xxx"}

// 错误
{"type": "error", "message": "错误信息"}
```

## ⚙️ VAD 参数配置

在 `apps/web/src/hooks/useVoiceInputVAD.ts` 中可以调整：

```typescript
const DEFAULT_CONFIG = {
  silenceThreshold: 0.015,    // 静音阈值 (0-1)，越小越敏感
  silenceDuration: 1500,     // 静音持续多久才停止 (ms)
  minSpeechDuration: 300,    // 最小说话时长 (ms)
  maxSilenceCount: 3,       // 最大静音次数（超过后暂停）
};
```

## 🔧 故障排查

### WebSocket 连接失败

1. 检查后端是否运行：`curl http://localhost:8787/health`
2. 检查端口是否被占用：`netstat -ano | findstr 8787`
3. 查看后端日志是否有错误

### VAD 无法识别

1. 检查麦克风权限
2. 检查 Faster-Whisper 是否运行：`curl http://localhost:10095/api/health`
3. 查看浏览器控制台错误信息

### 连接频繁断开

1. 检查网络稳定性
2. 调整 WebSocket ping 间隔
3. 检查防火墙设置

## 📝 注意事项

1. **麦克风权限**：首次使用需要授权麦克风权限
2. **CORS 设置**：确保后端 CORS 配置允许前端域名
3. **Whisper 服务**：确保 Faster-Whisper 服务已启动并正常工作
4. **音频格式**：前端发送 webm/opus 格式音频，后端自动转换处理

## 🔄 与传统语音识别的区别

| 特性 | 传统语音识别 | VAD + WebSocket |
|------|-------------|-----------------|
| 连接方式 | HTTP 请求 | WebSocket 长连接 |
| 延迟 | 整段上传后识别 | 实时流式识别 |
| 监听方式 | 需要手动触发 | 持续监听 |
| 状态保持 | 无状态 | 保持会话状态 |
| 资源占用 | 每次新建连接 | 复用连接 |

## 🎯 使用场景

- ✅ 实时对话助手
- ✅ 语音命令控制
- ✅ 会议记录助手
- ✅ 语音笔记应用
- ✅ 智能客服机器人

---

如有问题，请查看控制台日志或联系开发者。
