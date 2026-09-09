# 问题修复与测试指南

## 修复概览

本指南说明已修复的问题和测试步骤。

---

## 一、已修复的问题

### 1. face-api WASM 404 错误 (`useFaceEmotion.ts`)

**问题**：face-api 模型加载时出现 WASM 404 错误

**修复**：
- 强制使用 WebGL 后端而非 WASM simd
- 动态加载 face-api CDN 脚本
- 优化模型路径配置

**测试步骤**：
1. 打开浏览器开发者工具 (F12)
2. 访问任意聊天页面
3. 点击开启摄像头按钮
4. 检查 Console：
   - ✅ 应显示 `[useFaceEmotion] tfjs backend: webgl`
   - ✅ 应显示 `[useFaceEmotion] Model loaded`
5. 对着摄像头做表情，检查情绪是否识别

### 2. Live2D WebGL 上下文 null (`driver.ts`)

**问题**：WebGL 上下文初始化失败，模型无法显示

**修复**：
- 添加 WebGL 支持检测
- 确保 canvas 有实际像素尺寸
- 主动释放 WebGL 上下文避免泄露

**测试步骤**：
1. 访问 `/live2d` 页面
2. 上传一个 Live2D 模型 .zip 文件
3. 检查模型是否正常显示
4. 切换不同模型，检查是否正常切换
5. 打开/关闭多次，检查是否崩溃

### 3. StagePreview 生命周期互炸 (`Live2DPage.tsx`)

**问题**：多个 StagePreview 实例共享全局单例导致冲突

**修复**：
- 每个 StagePreview 使用独立的 `createLive2DDriver()` 实例
- 不再依赖全局 `initLive2D()` 单例
- 组件卸载时正确清理自己的资源

**测试步骤**：
1. 在 Live2D 页面选择一个模型
2. 快速切换到其他页面再回来
3. 检查模型是否正常显示
4. 同时打开多个标签页，检查是否互不影响

### 4. 声音问题 (`unified-voice.ts`)

**问题**：语音无法播放，可能是 API 端点配置错误或自动播放被阻止

**修复**：
- 创建统一的语音服务 `UnifiedVoiceService`
- 自动检测 API 端点（开发/生产环境兼容）
- 添加 AudioContext 初始化解决自动播放限制
- 支持 Edge TTS 和 Web Speech API fallback

**测试步骤**：
1. 访问任意聊天页面
2. 发送一条消息给 AI
3. 等待 AI 回复并播放语音
4. 检查是否有声音输出
5. 如果无声音，检查：
   - F12 Console 是否有 `[UnifiedVoice] Auto-play blocked` 警告
   - 如有警告，点击页面任意位置触发播放

---

## 二、新增功能

### 1. MediaPipe 采集 (`useMediaPipeFeatures.ts`)

**功能**：高精度面部/手势追踪

**使用方式**：
```typescript
import { useMediaPipeFeatures } from './features/face-tracking';

const { faceLandmarker, handLandmarker } = useMediaPipeFeatures();
```

### 2. LLM 决策层 (`personas-chat.ts`)

**功能**：基于 AI 情绪/意图分析的智能回复决策

**使用方式**：
```typescript
import { createPersonasChat } from './features/conversation';

const chat = createPersonasChat({
  personaId: 'xxx',
  onEmotionDetected: (emotion) => { ... },
  onDecisionMade: (decision) => { ... },
});
```

### 3. 精准口型同步

**功能**：基于 viseme 的实时口型动画

**配置**：在 `driver.ts` 的 `speak()` 方法中传入 visemes 数组

---

## 三、测试检查清单

### 基础功能
- [ ] Live2D 模型加载正常
- [ ] 情绪识别（face-api）正常工作
- [ ] 语音合成（TTS）正常工作
- [ ] 语音播放正常
- [ ] 口型同步正常

### 边缘情况
- [ ] 快速切换页面不崩溃
- [ ] 多标签页同时运行正常
- [ ] 摄像头权限拒绝时显示友好提示
- [ ] 网络异常时显示友好提示
- [ ] 模型加载失败时显示重试按钮

### 性能
- [ ] Live2D 帧率稳定在 30fps+
- [ ] 情绪识别延迟 < 500ms
- [ ] 语音合成延迟 < 2s

---

## 四、已知限制

1. **Live2D 模型**：需要 .model3.json 格式的 Cubism 4 模型
2. **情绪识别**：需要 HTTPS 或 localhost 环境
3. **语音**：Edge TTS 需要后端服务运行

---

## 五、快速诊断

如果遇到问题，运行以下命令检查：

```bash
# 检查后端服务
curl http://localhost:8787/api/health

# 检查 TTS 服务
curl -X POST http://localhost:8787/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"测试","voice":"zh-CN-XiaoxiaoNeural"}'

# 检查 STT 服务
curl http://localhost:8787/api/stt/health
```
