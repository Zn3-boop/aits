# LPM AI Companion - 代码审查清单

## 🔥 核心必读文件（面试重点）

### 1. Live2DPage.tsx ⭐⭐⭐⭐⭐
**路径**: `apps/web/src/pages/Live2DPage.tsx`
**为什么重要**: 今天修复的 bug 所在，理解 React useEffect 依赖项问题

**需要理解**:
- useEffect 依赖项 `[modelPath, retryToken, defaultMotion]` 为什么没有 `defaultExpression`
- 为什么移除 `defaultExpression` 能避免 Live2D 重新加载
- `driveEmotion()` 和 `playMotion()` 的区别
- 事件监听 `ai-emotion-change` 如何工作

**面试问题**:
> "你遇到过 React useEffect 依赖项导致的问题吗？你是怎么解决的？"

---

### 2. driver.ts ⭐⭐⭐⭐⭐
**路径**: `apps/web/src/features/live2d-driver/driver.ts`
**为什么重要**: Live2D 渲染核心，理解 WebGL 和图形渲染

**需要理解**:
- PIXI.Application 如何初始化
- Live2DModel.from() 加载模型
- driveEmotion() 如何驱动表情参数
- ResizeObserver 响应式适配

**面试问题**:
> "WebGL 渲染的原理是什么？React 中如何集成 WebGL？"

---

### 3. PersonaDetailPage.tsx ⭐⭐⭐⭐
**路径**: `apps/web/src/pages/PersonaDetailPage.tsx`
**为什么重要**: 理解事件驱动架构和 React Hooks 高级用法

**需要理解**:
- sendMessage() 发送消息流程
- 流式响应处理 (SSE)
- 情绪变化如何触发 Live2D 更新
- useChatStream hook 的使用

**面试问题**:
> "React 中如何实现组件间通信？事件驱动有什么优势？"

---

## 📚 理解架构文件

### 4. apps/server/src/index.ts ⭐⭐⭐
**为什么重要**: 后端入口，理解 Fastify 框架

**需要理解**:
- Fastify 实例创建和配置
- CORS 跨域配置
- 路由注册方式
- 中间件使用

---

### 5. apps/web/src/routes.tsx ⭐⭐⭐
**为什么重要**: 前端路由，理解 React Router

**需要理解**:
- 路由配置结构
- lazy 路由懒加载
- 各页面的路由映射

---

### 6. packages/shared/src/types/index.ts ⭐⭐
**为什么重要**: 共享类型定义

**需要理解**:
- Persona 类型结构
- Message 类型定义
- API 请求/响应类型

---

## ⚙️ 核心技术文件

### 7. TTS 语音合成 ⭐⭐⭐
**文件**: `apps/server/src/routes/tts.ts`

**技术栈**: Microsoft Edge TTS（Python edge_tts 包）

**需要理解**:
- 直接调用 `python -m edge_tts` 命令
- 支持多语言自动检测（中/日/韩/英）
- 返回 MP3 音频文件
- 临时文件处理和清理

**面试问题**:
> "你们的 TTS 用的是什么方案？有什么优缺点？"

**回答模板**:
> "我们用的是 Microsoft Edge TTS，通过 Python 的 edge_tts 包调用。这个方案的优势是：
> 1. 免费使用，无需 API Key
> 2. 语音质量高，支持多种语言
> 3. 延迟低，适合实时对话
>
> 缺点是依赖网络（调用微软服务）和服务器性能（需要运行 Python 进程）。"

---

### 8. STT 语音识别 ⭐⭐⭐
**文件**: 
- `apps/web/src/hooks/useWhisperStream.ts`
- `tools/faster-whisper-server.py`

**技术栈**: Faster-Whisper

**需要理解**:
- WebRTC 录音采集
- 发送音频到 Whisper 服务
- 流式转写返回

---

### 9. LLM 适配器 ⭐⭐⭐
**文件**:
- `apps/server/src/adapters/llm/ollama.adapter.ts`
- `apps/server/src/services/llm/index.ts`

**需要理解**:
- 流式响应处理
- Ollama API 调用
- 模型选择逻辑

---

### 10. prisma/schema.prisma ⭐⭐
**为什么重要**: 数据库模型定义

**需要理解**:
- Persona 和 Memory 关系
- @default 自动生成 ID
- @relation 一对多关系

---

## 📖 阅读顺序建议

```
1. 先看 types/index.ts      → 了解数据结构
2. 看 routes.tsx           → 了解页面路由
3. 看 Live2DPage.tsx       → 理解核心渲染
4. 看 driver.ts            → 理解图形渲染
5. 看 PersonaDetailPage    → 理解业务逻辑
6. 看 server/index.ts      → 理解后端架构
7. 看 tts.ts              → 理解语音合成（Edge TTS）
```

---

## 🎯 每个文件需要回答的问题

### Live2DPage.tsx
- [ ] 为什么 useEffect 依赖项要去掉 `defaultExpression`？
- [ ] `driveEmotion` 和 `playMotion` 有什么区别？
- [ ] 事件监听如何清理？（useEffect return）

### driver.ts
- [ ] PIXI.Application 的作用是什么？
- [ ] 如何实现响应式 resize？
- [ ] 情绪配置（emotionParams）如何工作？

### PersonaDetailPage.tsx
- [ ] 流式响应如何解析 SSE 数据？
- [ ] 如何从 AI 回复中提取情绪？
- [ ] 为什么需要自定义事件而非直接调用？

### tts.ts
- [ ] Edge TTS 的调用流程是什么？
- [ ] 如何自动检测语言选择语音？
- [ ] 临时文件如何管理？

### server/index.ts
- [ ] Fastify 和 Express 的区别？
- [ ] CORS 是什么？为什么要配置？
- [ ] 中间件的执行顺序？

---

## 📝 面试话术模板

### 关于 Live2D bug
```
"我在项目中遇到过一个问题：用户发消息后 Live2D 模型会消失。
原因是我把 defaultExpression 放在了 useEffect 依赖项里，
每次情绪变化都会触发重新初始化。

解决方案是移除这个依赖，情绪变化时只调用 driveEmotion()
方法更新表情参数，而不是重新加载整个模型。

这个经历让我深刻理解了 React 依赖项的作用域问题。"
```

### 关于 TTS 实现
```
"语音合成我们用的是 Microsoft Edge TTS。
后端通过 Node.js 的 child_process 调用 Python 的 edge_tts 包。

具体流程是：
1. 接收前端发送的文本
2. 自动检测语言（日/韩/英/中）
3. 调用 edge_tts 生成 MP3
4. 返回音频给前端播放

这个方案的优势是免费、音质好，缺点是需要网络和 Python 环境。"
```

### 关于事件驱动
```
"Live2D 组件和其他模块是通过自定义事件解耦的。
AI 回复情绪变化时，发送 ai-emotion-change 事件，
Live2D 组件监听这个事件并驱动表情。

这种设计的好处是：
1. 模块间解耦，不需要直接引用
2. 易于扩展新的情绪消费者
3. 符合发布订阅模式"
```

---

## 🎯 项目技术总结

| 功能 | 技术方案 |
|------|----------|
| 前端框架 | React 18 + TypeScript + Vite |
| 后端框架 | Fastify + Prisma |
| 图形渲染 | PIXI.js + pixi-live2d-display |
| 语音合成 | Microsoft Edge TTS (Python) |
| 语音识别 | Faster-Whisper (STT) |
| AI 模型 | Ollama (本地部署) |
| 数据库 | SQLite (开发) |

---

*最后更新: 2026-06-21*
