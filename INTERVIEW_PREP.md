# LPM AI Companion System - 面试准备文档

## 一、项目概述

### 1.1 核心功能
- **Live2D 虚拟形象**：AI 角色以 2D 动画形象呈现，支持情绪驱动、面部追踪
- **语音对话**：Edge TTS 语音合成 + Faster-Whisper 语音识别，支持实时语音交互
- **AI 对话**：基于 Ollama 的智能对话系统，支持流式响应
- **记忆系统**：角色独立记忆、长期记忆管理
- **多角色管理**：创建、编辑、绑定 Live2D 模型的角色系统

### 1.2 技术栈
| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + React Router |
| 后端 | Node.js + Fastify + Prisma |
| AI | Ollama + Faster-Whisper + Microsoft Edge TTS |
| 图形 | PIXI.js + pixi-live2d-display |
| 数据库 | SQLite (开发) |

---

## 二、架构设计

### 2.1 整体架构图
```
┌─────────────────────────────────────────────────────────────┐
│                      前端 (apps/web)                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐   │
│  │ Live2D  │  │  Chat   │  │ Voice   │  │  Persona   │   │
│  │ 渲染层  │  │  对话层  │  │ 语音层  │  │  角色管理  │   │
│  └────┬────┘  └────┬────┘  └────┬────┘  └──────┬────┘   │
│       └─────────────┴─────────────┴─────────────┘         │
│                         ↓ API 调用                          │
├─────────────────────────────────────────────────────────────┤
│                      后端 (apps/server)                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐   │
│  │ 路由层  │  │ LLM适配 │  │ TTS/STT │  │  数据库层   │   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         ↓
        ┌──────────┬──────────┬──────────┐
        │ Ollama   │ Faster-  │  SQLite  │
        │ (LLM)    │ Whisper  │   (DB)   │
        └──────────┴──────────┴──────────┘
```

### 2.2 Monorepo 结构
```
pnpm-workspace.yaml
├── apps/
│   ├── server/        # 后端服务 (Fastify)
│   └── web/           # 前端应用 (React)
├── packages/
│   ├── shared/        # 共享类型、常量
│   ├── llm-core/      # LLM 核心逻辑
│   ├── live2d-mapper/ # Live2D 映射
│   └── config/         # 配置文件
├── docs/              # 文档
└── tools/             # 工具脚本
```

### 2.3 面试点
- **为什么用 Monorepo？** 共享类型代码、统一版本管理、多项目协同
- **前后端分离**：API RESTful、跨域配置、CORS 处理
- **为什么用 Fastify 而不是 Express？** 更高的性能、更好的 TypeScript 支持、插件系统

---

## 三、核心功能实现

### 3.1 Live2D 渲染系统

#### 关键文件
- `apps/web/src/features/live2d-driver/driver.ts` - Live2D 驱动核心
- `apps/web/src/pages/Live2DPage.tsx` - Live2D 页面组件

#### 核心逻辑
```typescript
// 1. 创建 PIXI 应用
const app = new PIXI.Application({
  view: canvas,
  width, height,
  transparent: true,
});

// 2. 加载 Live2D 模型
const model = await Live2DModel.from(modelUrl, { autoInteract: false });
app.stage.addChild(model);

// 3. 驱动表情
model.internal.motionManager.startRandomMotion('Idle');
```

#### 面试点
- **WebGL 渲染**：PIXI.js 基于 WebGL，性能优化策略
- **模型加载**：异步加载、错误处理、重试机制
- **表情映射**：emotion → expression 的转换逻辑

### 3.2 情绪驱动系统

#### 事件流
```
AI 回复 → 解析情绪标签 → 发送 ai-emotion-change 事件 
→ Live2D 驱动接收 → 播放对应表情动作
```

#### 关键代码
```typescript
// 发送情绪事件
window.dispatchEvent(new CustomEvent('ai-emotion-change', {
  detail: { emotion: 'happy', personaId: id }
}));

// 监听并驱动
window.addEventListener('ai-emotion-change', (event) => {
  const { emotion } = event.detail;
  driverRef.current?.driveEmotion(emotion);
});
```

#### 面试点
- **事件驱动架构**：EventEmitter、自定义事件
- **解耦设计**：情绪系统与渲染系统分离
- **React 生命周期**：useEffect + 事件监听 + cleanup

### 3.3 语音合成 (TTS)

#### 技术方案：Microsoft Edge TTS

```typescript
// 直接调用 Python edge_tts 命令
const args = [
  '-m', 'edge_tts',
  '--text', text.trim().substring(0, 500),
  '--voice', voice,  // 如 'zh-CN-XiaoxiaoNeural'
  '--write-media', tempFile,
];
await execAsync(pythonPath, args, { timeout: 30000 });
```

#### 多语言自动检测
```typescript
function selectBestVoice(text: string): string {
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja-JP-NanamiNeural';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko-KR-SunHiNeural';
  return 'zh-CN-XiaoxiaoNeural';
}
```

#### 面试点
- **Edge TTS 优势**：免费、音质好、支持多语言
- **临时文件管理**：用完即删，避免磁盘占用
- **进程调用**：child_process.execFile 安全执行

### 3.4 语音识别 (STT)

#### 技术方案：Faster-Whisper

```
麦克风输入 → WebRTC / MediaRecorder → /api/stt 
→ Faster-Whisper → 返回文字
```

#### 关键文件
- `tools/faster-whisper-server.py` - Whisper 服务
- `apps/web/src/hooks/useWhisperStream.ts` - 前端 Hook

#### 面试点
- **流式识别**：音频分段上传
- **音频格式**：WebM/WAV 转换
- **模型选择**：Whisper 模型大小与精度权衡

---

## 四、React 高级特性

### 4.1 useEffect 依赖项问题 (今天修复的 bug)

#### 问题代码
```typescript
useEffect(() => {
  // 初始化 Live2D
  initLive2D();
}, [modelPath, retryToken, defaultMotion, defaultExpression]); // ❌
```

#### 问题原因
- `defaultExpression` 作为依赖项
- 每次情绪变化触发 `setState`
- 导致 Live2D 组件重新初始化
- 模型销毁并重建，用户看到"消失"

#### 解决方案
```typescript
// 移除 defaultExpression，只在初始化时使用
useEffect(() => {
  initLive2D();
}, [modelPath, retryToken, defaultMotion]); // ✓

// 情绪变化单独处理
const driveEmotion = (emotion: string) => {
  driverRef.current?.driveEmotion(emotion);
};
```

#### 面试点
- **React Hooks 依赖项**：什么时候该加/不该加
- **useEffect 执行时机**：mount/update/unmount
- **ref vs state**：为什么用 ref 存储 driver 实例

### 4.2 React.memo 与性能优化

```typescript
// 避免不必要的重渲染
export const ChatMessage = React.memo(({ message, onSpeak }) => {
  // ...
}, (prev, next) => {
  // 自定义比较逻辑
  return prev.message.id === next.message.id;
});
```

#### 面试点
- **memo vs useMemo vs useCallback**：区别和使用场景
- **React 渲染优化**：减少不必要的 re-render
- **Profiler**：定位性能瓶颈

### 4.3 useRef 使用场景

```typescript
// 1. 存储不需要触发重渲染的值
const driverRef = useRef<Live2DDriver | null>(null);

// 2. 访问 DOM 元素
const canvasRef = useRef<HTMLCanvasElement>(null);

// 3. 存储上一次的值（用于比较）
const prevEmotionRef = useRef<string>('neutral');
```

#### 面试点
- **ref 与 state 的区别**：ref 变化不触发重渲染
- **ref 的正确访问时机**：useEffect / 事件处理函数中
- **useId**：生成稳定的唯一 ID

---

## 五、后端设计

### 5.1 Fastify 路由设计

```typescript
// 模块化路由
const userRoutes = async (fastify) => {
  fastify.get('/users', async (request, reply) => {
    return await fastify.prisma.user.findMany();
  });
};

// 注册路由
app.register(userRoutes, { prefix: '/api' });
```

### 5.2 Prisma ORM

```prisma
// schema.prisma
model Persona {
  id        String   @id @default(cuid())
  name      String
  memory    Memory[]
  modelPath String?
  createdAt DateTime @default(now())
}
```

#### 面试点
- **ORM vs 原生 SQL**：优缺点、适用场景
- **Prisma Client**：类型安全、自动补全
- **数据库迁移**：prisma migrate

### 5.3 中间件设计

```typescript
// 认证中间件
app.addHook('preHandler', async (request, reply) => {
  const token = request.headers.authorization;
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

// 错误处理
app.setErrorHandler((error, request, reply) => {
  logger.error(error);
  reply.code(500).send({ error: error.message });
});
```

---

## 六、常见面试问题

### 6.1 React 相关
1. **React 的 diff 算法是怎么工作的？**
   - 虚拟 DOM、key 的作用、递归比较

2. **useEffect 依赖项怎么选？**
   - 尽量精确、避免过多依赖、警惕闭包陷阱

3. **React 18 有哪些新特性？**
   - Concurrent Mode、Suspense、useTransition

4. **如何避免 React 性能问题？**
   - memo、useCallback、useMemo、代码分割

### 6.2 TypeScript 相关
1. **interface 和 type 的区别？**
   - interface 可扩展、type 更灵活

2. **泛型怎么用？**
   - <T>、约束、默认值

3. **如何处理 any 类型？**
   - unknown、类型守卫、类型断言

### 6.3 工程化相关
1. **Monorepo 的优缺点？**
   - 代码共享、版本统一 / 复杂度增加

2. **pnpm 和 npm/yarn 的区别？**
   - Hardlink、节省空间、更快的安装

3. **Turbo 的作用？**
   - 增量构建、任务调度、缓存

### 6.4 系统设计相关
1. **如何设计一个聊天系统？**
   - WebSocket、轮询、长连接

2. **如何实现流式响应？**
   - SSE、WebSocket、流式读取

3. **如何处理高并发？**
   - 缓存、限流、异步处理

---

## 七、项目亮点总结

### 7.1 技术亮点
- ✅ **情绪驱动 Live2D**：事件驱动架构、松耦合设计
- ✅ **流式 AI 对话**：SSE + Ollama 流式响应
- ✅ **多语言 TTS**：Edge TTS 自动检测语言
- ✅ **本地 STT**：Faster-Whisper 语音识别

### 7.2 架构亮点
- ✅ **Monorepo 管理**：pnpm + Turbo
- ✅ **插件化设计**：LLM 适配器、路由模块化
- ✅ **类型安全**：TypeScript + Prisma 生成类型

### 7.3 可扩展方向
- 视频通话集成
- 更多 AI 模型支持
- 群聊功能
- 插件系统

---

## 八、准备建议

1. **重点掌握**
   - React Hooks 高级用法（useEffect 依赖项）
   - 事件驱动架构
   - 流式响应处理

2. **理解原理**
   - WebGL 渲染基础
   - 流式响应机制（SSE）
   - Edge TTS 调用流程

3. **准备项目问题**
   - 最大的技术挑战？（Live2D bug 修复）
   - 如何优化性能？
   - 遇到过最难 debug 的问题？

4. **准备演示**
   - 启动项目
   - 展示 Live2D 交互
   - 展示语音对话

---

## 九、面试话术模板

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

*文档版本：v2.0*
*最后更新：2026-06-21*
